import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const PROOF_TTL_SECONDS = 20 * 60;

function signingKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  return key;
}

export function paymentReturnCookieName(reference: string) {
  const suffix = createHash("sha256").update(reference).digest("hex").slice(0, 16);
  return `ymr_payment_return_${suffix}`;
}

export function createPaymentReturnProof(reference: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + PROOF_TTL_SECONDS;
  const signature = createHmac("sha256", signingKey()).update(`${reference}.${expiresAt}`).digest("base64url");
  return { value: `${expiresAt}.${signature}`, maxAge: PROOF_TTL_SECONDS };
}

export function isValidPaymentReturnProof(reference: string, value?: string) {
  if (!value) return false;
  const [expiresAtText, providedSignature, extra] = value.split(".");
  const expiresAt = Number(expiresAtText);
  if (extra !== undefined || !Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000) || !providedSignature) return false;
  try {
    const expected = createHmac("sha256", signingKey()).update(`${reference}.${expiresAt}`).digest();
    const provided = Buffer.from(providedSignature, "base64url");
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}
