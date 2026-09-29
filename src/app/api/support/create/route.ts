import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accommodationCategories, bookingOccupants, bookingOrders, bookings } from "@/db/schema";
import { isSameOrigin } from "@/lib/auth/origin";
import { safeErrorMessage } from "@/lib/safe-error";
import { createTicket } from "@/lib/support/tickets";
import { enforcePublicRateLimits, normalizeRateLimitPhone } from "@/lib/auth/public-rate-limit";

const bookingVerificationError = "We couldn’t verify those booking details. Check the reference and contact information, or leave the reference blank for general support.";
const rateLimitError = "Too many requests. Please wait before sending another message.";
function supportError(request: Request, message: string) {
  return NextResponse.redirect(new URL(`/support?error=${encodeURIComponent(message)}`, request.url), 303);
}

function normalizeName(value: string) { return value.trim().toLowerCase().replace(/\s+/g, " "); }
function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
function normalizePhone(value: string) { return normalizeRateLimitPhone(value); }

function matchesIdentity(candidate: { name: string; email: string; phone: string }, supplied: { name: string; email: string; phone: string }) {
  return Boolean(candidate.name && candidate.email && candidate.phone && supplied.name && supplied.email && supplied.phone)
    && normalizeName(candidate.name) === normalizeName(supplied.name)
    && normalizeEmail(candidate.email) === normalizeEmail(supplied.email)
    && normalizePhone(candidate.phone) === normalizePhone(supplied.phone);
}

async function verifiedBooking(bookingRef: string, supplied: { name: string; email: string; phone: string }) {
  const db = getDb();
  let [order] = await db.select().from(bookingOrders).where(eq(bookingOrders.reference, bookingRef)).limit(1);
  const [direct] = order ? [] : await db.select().from(bookings).where(eq(bookings.reference, bookingRef)).limit(1);
  if (!order && direct?.checkoutOrderId) {
    [order] = await db.select().from(bookingOrders).where(eq(bookingOrders.id, direct.checkoutOrderId)).limit(1);
  }
  const rows = order
    ? await db.select({ booking: bookings, lodgeId: accommodationCategories.lodgeId }).from(bookings).innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId)).where(eq(bookings.checkoutOrderId, order.id)).orderBy(bookings.createdAt)
    : direct
      ? await db.select({ booking: bookings, lodgeId: accommodationCategories.lodgeId }).from(bookings).innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId)).where(eq(bookings.id, direct.id)).limit(1)
      : [];
  if (!rows.length) return null;
  const bookingIds = rows.map((row) => row.booking.id);
  const occupants = await db.select().from(bookingOccupants).where(inArray(bookingOccupants.bookingId, bookingIds));
  const orderContactBookingId = direct && direct.checkoutOrderId === order?.id ? direct.id : rows[0]!.booking.id;
  const contacts = [
    ...rows.map(({ booking }) => ({ name: booking.bookerName, email: booking.bookerEmail, phone: booking.bookerPhone, bookingId: booking.id })),
    ...(order ? [{ name: order.bookerName, email: order.bookerEmail, phone: order.bookerPhone, bookingId: orderContactBookingId }] : []),
    ...(order?.giftRecipientName && order.giftRecipientEmail && order.giftRecipientPhone ? [{ name: order.giftRecipientName, email: order.giftRecipientEmail, phone: order.giftRecipientPhone, bookingId: orderContactBookingId }] : []),
    ...occupants.map((occupant) => ({ name: occupant.name, email: occupant.email, phone: occupant.phone, bookingId: occupant.bookingId })),
  ];
  const match = contacts.find((contact) => matchesIdentity(contact, supplied));
  if (!match) return null;
  const booking = rows.find((row) => row.booking.id === match.bookingId) ?? rows[0]!;
  return { bookingId: booking.booking.id, lodgeId: booking.lodgeId };
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  const form = await request.formData();
  try {
    const bookingRef = String(form.get("bookingReference") ?? "").trim();
    let bookingId: string | undefined;
    let lodgeId = String(form.get("lodgeId") ?? "") || undefined;
    if (bookingRef) {
      const supplied = {
        name: String(form.get("customerName") ?? ""),
        email: String(form.get("customerEmail") ?? ""),
        phone: String(form.get("customerPhone") ?? ""),
      };
      const limits = await enforcePublicRateLimits(request, [
        { scope: "support-ticket-ip", maxRequests: 10, windowMs: 60 * 60_000 },
        { scope: "support-ticket-email", identity: normalizeEmail(supplied.email), bindIdentityToIp: true, maxRequests: 5, windowMs: 60 * 60_000 },
      ]);
      if (!limits.allowed) return supportError(request, rateLimitError);
      const booking = await verifiedBooking(bookingRef, supplied);
      if (!booking) return supportError(request, bookingVerificationError);
      bookingId = booking.bookingId;
      lodgeId = booking.lodgeId;
    } else {
      const limits = await enforcePublicRateLimits(request, [
        { scope: "support-ticket-ip", maxRequests: 10, windowMs: 60 * 60_000 },
        { scope: "support-ticket-email", identity: normalizeEmail(String(form.get("customerEmail") ?? "")), bindIdentityToIp: true, maxRequests: 5, windowMs: 60 * 60_000 },
      ]);
      if (!limits.allowed) return supportError(request, rateLimitError);
    }

    const ticket = await createTicket({
      bookingId,
      lodgeId,
      customerName: String(form.get("customerName") ?? ""),
      customerEmail: String(form.get("customerEmail") ?? ""),
      customerPhone: String(form.get("customerPhone") ?? ""),
      contactPreference: String(form.get("contactPreference") ?? "WHATSAPP") as "CALL" | "WHATSAPP",
      category: String(form.get("category") ?? "GENERAL") as never,
      subject: String(form.get("subject") ?? ""),
      description: String(form.get("description") ?? ""),
    });
    return NextResponse.redirect(new URL(`/support?reference=${ticket.reference}`, request.url), 303);
  } catch (e) {
    // Invalid and mismatched references intentionally share one result.
    if (String(form.get("bookingReference") ?? "").trim()) {
      return supportError(request, bookingVerificationError);
    }
    return supportError(request, safeErrorMessage(e));
  }
}
