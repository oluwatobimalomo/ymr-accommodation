import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { events } from "@/db/schema";

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
vi.mock("@/db/client", () => ({ getDb: () => testDb }));

const { getDashboardStats } = await import("@/lib/dashboard");
const { createLodge } = await import("@/lib/inventory/lodges");
const { createCategory } = await import("@/lib/inventory/categories");
const { createUnit } = await import("@/lib/inventory/units");
const { createRoom } = await import("@/lib/inventory/rooms");
const { createBedspace } = await import("@/lib/inventory/bedspaces");
const { createBooking } = await import("@/lib/booking/create-booking");
const { computeGrants } = await import("@/lib/authz/authorize");
const { ROLE_DEFINITIONS } = await import("@/lib/authz/roles");

let eventId: string;
const admin = (() => {
  const def = ROLE_DEFINITIONS.find((r) => r.key === "accommodation_admin")!;
  return {
    userId: "00000000-0000-0000-0000-0000000000bb",
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
    .values({ name: "T", slug: "dash-test", year: 2026, bookingRefPrefix: "T-ACM", status: "OPEN" })
    .returning();
  eventId = event!.id;
});
afterAll(() => client.close());

describe("dashboard stats", () => {
  it("reflects reality after building inventory and making a booking", async () => {
    const lodge = await createLodge(admin, { eventId, name: "L", slug: "dash-lodge" });
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
    const bedA = await createBedspace(admin, room.id, "A");
    await createBedspace(admin, room.id, "B");

    const before = await getDashboardStats();
    expect(before.lodges.total).toBe(1);
    expect(before.bedspaces.total).toBe(2);
    expect(before.bedspaces.availableNow).toBe(2);

    await createBooking({
      categoryId: category.id,
      bookerName: "X",
      bookerPhone: "1",
      bookerEmail: "a@a.com",
      occupants: [{ name: "One", gender: "MALE", bedspaceId: bedA.id }],
    });

    const after = await getDashboardStats();
    expect(after.bookings.total).toBe(1);
    expect(after.bookings.pending).toBe(1);
    expect(after.bedspaces.assigned).toBe(1);
    expect(after.bedspaces.availableNow).toBe(1); // 2 total - 1 assigned
  });

  it("counts an in-progress hold as held, separately from an assigned bedspace", async () => {
    const { holdBedspace } = await import("@/lib/booking/holds");
    const lodge = await createLodge(admin, { eventId, name: "L2", slug: "dash-lodge-2" });
    const category = await createCategory(admin, {
      lodgeId: lodge.id,
      name: "Male Shared 2",
      mode: "SHARED",
      genderRestriction: "MALE",
      pricingModel: "PER_PERSON",
      defaultPriceMinor: 1000,
    });
    const unit = await createUnit(admin, { categoryId: category.id, name: "B", code: "B" });
    const room = await createRoom(admin, { unitId: unit.id, name: "Room 1", code: "R1", genderRestriction: "MALE" });
    const bed = await createBedspace(admin, room.id, "A");

    const before = await getDashboardStats();
    await testDb.transaction(async (tx) => {
      await holdBedspace(tx as Parameters<typeof holdBedspace>[0], bed.id, 15);
    });

    const after = await getDashboardStats();
    // This action only creates a hold, no booking, so held goes up and assigned does not.
    expect(after.bedspaces.held).toBe(before.bedspaces.held + 1);
    expect(after.bedspaces.assigned).toBe(before.bedspaces.assigned);
  });
});
