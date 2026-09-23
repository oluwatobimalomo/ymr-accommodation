import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auditLogs, bookingOccupants, events, inventoryHolds, privateUnitAllocations } from "@/db/schema";

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
vi.mock("@/db/client", () => ({ getDb: () => testDb }));

const { createBooking, InventoryUnavailableError } = await import("@/lib/booking/create-booking");
const { confirmPaymentFromVerifiedResult } = await import("@/lib/payments/confirm-payment");
const { cancelBooking } = await import("@/lib/booking/admin-queries");
const { sweepExpiredHolds } = await import("@/lib/booking/holds");
const { createLodge } = await import("@/lib/inventory/lodges");
const { createCategory } = await import("@/lib/inventory/categories");
const { createUnit } = await import("@/lib/inventory/units");
const { computeGrants } = await import("@/lib/authz/authorize");
const { ROLE_DEFINITIONS } = await import("@/lib/authz/roles");

const admin = (() => {
  const def = ROLE_DEFINITIONS.find((role) => role.key === "accommodation_admin")!;
  return {
    userId: "00000000-0000-0000-0000-0000000000ad",
    email: "admin@example.test",
    name: "Admin",
    roleKeys: ["accommodation_admin"],
    ...computeGrants([def]),
    lodgeIds: new Set<string>(),
  };
})();

let eventId: string;
let fixtureId = 0;

beforeAll(async () => {
  client = new PGlite();
  testDb = drizzle(client);
  await migrate(testDb, { migrationsFolder: "./drizzle" });
  const [event] = await testDb
    .insert(events)
    .values({ name: "Private unit tests", slug: "private-unit-tests", year: 2026, bookingRefPrefix: "PU-ACM", status: "OPEN" })
    .returning();
  eventId = event!.id;
});
afterAll(() => client.close());

async function makePrivateUnit() {
  fixtureId += 1;
  const lodge = await createLodge(admin, { eventId, name: "Lodge", slug: `private-lodge-${fixtureId}` });
  const category = await createCategory(admin, {
    lodgeId: lodge.id,
    name: "Private",
    mode: "PRIVATE",
    genderRestriction: "ANY",
    pricingModel: "PER_UNIT",
    defaultPriceMinor: 100000,
  });
  const unit = await createUnit(admin, { categoryId: category.id, name: "Unit", code: `P${fixtureId}`, capacity: 3 });
  return { category, unit };
}

function book(categoryId: string, unitId: string, names = ["Guest"]) {
  return createBooking({
    categoryId,
    unitId,
    bookerName: names[0]!,
    bookerPhone: "08000000000",
    bookerEmail: "guest@example.test",
    occupants: names.map((name) => ({ name, gender: "MALE" as const })),
  });
}

function verified(reference: string, paystackTransactionId: number) {
  return {
    status: "success",
    reference,
    amountMinor: 100000,
    requestedAmountMinor: 100000,
    currency: "NGN",
    gatewayResponse: "Successful",
    paidAt: new Date().toISOString(),
    paystackTransactionId,
    raw: {},
  };
}

describe("durable private-unit allocation", () => {
  it("allows multiple occupants on one booking and keeps the unit claimed after payment removes its hold", async () => {
    const { category, unit } = await makePrivateUnit();
    const booking = await book(category.id, unit.id, ["Guest A", "Guest B"]);

    const claims = await testDb.select().from(privateUnitAllocations).where(eq(privateUnitAllocations.bookingId, booking.bookingId));
    expect(claims).toHaveLength(1);
    expect(claims[0]!.unitId).toBe(unit.id);

    await confirmPaymentFromVerifiedResult(verified(booking.reference, 70001));
    const holds = await testDb.select().from(inventoryHolds).where(eq(inventoryHolds.bookingId, booking.bookingId));
    expect(holds).toHaveLength(0);

    await expect(book(category.id, unit.id, ["Another guest"])).rejects.toThrow(InventoryUnavailableError);
    const activeClaims = await testDb
      .select()
      .from(privateUnitAllocations)
      .where(and(eq(privateUnitAllocations.unitId, unit.id), isNull(privateUnitAllocations.releasedAt)));
    expect(activeClaims).toHaveLength(1);
  });

  it("enforces one active booking per unit in PostgreSQL, beyond service checks", async () => {
    const { category, unit } = await makePrivateUnit();
    const first = await book(category.id, unit.id);
    const otherUnit = await createUnit(admin, {
      categoryId: category.id,
      name: "Other Unit",
      code: `O${fixtureId}`,
      capacity: 3,
    });
    const second = await book(category.id, otherUnit.id, ["Other guest"]);

    const [firstAllocation] = await testDb
      .select()
      .from(privateUnitAllocations)
      .where(eq(privateUnitAllocations.bookingId, first.bookingId));
    await expect(
      testDb.insert(privateUnitAllocations).values({ unitId: unit.id, bookingId: second.bookingId }),
    ).rejects.toThrow();

    const [otherOccupant] = await testDb
      .select()
      .from(bookingOccupants)
      .where(eq(bookingOccupants.bookingId, second.bookingId));
    await expect(
      testDb.update(bookingOccupants).set({ unitId: unit.id }).where(eq(bookingOccupants.id, otherOccupant!.id)),
    ).rejects.toThrow();
    expect(firstAllocation!.releasedAt).toBeNull();
    const [secondClaim] = await testDb
      .select()
      .from(privateUnitAllocations)
      .where(and(eq(privateUnitAllocations.bookingId, second.bookingId), isNull(privateUnitAllocations.releasedAt)));
    expect(secondClaim!.unitId).toBe(otherUnit.id); // failed transaction did not release unrelated unit
  });

  it("releases a pending private allocation and hold on staff cancellation", async () => {
    const { category, unit } = await makePrivateUnit();
    const first = await book(category.id, unit.id);
    await cancelBooking(admin, first.bookingId, "requested");

    expect(await testDb.select().from(inventoryHolds).where(eq(inventoryHolds.bookingId, first.bookingId))).toHaveLength(0);
    const [claim] = await testDb
      .select()
      .from(privateUnitAllocations)
      .where(eq(privateUnitAllocations.bookingId, first.bookingId));
    expect(claim!.releasedAt).not.toBeNull();

    const next = await book(category.id, unit.id, ["Next guest"]);
    expect(next.bookingId).not.toBe(first.bookingId);
  });

  it("releases an expired private hold, clears stale occupant assignment, and audits the transition", async () => {
    const { category, unit } = await makePrivateUnit();
    const first = await book(category.id, unit.id);
    await testDb
      .update(inventoryHolds)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(inventoryHolds.bookingId, first.bookingId));

    await testDb.transaction(async (tx) => sweepExpiredHolds(tx as Parameters<typeof sweepExpiredHolds>[0]));
    const next = await book(category.id, unit.id, ["Replacement"]);
    expect(next.bookingId).not.toBe(first.bookingId);

    const [claim] = await testDb
      .select()
      .from(privateUnitAllocations)
      .where(eq(privateUnitAllocations.bookingId, first.bookingId));
    expect(claim!.releasedAt).not.toBeNull();
    const logs = await testDb.select().from(auditLogs).where(eq(auditLogs.entityId, first.bookingId));
    expect(logs.some((row) => row.action === "booking.hold_expired")).toBe(true);
    expect(logs.some((row) => row.action === "inventory.private_unit_released")).toBe(true);
  });

  it("keeps payment paid when staff cancel accommodation and releases only that unit", async () => {
    const { category, unit } = await makePrivateUnit();
    const booking = await book(category.id, unit.id);
    await confirmPaymentFromVerifiedResult(verified(booking.reference, 70002));

    await cancelBooking(admin, booking.bookingId, "accommodation cancelled");
    const { bookings, paymentTransactions } = await import("@/db/schema");
    const [row] = await testDb.select().from(bookings).where(eq(bookings.id, booking.bookingId));
    expect(row!.paymentStatus).toBe("PAID");
    expect(row!.accommodationStatus).toBe("CANCELLED");
    const [allocation] = await testDb
      .select()
      .from(privateUnitAllocations)
      .where(eq(privateUnitAllocations.bookingId, booking.bookingId));
    expect(allocation!.releasedAt).not.toBeNull();
    const [payment] = await testDb
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.bookingId, booking.bookingId));
    expect(payment!.status).toBe("SUCCESS"); // cancellation does not imply a refund

    await expect(book(category.id, unit.id, ["New guest"])).resolves.toMatchObject({ bookingId: expect.any(String) });
  });

  it("serializes staff cancellation against payment confirmation without losing paid state", async () => {
    const { category, unit } = await makePrivateUnit();
    const booking = await book(category.id, unit.id);
    await Promise.all([
      confirmPaymentFromVerifiedResult(verified(booking.reference, 70003)),
      cancelBooking(admin, booking.bookingId, "cancel/payment race"),
    ]);

    const { bookings } = await import("@/db/schema");
    const [row] = await testDb.select().from(bookings).where(eq(bookings.id, booking.bookingId));
    expect(row!.paymentStatus).toBe("PAID");
    expect(row!.accommodationStatus).toBe("CANCELLED");
    const [allocation] = await testDb
      .select()
      .from(privateUnitAllocations)
      .where(eq(privateUnitAllocations.bookingId, booking.bookingId));
    expect(allocation!.releasedAt).not.toBeNull();
  });
});
