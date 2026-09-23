import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { bookingOccupants, bookings, events, inventoryHolds, paymentTransactions, supportTickets } from "@/db/schema";
import type { VerifyTransactionResult } from "@/lib/payments/paystack";

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
vi.mock("@/db/client", () => ({ getDb: () => testDb }));

const { confirmPaymentFromVerifiedResult } = await import("@/lib/payments/confirm-payment");
const { createBooking } = await import("@/lib/booking/create-booking");
const { createLodge } = await import("@/lib/inventory/lodges");
const { createCategory } = await import("@/lib/inventory/categories");
const { createUnit } = await import("@/lib/inventory/units");
const { createRoom } = await import("@/lib/inventory/rooms");
const { createBedspace } = await import("@/lib/inventory/bedspaces");
const { computeGrants } = await import("@/lib/authz/authorize");
const { ROLE_DEFINITIONS } = await import("@/lib/authz/roles");

let eventId: string;
const admin = (() => {
  const def = ROLE_DEFINITIONS.find((r) => r.key === "accommodation_admin")!;
  return {
    userId: "00000000-0000-0000-0000-0000000000ee",
    email: "a@a.test",
    name: "A",
    roleKeys: ["accommodation_admin"],
    ...computeGrants([def]),
    lodgeIds: new Set<string>(),
  };
})();

beforeAll(async () => {
  client = new PGlite();
  testDb = drizzle(client);
  await migrate(testDb, { migrationsFolder: "./drizzle" });
  const [event] = await testDb
    .insert(events)
    .values({ name: "T", slug: "confirm-payment-test", year: 2026, bookingRefPrefix: "T-ACM", status: "OPEN" })
    .returning();
  eventId = event!.id;
});
afterAll(() => client.close());

async function makeBooking(priceMinor = 500000) {
  const lodge = await createLodge(admin, { eventId, name: "L", slug: "confirm-lodge-" + Math.random().toString(36).slice(2) });
  const category = await createCategory(admin, {
    lodgeId: lodge.id,
    name: "Male Shared",
    mode: "SHARED",
    genderRestriction: "MALE",
    pricingModel: "PER_PERSON",
    defaultPriceMinor: priceMinor,
  });
  const unit = await createUnit(admin, { categoryId: category.id, name: "A", code: "A" });
  const room = await createRoom(admin, { unitId: unit.id, name: "Room 1", code: "R1", genderRestriction: "MALE" });
  const bed = await createBedspace(admin, room.id, "A");
  return createBooking({
    categoryId: category.id,
    bookerName: "Payer",
    bookerPhone: "1",
    bookerEmail: "payer@example.com",
    occupants: [{ name: "Payer", gender: "MALE", bedspaceId: bed.id }],
  });
}

function verified(overrides: Partial<VerifyTransactionResult>): VerifyTransactionResult {
  return {
    status: "success",
    reference: "",
    amountMinor: 500000,
    requestedAmountMinor: 500000,
    currency: "NGN",
    gatewayResponse: "Successful",
    paidAt: new Date().toISOString(),
    paystackTransactionId: 12345,
    raw: {},
    ...overrides,
  };
}

describe("confirmPaymentFromVerifiedResult", () => {
  it("confirms a matching payment: sets PAID + ALLOCATED, records the transaction, deletes the hold", async () => {
    const booking = await makeBooking();
    const outcome = await confirmPaymentFromVerifiedResult(verified({ reference: booking.reference }));
    expect(outcome.status).toBe("confirmed");

    const [row] = await testDb.select().from(bookings).where(eq(bookings.id, booking.bookingId));
    expect(row!.paymentStatus).toBe("PAID");
    expect(row!.accommodationStatus).toBe("ALLOCATED");

    const txns = await testDb.select().from(paymentTransactions).where(eq(paymentTransactions.bookingId, booking.bookingId));
    expect(txns).toHaveLength(1);
    expect(txns[0]!.status).toBe("SUCCESS");

    const holds = await testDb.select().from(inventoryHolds).where(eq(inventoryHolds.bookingId, booking.bookingId));
    expect(holds).toHaveLength(0);
  });

  it("is idempotent: confirming the same reference twice does not double-insert a transaction or error", async () => {
    const booking = await makeBooking();
    await confirmPaymentFromVerifiedResult(verified({ reference: booking.reference }));
    const second = await confirmPaymentFromVerifiedResult(verified({ reference: booking.reference }));
    expect(second.status).toBe("already_confirmed");

    const txns = await testDb.select().from(paymentTransactions).where(eq(paymentTransactions.bookingId, booking.bookingId));
    expect(txns).toHaveLength(1); // still just one, not two
  });

  it("confirms successfully when Paystack added a customer-borne fee on top - amountMinor differs from requestedAmountMinor, but requestedAmountMinor matches the booking", async () => {
    const booking = await makeBooking(1500000); // matches the real-world case that surfaced this bug
    const outcome = await confirmPaymentFromVerifiedResult(
      verified({
        reference: booking.reference,
        amountMinor: 1532995, // gross total Paystack actually collected, including its fee
        requestedAmountMinor: 1500000, // what we originally asked for - this is what must match
      }),
    );
    expect(outcome.status).toBe("confirmed");

    const [row] = await testDb.select().from(bookings).where(eq(bookings.id, booking.bookingId));
    expect(row!.paymentStatus).toBe("PAID");
  });

  it("refuses to confirm when the requested amount does not match, and flags it for review instead", async () => {
    const booking = await makeBooking(500000);
    const outcome = await confirmPaymentFromVerifiedResult(
      verified({ reference: booking.reference, amountMinor: 100, requestedAmountMinor: 100 }), // way less than expected
    );
    expect(outcome.status).toBe("amount_mismatch");

    const [row] = await testDb.select().from(bookings).where(eq(bookings.id, booking.bookingId));
    expect(row!.paymentStatus).toBe("PENDING"); // NOT marked paid

    const tickets = await testDb.select().from(supportTickets).where(eq(supportTickets.bookingId, booking.bookingId));
    expect(tickets.some((t) => t.subject.includes("Amount mismatch"))).toBe(true);
  });

  it("does nothing for a non-successful verification result", async () => {
    const booking = await makeBooking();
    const outcome = await confirmPaymentFromVerifiedResult(verified({ reference: booking.reference, status: "failed" }));
    expect(outcome.status).toBe("not_successful");
    const [row] = await testDb.select().from(bookings).where(eq(bookings.id, booking.bookingId));
    expect(row!.paymentStatus).toBe("PENDING");
  });

  it("returns booking_not_found for an unknown reference rather than throwing", async () => {
    const outcome = await confirmPaymentFromVerifiedResult(verified({ reference: "NONEXISTENT-REF" }));
    expect(outcome.status).toBe("booking_not_found");
  });

  it("handles payment landing after the booking's hold already expired: marks PAID but flags for manual reallocation", async () => {
    const booking = await makeBooking();
    // Simulate what sweepExpiredHolds already does when a hold expires unpaid.
    await testDb
      .update(bookings)
      .set({ paymentStatus: "CANCELLED", accommodationStatus: "CANCELLED" })
      .where(eq(bookings.id, booking.bookingId));
    await testDb.update(bookingOccupants).set({ bedspaceId: null }).where(eq(bookingOccupants.bookingId, booking.bookingId));

    const outcome = await confirmPaymentFromVerifiedResult(verified({ reference: booking.reference }));
    expect(outcome.status).toBe("needs_manual_review");

    const [row] = await testDb.select().from(bookings).where(eq(bookings.id, booking.bookingId));
    expect(row!.paymentStatus).toBe("PAID"); // money is real, so mark it paid
    expect(row!.accommodationStatus).toBe("CANCELLED"); // but do NOT silently re-claim inventory

    const tickets = await testDb.select().from(supportTickets).where(eq(supportTickets.bookingId, booking.bookingId));
    expect(tickets.some((t) => t.subject.includes("hold expired"))).toBe(true);
  });
});
