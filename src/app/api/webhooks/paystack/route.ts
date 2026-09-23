import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { paymentEvents } from "@/db/schema";
import { confirmPaymentFromVerifiedResult } from "@/lib/payments/confirm-payment";
import { verifyTransaction, verifyWebhookSignature } from "@/lib/payments/paystack";

/**
 * Paystack sends events only for successful charges (charge.success) - it
 * does not webhook failed/abandoned attempts. We read the RAW body (not
 * request.json()) because the HMAC signature is computed over the exact
 * bytes sent; re-serializing through JSON.parse/stringify can change
 * whitespace and silently break verification even for a genuine event.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event?: string; data?: { reference?: string; id?: number } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (event.event !== "charge.success" || !event.data?.reference) {
    return NextResponse.json({ received: true }); // acknowledge, nothing to do
  }

  const eventKey = `paystack:${event.data.id ?? event.data.reference}`;
  const db = getDb();
  const [previouslyProcessed] = await db
    .select({ id: paymentEvents.id })
    .from(paymentEvents)
    .where(eq(paymentEvents.eventKey, eventKey))
    .limit(1);
  if (previouslyProcessed) return NextResponse.json({ received: true, duplicate: true });

  // Do not persist a processed-event marker until verification and business
  // handling complete. Non-2xx makes Paystack retry transient failures.
  try {
    const verified = await verifyTransaction(event.data.reference);
    const outcome = await confirmPaymentFromVerifiedResult(verified);
    if (outcome.status === "not_successful" || outcome.status === "booking_not_found") {
      console.error(`Paystack webhook ${eventKey} not completed: ${outcome.status}`);
      return NextResponse.json({ error: "Payment confirmation is not complete" }, { status: 503 });
    }

    try {
      await db.insert(paymentEvents).values({
        provider: "paystack",
        eventKey,
        payload: { event: event.event, transactionId: event.data.id ?? null, reference: event.data.reference },
      });
    } catch (e) {
      if (isUniqueViolation(e)) return NextResponse.json({ received: true, duplicate: true });
      throw e;
    }
    return NextResponse.json({ received: true, outcome: outcome.status });
  } catch (e) {
    console.error("Paystack webhook processing failed:", e);
    return NextResponse.json({ error: "Webhook processing failed; retry is safe" }, { status: 503 });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
