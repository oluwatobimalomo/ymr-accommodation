import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bookingOrders, bookings } from "@/db/schema";
import { isSameOrigin } from "@/lib/auth/origin";
import { getBookingByReference } from "@/lib/booking/queries";
import { enforcePublicRateLimits, normalizeRateLimitPhone } from "@/lib/auth/public-rate-limit";

function normalizePhone(value: string) {
  return value.replace(/\s+/g, "");
}

async function hasMatchingLookupContact(reference: string, phone: string) {
  const db = getDb();
  // Keep failed known-reference/wrong-phone and unknown-reference requests on the same
  // lightweight query path; only load private booking details after contact verification.
  const [orders, directBookings] = await Promise.all([
    db.select({ bookerPhone: bookingOrders.bookerPhone, giftPhone: bookingOrders.giftRecipientPhone })
      .from(bookingOrders).where(eq(bookingOrders.reference, reference)).limit(1),
    db.select({ bookerPhone: bookings.bookerPhone })
      .from(bookings).where(eq(bookings.reference, reference)).limit(1),
  ]);
  const normalizedPhone = normalizePhone(phone);
  return orders.some((row) => normalizePhone(row.bookerPhone) === normalizedPhone || Boolean(row.giftPhone && normalizePhone(row.giftPhone) === normalizedPhone))
    || directBookings.some((row) => normalizePhone(row.bookerPhone) === normalizedPhone);
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request could not be verified." }, { status: 403, headers: { "Cache-Control": "no-store" } });

  try {
    const body = await request.json() as { ticketId?: unknown; phone?: unknown };
    const ticketId = typeof body.ticketId === "string" ? body.ticketId.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!ticketId || !phone) return NextResponse.json({ error: "Enter your Ticket ID and booking phone number." }, { status: 400, headers: { "Cache-Control": "no-store" } });

    const limits = await enforcePublicRateLimits(request, [
      { scope: "booking-lookup-ip", maxRequests: 30, windowMs: 15 * 60_000 },
      { scope: "booking-lookup-reference", identity: ticketId, bindIdentityToIp: true, maxRequests: 10, windowMs: 15 * 60_000 },
      { scope: "booking-lookup-pair", identity: `${ticketId}:${normalizeRateLimitPhone(phone)}`, bindIdentityToIp: true, maxRequests: 5, windowMs: 15 * 60_000 },
    ]);
    if (!limits.allowed) return NextResponse.json({ error: "Too many attempts. Please wait before trying again." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(limits.retryAfterSeconds) } });

    if (!await hasMatchingLookupContact(ticketId, phone)) {
      return NextResponse.json({ error: "We couldn’t find a booking matching those details." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    const result = await getBookingByReference(ticketId);
    if (!result) return NextResponse.json({ error: "We couldn’t find a booking matching those details." }, { status: 404, headers: { "Cache-Control": "no-store" } });

    return NextResponse.json({
      ticketId: result.booking.reference,
      isGift: result.isGift,
      guestName: result.booking.bookerName,
      lodgeName: result.lodgeName ?? "Accommodation",
      coordinatorName: result.coordinatorName,
      coordinatorPhone: result.coordinatorPhone,
      apartmentName: result.categoryName ?? "",
      amountMinor: result.booking.amountMinor,
      paymentStatus: result.booking.paymentStatus,
      accommodationStatus: result.booking.accommodationStatus,
      createdAt: result.booking.createdAt.toISOString(),
      checkInDate: result.checkInDate,
      checkOutDate: result.checkOutDate,
      occupants: result.occupants.map((occupant) => occupant.name),
      bookerEmail: result.bookerEmail ?? result.booking.bookerEmail,
      bookerPhone: result.booking.bookerPhone,
      items: result.items,
      giftRecipient: result.giftRecipient,
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return NextResponse.json({ error: "We couldn’t check that booking right now. Please try again." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
