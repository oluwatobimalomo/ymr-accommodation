import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/auth/origin";
import { createBooking, InventoryUnavailableError, type OccupantInput } from "@/lib/booking/create-booking";
import { initializeTransaction } from "@/lib/payments/paystack";
import { safeErrorMessage } from "@/lib/safe-error";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  const form = await request.formData();
  const categoryId = String(form.get("categoryId") ?? "");
  const occupantCount = Number(form.get("occupantCount") ?? 0);
  const backTo = `/booking/${categoryId}`;

  if (!categoryId || occupantCount < 1) {
    return NextResponse.redirect(new URL(`${backTo}?error=${encodeURIComponent("Please complete the form.")}`, request.url), 303);
  }

  const occupants: OccupantInput[] = [];
  for (let i = 0; i < occupantCount; i++) {
    const name = String(form.get(`occupant_name_${i}`) ?? "");
    const gender = String(form.get(`occupant_gender_${i}`) ?? "");
    if (!name || (gender !== "MALE" && gender !== "FEMALE")) {
      return NextResponse.redirect(
        new URL(`${backTo}?error=${encodeURIComponent("Please fill in every occupant's name and gender.")}`, request.url),
        303,
      );
    }
    occupants.push({
      name,
      gender,
      phone: String(form.get(`occupant_phone_${i}`) ?? ""),
      email: String(form.get(`occupant_email_${i}`) ?? ""),
      bedspaceId: (form.get(`occupant_bedspace_${i}`) as string) || undefined,
    });
  }

  try {
    const result = await createBooking({
      categoryId,
      bookerName: String(form.get("bookerName") ?? ""),
      bookerPhone: String(form.get("bookerPhone") ?? ""),
      bookerEmail: String(form.get("bookerEmail") ?? ""),
      occupants,
      entireRoomId: (form.get("entireRoomId") as string) || undefined,
      unitId: (form.get("unitId") as string) || undefined,
    });

    if (!process.env.PAYSTACK_SECRET_KEY) {
      // Payment not configured yet (e.g. local dev before keys are added) -
      // the booking still exists, held, at PENDING; just skip straight to
      // the confirmation page rather than failing the whole booking.
      return NextResponse.redirect(new URL(`/booking/reference/${result.reference}`, request.url), 303);
    }

    const callbackUrl = new URL(`/booking/reference/${result.reference}`, request.url).toString();
    const bookerEmail = String(form.get("bookerEmail") ?? "");
    const transaction = await initializeTransaction({
      email: bookerEmail,
      amountMinor: result.amountMinor,
      reference: result.reference,
      callbackUrl,
      currency: result.currency,
    });
    return NextResponse.redirect(transaction.authorizationUrl, 303);
  } catch (e) {
    const message = e instanceof InventoryUnavailableError ? e.message : safeErrorMessage(e);
    return NextResponse.redirect(new URL(`${backTo}?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}
