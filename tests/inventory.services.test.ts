import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { accommodationUnits, auditLogs, events, rooms } from "@/db/schema";
import { computeGrants, type Actor } from "@/lib/authz/authorize";
import { ROLE_DEFINITIONS } from "@/lib/authz/roles";

// The service modules call getDb() from "@/db/client", which normally opens
// a real pg Pool. Point it at our in-process PGlite instance instead so
// these tests exercise the actual service functions end to end.
let client: PGlite;
let testDb: ReturnType<typeof drizzle>;

vi.mock("@/db/client", () => ({
  getDb: () => testDb,
}));

const { createLodge, updateLodge, setLodgeStatus } = await import("@/lib/inventory/lodges");
const { createCategory, updateCategoryPricing } = await import("@/lib/inventory/categories");
const { createUnit, updateUnitCapacity, setUnitFacilities } = await import("@/lib/inventory/units");
const { createRoom, updateRoomCapacity } = await import("@/lib/inventory/rooms");
const { createBedspace, setBedspaceStatus } = await import("@/lib/inventory/bedspaces");
const { createFacility, deleteFacility } = await import("@/lib/inventory/facilities");

let eventId: string;

beforeAll(async () => {
  client = new PGlite();
  testDb = drizzle(client);
  await migrate(testDb, { migrationsFolder: "./drizzle" });
  const [event] = await testDb
    .insert(events)
    .values({ name: "Test", slug: "svc-test", year: 2026, bookingRefPrefix: "T-ACM" })
    .returning();
  eventId = event!.id;
});
afterAll(() => client.close());

function actorFor(roleKey: "super_admin" | "accommodation_admin" | "support_agent"): Actor {
  const def = ROLE_DEFINITIONS.find((r) => r.key === roleKey)!;
  return {
    userId: "00000000-0000-0000-0000-000000000001",
    email: "test@example.test",
    name: "Test",
    roleKeys: [roleKey],
    ...computeGrants([def]),
    lodgeIds: new Set(),
  };
}

const admin = actorFor("accommodation_admin");
const support = actorFor("support_agent");

async function auditCountFor(entityId: string) {
  const rows = await testDb.select().from(auditLogs).where(eq(auditLogs.entityId, entityId));
  return rows.length;
}

describe("createLodge", () => {
  it("denies a role without inventory.write", async () => {
    await expect(
      createLodge(support, { eventId, name: "X", slug: "x-" + Math.random() }),
    ).rejects.toThrow(/permission/);
  });

  it("rejects an invalid slug", async () => {
    await expect(createLodge(admin, { eventId, name: "X", slug: "Not A Slug!" })).rejects.toThrow(/[Ss]lug/);
  });

  it("creates a lodge and writes an audit entry", async () => {
    const lodge = await createLodge(admin, { eventId, name: "White House Lotto", slug: "whl-" + Date.now() });
    expect(lodge.status).toBe("ACTIVE");
    expect(await auditCountFor(lodge.id)).toBe(1);
  });
});

describe("setLodgeStatus", () => {
  it("succeeds without a reason (reasons are optional, not required)", async () => {
    const lodge = await createLodge(admin, { eventId, name: "X", slug: "reason-test-" + Date.now() });
    const updated = await setLodgeStatus(admin, lodge.id, "INACTIVE");
    expect(updated!.status).toBe("INACTIVE");
  });

  it("updates status and logs the reason", async () => {
    const lodge = await createLodge(admin, { eventId, name: "X", slug: "status-test-" + Date.now() });
    const updated = await setLodgeStatus(admin, lodge.id, "INACTIVE", "Flooded, closed for repairs");
    expect(updated!.status).toBe("INACTIVE");
    const [log] = await testDb
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "inventory.lodge_deactivated"), eq(auditLogs.entityId, lodge.id)));
    expect(log!.reason).toMatch(/Flooded/);
  });
});

describe("full hierarchy: lodge -> category -> unit -> room -> bedspace", () => {
  it("builds White House Lotto, Male Shared, Room 1, A-D", async () => {
    const lodge = await createLodge(admin, { eventId, name: "White House Lotto", slug: "whl2-" + Date.now() });
    const category = await createCategory(admin, {
      lodgeId: lodge.id,
      name: "Male Shared",
      mode: "SHARED",
      genderRestriction: "MALE",
      pricingModel: "PER_PERSON",
      defaultPriceMinor: 5_000_00,
    });
    const unit = await createUnit(admin, { categoryId: category.id, name: "Building A", code: "A" });
    const room = await createRoom(admin, { unitId: unit.id, name: "Room 1", code: "R1", genderRestriction: "MALE" });

    for (const letter of ["A", "B", "C", "D"]) {
      await createBedspace(admin, room.id, letter);
    }

    const [roomAfter] = await testDb.select().from(rooms).where(eq(rooms.id, room.id));
    expect(roomAfter?.capacity).toBe(4);

    const [unitAfter] = await testDb.select().from(accommodationUnits).where(eq(accommodationUnits.id, unit.id));
    expect(unitAfter?.capacity).toBe(4);
  });

  it("rejects a room with a gender that conflicts with its category, with a clear message", async () => {
    const lodge = await createLodge(admin, { eventId, name: "X", slug: "gender-test-" + Date.now() });
    const category = await createCategory(admin, {
      lodgeId: lodge.id,
      name: "Female Shared",
      mode: "SHARED",
      genderRestriction: "FEMALE",
      pricingModel: "PER_PERSON",
      defaultPriceMinor: 1000,
    });
    const unit = await createUnit(admin, { categoryId: category.id, name: "Building B", code: "B" });
    await expect(
      createRoom(admin, { unitId: unit.id, name: "Room 1", code: "R1", genderRestriction: "MALE" }),
    ).rejects.toThrow(/female occupants/);
  });
});

describe("pricing changes require pricing.write and a reason", () => {
  it("lets an accommodation_admin update pricing, with or without a reason", async () => {
    // accommodation_admin DOES have pricing.write per the role matrix, so this should succeed.
    const lodge = await createLodge(admin, { eventId, name: "X", slug: "price-test-" + Date.now() });
    const category = await createCategory(admin, {
      lodgeId: lodge.id,
      name: "Private",
      mode: "PRIVATE",
      pricingModel: "PER_UNIT",
      defaultPriceMinor: 10_000_00,
    });
    const withoutReason = await updateCategoryPricing(admin, category.id, { defaultPriceMinor: 11_000_00 });
    expect(withoutReason!.defaultPriceMinor).toBe(11_000_00);
    const updated = await updateCategoryPricing(admin, category.id, { defaultPriceMinor: 12_000_00 }, "Rate increase for 2026");
    expect(updated!.defaultPriceMinor).toBe(12_000_00);
  });

  it("denies a role without pricing.write", async () => {
    const lodge = await createLodge(admin, { eventId, name: "X", slug: "price-deny-" + Date.now() });
    const category = await createCategory(admin, {
      lodgeId: lodge.id,
      name: "Private",
      mode: "PRIVATE",
      pricingModel: "PER_UNIT",
      defaultPriceMinor: 1000,
    });
    await expect(
      updateCategoryPricing(support, category.id, { defaultPriceMinor: 2000 }, "test"),
    ).rejects.toThrow(/permission/);
  });
});

describe("capacity changes", () => {
  it("lets a whole-unit private room set its own capacity directly", async () => {
    const lodge = await createLodge(admin, { eventId, name: "Shiloh Apartments", slug: "shiloh-" + Date.now() });
    const category = await createCategory(admin, {
      lodgeId: lodge.id,
      name: "Private",
      mode: "PRIVATE",
      pricingModel: "PER_UNIT",
      defaultPriceMinor: 15_000_00,
    });
    const unit = await createUnit(admin, { categoryId: category.id, name: "Chalet A", code: "CHA" });
    const updated = await updateUnitCapacity(admin, unit.id, 4, "Confirmed with facilities: sleeps 4");
    expect(updated!.capacity).toBe(4);
  });

  it("refuses to manually set a room's capacity once it has bedspaces", async () => {
    const lodge = await createLodge(admin, { eventId, name: "X", slug: "cap-deny-" + Date.now() });
    const category = await createCategory(admin, {
      lodgeId: lodge.id,
      name: "Male Shared",
      mode: "SHARED",
      genderRestriction: "MALE",
      pricingModel: "PER_PERSON",
      defaultPriceMinor: 1000,
    });
    const unit = await createUnit(admin, { categoryId: category.id, name: "Building A", code: "A" });
    const room = await createRoom(admin, { unitId: unit.id, name: "Room 1", code: "R1", genderRestriction: "MALE" });
    await createBedspace(admin, room.id, "A");
    await expect(updateRoomCapacity(admin, room.id, 10, "trying to override")).rejects.toThrow(/bedspaces/);
  });
});

describe("bedspace status changes", () => {
  it("can block a bedspace with a reason, and this is audited", async () => {
    const lodge = await createLodge(admin, { eventId, name: "X", slug: "block-test-" + Date.now() });
    const category = await createCategory(admin, {
      lodgeId: lodge.id,
      name: "Male Shared",
      mode: "SHARED",
      genderRestriction: "MALE",
      pricingModel: "PER_PERSON",
      defaultPriceMinor: 1000,
    });
    const unit = await createUnit(admin, { categoryId: category.id, name: "Building A", code: "A" });
    const room = await createRoom(admin, { unitId: unit.id, name: "Room 1", code: "R1", genderRestriction: "MALE" });
    const bed = await createBedspace(admin, room.id, "A");

    const updated = await setBedspaceStatus(admin, bed.id, "BLOCKED", "Broken bed frame, awaiting repair");
    expect(updated!.status).toBe("BLOCKED");
    expect(await auditCountFor(bed.id)).toBeGreaterThanOrEqual(2); // create + status change
  });
});

describe("facilities", () => {
  it("creates a facility and prevents deleting it while a unit uses it", async () => {
    const facility = await createFacility(admin, "Standing Fan");
    const lodge = await createLodge(admin, { eventId, name: "X", slug: "fac-test-" + Date.now() });
    const category = await createCategory(admin, {
      lodgeId: lodge.id,
      name: "Private",
      mode: "PRIVATE",
      pricingModel: "PER_UNIT",
      defaultPriceMinor: 1000,
    });
    const unit = await createUnit(admin, { categoryId: category.id, name: "Chalet A", code: "CHA" });
    await setUnitFacilities(admin, unit.id, [facility.id]);

    await expect(deleteFacility(admin, facility.id)).rejects.toThrow();
  });
});
