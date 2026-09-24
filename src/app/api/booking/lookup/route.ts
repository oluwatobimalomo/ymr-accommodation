import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/auth/origin";
import { getBookingByReference } from "@/lib/booking/queries";

function normalizePhone(value: string) {
  return value.replace(/\s+/g, "");
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request could not be verified." }, { status: 403, headers: { "Cache-Control": "no-store" } });

  try {
    const body = await request.json() as { ticketId?: unknown; phone?: unknown };
    const ticketId = typeof body.ticketId === "string" ? body.ticketId.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!ticketId || !phone) return NextResponse.json({ error: "Enter your Ticket ID and booking phone number." }, { status: 400, headers: { "Cache-Control": "no-store" } });

    const result = await getBookingByReference(ticketId);
    if (!result || normalizePhone(result.booking.bookerPhone) !== normalizePhone(phone)) {
      return NextResponse.json({ error: "We couldn’t find a booking matching those details." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

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
