import { createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { bookingOccupants, bookings, events, paymentEvents, paymentTransactions } from "@/db/schema";

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
vi.mock("@/db/client", () => ({ getDb: () => testDb }));

const { POST } = await import("@/app/api/webhooks/paystack/route");
const { createBooking } = await import("@/lib/booking/create-booking");
const { createLodge } = await import("@/lib/inventory/lodges");
const { createCategory } = await import("@/lib/inventory/categories");
const { createUnit } = await import("@/lib/inventory/units");
const { computeGrants } = await import("@/lib/authz/authorize");
const { ROLE_DEFINITIONS } = await import("@/lib/authz/roles");

const admin = (() => {
  const def = ROLE_DEFINITIONS.find((role) => role.key === "accommodation_admin")!;
  return {
    userId: "00000000-0000-0000-0000-0000000000ae",
    email: "admin@example.test",
    name: "Admin",
    roleKeys: ["accommodation_admin"],
    ...computeGrants([def]),
    lodgeIds: new Set<string>(),
  };
})();

let eventId: string;
let idCounter = 0;
const secret = "test-paystack-secret";
const originalSecret = process.env.PAYSTACK_SECRET_KEY;

beforeAll(async () => {
  process.env.PAYSTACK_SECRET_KEY = secret;
  client = new PGlite();
  testDb = drizzle(client);
  await migrate(testDb, { migrationsFolder: "./drizzle" });
  const [event] = await testDb
    .insert(events)
    .values({ name: "Webhook tests", slug: "webhook-tests", year: 2026, bookingRefPrefix: "WH-ACM", status: "OPEN" })
    .returning();
  eventId = event!.id;
});
afterAll(async () => {
  await client.close();
  if (originalSecret === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = originalSecret;
  vi.unstubAllGlobals();
});

async function makeBooking() {
  idCounter += 1;
  const lodge = await createLodge(admin, { eventId, name: "Lodge", slug: `webhook-lodge-${idCounter}` });
  const category = await createCategory(admin, {
    lodgeId: lodge.id,
    name: "Private",
    mode: "PRIVATE",
    genderRestriction: "ANY",
    pricingModel: "PER_UNIT",
    defaultPriceMinor: 100000,
  });
  const unit = await createUnit(admin, { categoryId: category.id, name: "Unit", code: `W${idCounter}`, capacity: 1 });
  return createBooking({
    categoryId: category.id,
    unitId: unit.id,
    bookerName: "Guest",
    bookerPhone: "08000000000",
    bookerEmail: "guest@example.test",
    occupants: [{ name: "Guest", gender: "MALE" }],
  });
}

function webhookRequest(reference: string, transactionId: number) {
  const body = JSON.stringify({ event: "charge.success", data: { id: transactionId, reference } });
  const signature = createHmac("sha512", secret).update(body).digest("hex");
  return new Request("https://example.test/api/webhooks/paystack", {
    method: "POST",
    headers: { "x-paystack-signature": signature },
    body,
  });
}

function successResponse(transactionId: number, reference: string) {
  return new Response(
    JSON.stringify({
      status: true,
      data: {
        id: transactionId,
        status: "success",
        reference,
        amount: 100000,
        currency: "NGN",
        gateway_response: "Successful",
        paid_at: new Date().toISOString(),
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("Paystack webhook retry lifecycle", () => {
  it("does not record a failed verification as processed and accepts a later retry", async () => {
    const booking = await makeBooking();
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: false, message: "temporary outage" }), { status: 503 }))
      .mockResolvedValueOnce(successResponse(81001, booking.reference));
    vi.stubGlobal("fetch", fetch);

    const failed = await POST(webhookRequest(booking.reference, 81001));
    expect(failed.status).toBe(503);
    expect(await testDb.select().from(paymentEvents).where(eq(paymentEvents.eventKey, "paystack:81001"))).toHaveLength(0);
    const [pending] = await testDb.select().from(bookings).where(eq(bookings.id, booking.bookingId));
    expect(pending!.paymentStatus).toBe("PENDING");

    const retried = await POST(webhookRequest(booking.reference, 81001));
    expect(retried.status).toBe(200);
    expect(await testDb.select().from(paymentEvents).where(eq(paymentEvents.eventKey, "paystack:81001"))).toHaveLength(1);
    const transactions = await testDb.select().from(paymentTransactions).where(eq(paymentTransactions.bookingId, booking.bookingId));
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.status).toBe("SUCCESS");
  });

  it("keeps signature verification, deduplicates completed events, and tolerates callback overlap", async () => {
    const booking = await makeBooking();
    const fetch = vi.fn().mockResolvedValue(successResponse(81002, booking.reference));
    vi.stubGlobal("fetch", fetch);

    const response = await POST(webhookRequest(booking.reference, 81002));
    expect(response.status).toBe(200);
    const duplicate = await POST(webhookRequest(booking.reference, 81002));
    expect(duplicate.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);

    const { confirmPaymentFromVerifiedResult } = await import("@/lib/payments/confirm-payment");
    const callbackOutcome = await confirmPaymentFromVerifiedResult({
      status: "success",
      reference: booking.reference,
      amountMinor: 100000,
      requestedAmountMinor: 100000,
      currency: "NGN",
      gatewayResponse: "Successful",
      paidAt: new Date().toISOString(),
      paystackTransactionId: 81002,
      raw: {},
    });
    expect(callbackOutcome.status).toBe("already_confirmed");
    expect(await testDb.select().from(paymentEvents).where(eq(paymentEvents.eventKey, "paystack:81002"))).toHaveLength(1);
    expect(await testDb.select().from(bookingOccupants).where(eq(bookingOccupants.bookingId, booking.bookingId))).toHaveLength(1);
  });

  it("rejects an invalid signature before making a Paystack API request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await POST(new Request("https://example.test/api/webhooks/paystack", {
      method: "POST",
      headers: { "x-paystack-signature": "0".repeat(128) },
      body: JSON.stringify({ event: "charge.success", data: { id: 81003, reference: "unknown" } }),
    }));
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
});
