import { NextResponse } from "next/server";
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

  // Idempotency: record this exact event id first. A duplicate delivery
  // hits the unique constraint on event_key and is safely ignored.
  const eventKey = `paystack:${event.data.id ?? event.data.reference}`;
  try {
    await getDb().insert(paymentEvents).values({ provider: "paystack", eventKey, payload: event });
  } catch {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // The webhook payload itself is never trusted for the actual amount/status
  // — always re-verify directly against Paystack's API before fulfilling.
  try {
    const verified = await verifyTransaction(event.data.reference);
    await confirmPaymentFromVerifiedResult(verified);
  } catch (e) {
    console.error("Paystack webhook processing failed:", e);
    // Still 200 the webhook itself (we recorded it); Paystack retries on
    // non-2xx, and our own confirmation logic is what actually needs to
    // succeed, which can be investigated/retried independently.
  }

  return NextResponse.json({ received: true });
}
