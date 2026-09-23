import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bookings } from "@/db/schema";
import { isSameOrigin } from "@/lib/auth/origin";
import { safeErrorMessage } from "@/lib/safe-error";
import { createTicket } from "@/lib/support/tickets";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  const form = await request.formData();
  try {
    const bookingRef = String(form.get("bookingReference") ?? "").trim();
    let bookingId: string | undefined;
    if (bookingRef) {
      const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, bookingRef)).limit(1);
      bookingId = booking?.id;
    }

    const ticket = await createTicket({
      bookingId,
      customerName: String(form.get("customerName") ?? ""),
      customerEmail: String(form.get("customerEmail") ?? ""),
      customerPhone: String(form.get("customerPhone") ?? ""),
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
