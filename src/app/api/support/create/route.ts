import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accommodationCategories, bookings } from "@/db/schema";
import { isSameOrigin } from "@/lib/auth/origin";
import { safeErrorMessage } from "@/lib/safe-error";
import { createTicket } from "@/lib/support/tickets";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  const form = await request.formData();
  try {
    const bookingRef = String(form.get("bookingReference") ?? "").trim();
    let bookingId: string | undefined;
    let lodgeId = String(form.get("lodgeId") ?? "") || undefined;
    if (bookingRef) {
      const [booking] = await getDb().select({ id: bookings.id, lodgeId: accommodationCategories.lodgeId }).from(bookings).innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId)).where(eq(bookings.reference, bookingRef)).limit(1);
      if (!booking) throw new Error("We couldn't find that booking reference. Check it or leave the field blank.");
      bookingId = booking?.id;
      lodgeId = booking.lodgeId;
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
    return NextResponse.redirect(
      new URL(`/support?error=${encodeURIComponent(safeErrorMessage(e))}`, request.url),
      303,
    );
  }
}
