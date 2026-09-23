import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { bookingOccupants, bookings, events, inventoryHolds } from "@/db/schema";

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
vi.mock("@/db/client", () => ({ getDb: () => testDb }));

const { createBooking } = await import("@/lib/booking/create-booking");
const { sweepExpiredHolds } = await import("@/lib/booking/holds");
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
    userId: "00000000-0000-0000-0000-0000000000cc",
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
    .values({ name: "T", slug: "hold-expiry-test", year: 2026, bookingRefPrefix: "T-ACM", status: "OPEN" })
    .returning();
  eventId = event!.id;
});
afterAll(() => client.close());

describe("an abandoned, never-paid booking releases its bedspace when the hold expires", () => {
  it("does not leave the bedspace permanently stuck", async () => {
    const lodge = await createLodge(admin, { eventId, name: "L", slug: "hold-expiry-lodge" });
    const category = await createCategory(admin, {
      lodgeId: lodge.id,
      name: "Male Shared",
      mode: "SHARED",
      genderRestriction: "MALE",
      pricingModel: "PER_PERSON",
      defaultPriceMinor: 1000,
    });
    const unit = await createUnit(admin, { categoryId: category.id, name: "A", code: "A" });
    const room = await createRoom(admin, { unitId: unit.id, name: "Room 1", code: "R1", genderRestriction: "MALE" });
    const bed = await createBedspace(admin, room.id, "A");

    // Booking A claims the bedspace but will never pay.
    const bookingA = await createBooking({
      categoryId: category.id,
      bookerName: "Abandoner",
      bookerPhone: "1",
      bookerEmail: "a@a.com",
      occupants: [{ name: "Ghost", gender: "MALE", bedspaceId: bed.id }],
    });

    // Force its hold into the past, simulating real expiry.
    await testDb
      .update(inventoryHolds)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(inventoryHolds.bookingId, bookingA.bookingId));

    // A second booking attempt on the same bedspace triggers the sweep
    // (createBooking -> holdBedspace -> sweepExpiredHolds) exactly as it
    // would in production, with no separate cron job required.
    const bookingB = await createBooking({
      categoryId: category.id,
      bookerName: "Real Customer",
      bookerPhone: "2",
      bookerEmail: "b@b.com",
      occupants: [{ name: "Actual Person", gender: "MALE", bedspaceId: bed.id }],
    });

    expect(bookingB.bookingId).not.toBe(bookingA.bookingId);

    // Booking A must now be cancelled, not silently forgotten.
    const [cancelled] = await testDb.select().from(bookings).where(eq(bookings.id, bookingA.bookingId));
    expect(cancelled!.paymentStatus).toBe("CANCELLED");
    expect(cancelled!.accommodationStatus).toBe("CANCELLED");

    // Its occupant's stale assignment must be cleared, not left pointing at
    // a bedspace someone else now legitimately occupies.
    const [ghostOccupant] = await testDb
      .select()
      .from(bookingOccupants)
      .where(eq(bookingOccupants.bookingId, bookingA.bookingId));
    expect(ghostOccupant!.bedspaceId).toBeNull();

    // Booking B's occupant now correctly holds the real assignment.
    const [realOccupant] = await testDb
      .select()
      .from(bookingOccupants)
      .where(eq(bookingOccupants.bookingId, bookingB.bookingId));
    expect(realOccupant!.bedspaceId).toBe(bed.id);
  });

  it("does not touch a booking that already paid, even if a stray hold row still references it", async () => {
    const lodge = await createLodge(admin, { eventId, name: "L2", slug: "hold-expiry-lodge-2" });
    const category = await createCategory(admin, {
      lodgeId: lodge.id,
      name: "Male Shared 2",
      mode: "SHARED",
      genderRestriction: "MALE",
      pricingModel: "PER_PERSON",
      defaultPriceMinor: 1000,
    });
    const unit = await createUnit(admin, { categoryId: category.id, name: "A", code: "A" });
    const room = await createRoom(admin, { unitId: unit.id, name: "Room 1", code: "R1", genderRestriction: "MALE" });
    const bed = await createBedspace(admin, room.id, "A");

    const booking = await createBooking({
      categoryId: category.id,
      bookerName: "Payer",
      bookerPhone: "1",
      bookerEmail: "a@a.com",
      occupants: [{ name: "Paid Person", gender: "MALE", bedspaceId: bed.id }],
    });
    await testDb.update(bookings).set({ paymentStatus: "PAID" }).where(eq(bookings.id, booking.bookingId));
    await testDb
      .update(inventoryHolds)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(inventoryHolds.bookingId, booking.bookingId));

    await testDb.transaction(async (tx) => {
      await sweepExpiredHolds(tx as Parameters<typeof sweepExpiredHolds>[0]);
    });

    const [afterSweep] = await testDb.select().from(bookings).where(eq(bookings.id, booking.bookingId));
    expect(afterSweep!.paymentStatus).toBe("PAID"); // untouched, not overwritten to CANCELLED

    const [occupant] = await testDb.select().from(bookingOccupants).where(eq(bookingOccupants.bookingId, booking.bookingId));
    expect(occupant!.bedspaceId).toBe(bed.id); // assignment preserved
  });
});

describe("admin cancelBooking releases inventory and is audited", () => {
  it("clears occupant assignment and records an audit entry", async () => {
    const { cancelBooking } = await import("@/lib/booking/admin-queries");
    const { auditLogs } = await import("@/db/schema");

    const lodge = await createLodge(admin, { eventId, name: "L3", slug: "hold-expiry-lodge-3" });
    const category = await createCategory(admin, {
      lodgeId: lodge.id,
      name: "Male Shared 3",
      mode: "SHARED",
      genderRestriction: "MALE",
      pricingModel: "PER_PERSON",
      defaultPriceMinor: 1000,
    });
    const unit = await createUnit(admin, { categoryId: category.id, name: "A", code: "A" });
    const room = await createRoom(admin, { unitId: unit.id, name: "Room 1", code: "R1", genderRestriction: "MALE" });
    const bed = await createBedspace(admin, room.id, "A");

    const booking = await createBooking({
      categoryId: category.id,
      bookerName: "Canceller",
      bookerPhone: "1",
      bookerEmail: "a@a.com",
      occupants: [{ name: "Someone", gender: "MALE", bedspaceId: bed.id }],
    });

    await cancelBooking(admin, booking.bookingId, "Customer requested cancellation");

    const [row] = await testDb.select().from(bookings).where(eq(bookings.id, booking.bookingId));
    expect(row!.paymentStatus).toBe("CANCELLED");

    const [occ] = await testDb.select().from(bookingOccupants).where(eq(bookingOccupants.bookingId, booking.bookingId));
    expect(occ!.bedspaceId).toBeNull();

    const logs = await testDb.select().from(auditLogs).where(eq(auditLogs.action, "booking.cancelled"));
    expect(logs.some((l) => l.entityId === booking.bookingId)).toBe(true);
  });
});
