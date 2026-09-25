import { createHmac, timingSafeEqual } from "node:crypto";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Online payment is temporarily unavailable. Please try again later.");
  return key;
}

export interface InitializeTransactionInput {
  email: string;
  amountMinor: number; // kobo for NGN
  reference: string;
  callbackUrl: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface InitializeTransactionResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

/** POST /transaction/initialize - starts a Paystack checkout for one booking. */
export async function initializeTransaction(input: InitializeTransactionInput): Promise<InitializeTransactionResult> {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: input.email,
      amount: String(input.amountMinor),
      reference: input.reference,
      callback_url: input.callbackUrl,
      currency: input.currency ?? "NGN",
      metadata: input.metadata ?? {},
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.status) {
    throw new Error(data.message || "Could not start payment with Paystack. Please try again.");
  }
  return {
    authorizationUrl: data.data.authorization_url,
    accessCode: data.data.access_code,
    reference: data.data.reference,
  };
}

export interface VerifyTransactionResult {
  status: string; // "success" | "failed" | "abandoned" | ...
  reference: string;
  amountMinor: number; // gross amount actually collected from the customer (may include a customer-borne fee)
  requestedAmountMinor: number; // the amount we originally asked for at initialize - this is what should be checked against the booking
  currency: string;
  gatewayResponse: string;
  paidAt: string | null;
  paystackTransactionId: number;
  raw: unknown;
}

/** GET /transaction/verify/:reference - the authoritative source of truth for a transaction's outcome. Never trust the browser callback alone. */
export async function verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });
  const data = await res.json();
  if (!res.ok || !data.status) {
    throw new Error(data.message || "Could not verify payment with Paystack.");
  }
  return {
    status: data.data.status,
    reference: data.data.reference,
    amountMinor: data.data.amount,
    // Paystack only includes requested_amount when it differs from amount
    // (e.g. the customer bore the transaction fee) - fall back to amount
    // when it's absent, since then there was no fee added and they're equal.
    requestedAmountMinor: data.data.requested_amount ?? data.data.amount,
    currency: data.data.currency,
    gatewayResponse: data.data.gateway_response ?? "",
    paidAt: data.data.paid_at ?? null,
    paystackTransactionId: data.data.id,
    raw: data.data,
  };
}

/**
 * Verifies the x-paystack-signature header: HMAC-SHA512 of the RAW request
 * body, keyed with the secret key, hex-encoded, compared in constant time.
 * The caller must pass the untouched raw body string (not a re-serialized
 * JSON.parse/stringify round trip) or the signature will legitimately fail
 * to match, even for a genuine event.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha512", secretKey()).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const givenBuf = Buffer.from(signatureHeader, "hex");
  if (expectedBuf.length !== givenBuf.length) return false;
  return timingSafeEqual(expectedBuf, givenBuf);
}
