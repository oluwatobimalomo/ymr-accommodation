import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/auth/origin";
import { createBookingOrder, InventoryUnavailableError, type OccupantInput } from "@/lib/booking/create-booking";
import { initializeTransaction } from "@/lib/payments/paystack";
import { safeErrorMessage } from "@/lib/safe-error";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items = rawItems.map((raw) => {
      if (typeof raw !== "object" || raw === null) throw new Error("Your bag contains an invalid item.");
      const item = raw as Record<string, unknown>;
      const rawOccupants = Array.isArray(item.occupants) ? item.occupants : [];
      const occupants: OccupantInput[] = rawOccupants.map((rawOccupant) => {
        if (typeof rawOccupant !== "object" || rawOccupant === null) throw new Error("Enter each guest's name and gender.");
        const occupant = rawOccupant as Record<string, unknown>;
        if (occupant.gender !== "MALE" && occupant.gender !== "FEMALE" && occupant.gender !== "UNSPECIFIED") throw new Error("Select a gender for a shared bedspace.");
        return {
          name: String(occupant.name ?? "").trim(),
          gender: occupant.gender as OccupantInput["gender"],
          phone: String(occupant.phone ?? "").trim(),
          email: String(occupant.email ?? "").trim(),
          bedspaceId: typeof occupant.bedspaceId === "string" ? occupant.bedspaceId : undefined,
        };
      });
      return {
        categoryId: String(item.categoryId ?? ""),
        occupants,
        unitId: typeof item.unitId === "string" ? item.unitId : undefined,
        entireRoomId: typeof item.entireRoomId === "string" ? item.entireRoomId : undefined,
      };
    });

    const giftName = String(body.giftRecipientName ?? "").trim();
    const giftPhone = String(body.giftRecipientPhone ?? "").trim();
    const giftEmail = String(body.giftRecipientEmail ?? "").trim();
    const giftRecipient = giftName || giftPhone || giftEmail ? { name: giftName, phone: giftPhone, email: giftEmail } : undefined;
    if (giftRecipient && (!giftName || !giftPhone || !giftEmail)) throw new Error("Enter the recipient’s name, phone number, and email address.");
    const order = await createBookingOrder({
      bookerName: String(body.bookerName ?? "").trim(),
      bookerPhone: String(body.bookerPhone ?? "").trim(),
      bookerEmail: String(body.bookerEmail ?? "").trim(),
      giftRecipient,
      items,
    });
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return NextResponse.json({ reference: order.reference, redirectUrl: `/booking/reference/${encodeURIComponent(order.reference)}` });
    }
    const callbackUrl = new URL(`/booking/reference/${encodeURIComponent(order.reference)}`, request.url).toString();
    const transaction = await initializeTransaction({
      email: String(body.bookerEmail ?? "").trim(),
      amountMinor: order.amountMinor,
      reference: order.reference,
      callbackUrl,
      currency: order.currency,
    });
    return NextResponse.json({ reference: order.reference, redirectUrl: transaction.authorizationUrl });
  } catch (error) {
    const message = error instanceof InventoryUnavailableError ? error.message : safeErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
