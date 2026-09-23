import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "@/lib/payments/paystack";

const ORIGINAL_KEY = process.env.PAYSTACK_SECRET_KEY;

beforeEach(() => {
  process.env.PAYSTACK_SECRET_KEY = "sk_test_fixed_key_for_signature_tests";
});
afterEach(() => {
  process.env.PAYSTACK_SECRET_KEY = ORIGINAL_KEY;
});

describe("verifyWebhookSignature", () => {
  it("accepts a correctly-computed HMAC-SHA512 signature over the raw body", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "abc123", id: 42 } });
    const signature = createHmac("sha512", "sk_test_fixed_key_for_signature_tests").update(body).digest("hex");
    expect(verifyWebhookSignature(body, signature)).toBe(true);
  });

  it("rejects a wrong signature", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "abc123" } });
    expect(verifyWebhookSignature(body, "0".repeat(128))).toBe(false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "abc123" } });
    const wrongSignature = createHmac("sha512", "some_other_key").update(body).digest("hex");
    expect(verifyWebhookSignature(body, wrongSignature)).toBe(false);
  });

  it("rejects when the body was re-serialized (whitespace/order changed) even with the right secret", () => {
    const original = '{"event":"charge.success","data":{"reference":"abc123"}}';
    const reserialized = JSON.stringify(JSON.parse(original), null, 2); // pretty-printed = different bytes
    const signature = createHmac("sha512", "sk_test_fixed_key_for_signature_tests").update(original).digest("hex");
    expect(verifyWebhookSignature(reserialized, signature)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyWebhookSignature("{}", null)).toBe(false);
  });

  it("throws a clear error when PAYSTACK_SECRET_KEY is not set, rather than silently misbehaving", () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    expect(() => verifyWebhookSignature("{}", "abc")).toThrow(/PAYSTACK_SECRET_KEY/);
  });
});
