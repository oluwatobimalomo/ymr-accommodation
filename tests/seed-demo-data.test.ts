import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { accommodationCategories, bedspaces, facilities, lodges, rooms } from "@/db/schema";

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
vi.mock("@/db/client", () => ({ getDb: () => testDb }));

const { computeGrants } = await import("@/lib/authz/authorize");
const { ROLE_DEFINITIONS } = await import("@/lib/authz/roles");
const { createLodge } = await import("@/lib/inventory/lodges");
const { createCategory } = await import("@/lib/inventory/categories");
const { createUnit, setUnitFacilities } = await import("@/lib/inventory/units");
const { createRoom } = await import("@/lib/inventory/rooms");
const { createBedspace } = await import("@/lib/inventory/bedspaces");

beforeAll(async () => {
  client = new PGlite();
  testDb = drizzle(client);
  await migrate(testDb, { migrationsFolder: "./drizzle" });
});
afterAll(() => client.close());

describe("seed demo data logic (same calls the seed script makes)", () => {
  it("builds White House Lotto and Shiloh Apartments without error", async () => {
    const { events } = await import("@/db/schema");
    const [event] = await testDb
      .insert(events)
      .values({ name: "T", slug: "seed-demo-test", year: 2026, bookingRefPrefix: "T-ACM", status: "OPEN" })
      .returning();
    const eventId = event!.id;

    const seedActor = {
      userId: "00000000-0000-0000-0000-000000000000",
      email: "seed@ymr.local",
      name: "Seed Script",
      roleKeys: ["super_admin"],
      ...computeGrants([ROLE_DEFINITIONS.find((r) => r.key === "super_admin")!]),
      lodgeIds: new Set<string>(),
    };

    await testDb.insert(facilities).values([
      { name: "Fan", sortOrder: 0 },
      { name: "Air Conditioning", sortOrder: 1 },
    ]);
    const allFacilities = await testDb.select().from(facilities);
    const fan = allFacilities.find((f) => f.name === "Fan")!;
    const ac = allFacilities.find((f) => f.name === "Air Conditioning")!;

    const lodge1 = await createLodge(seedActor, {
      eventId,
      name: "White House Lotto",
      slug: "white-house-lotto",
      description: "Demo",
      address: "Demo address",
    });
    const maleCategory = await createCategory(seedActor, {
      lodgeId: lodge1.id,
      name: "Male Shared",
      mode: "SHARED",
      genderRestriction: "MALE",
      pricingModel: "PER_PERSON",
      defaultPriceMinor: 500000,
    });
    const buildingA = await createUnit(seedActor, { categoryId: maleCategory.id, name: "Building A", code: "A" });
    await setUnitFacilities(seedActor, buildingA.id, [fan.id]);
    for (let r = 1; r <= 3; r++) {
      const room = await createRoom(seedActor, {
        unitId: buildingA.id,
        name: `Room ${r}`,
        code: `R${r}`,
        genderRestriction: "MALE",
      });
      for (const letter of ["A", "B", "C", "D"]) await createBedspace(seedActor, room.id, letter);
    }

    const femaleCategory = await createCategory(seedActor, {
      lodgeId: lodge1.id,
      name: "Female Shared",
      mode: "SHARED",
      genderRestriction: "FEMALE",
      pricingModel: "PER_PERSON",
      defaultPriceMinor: 500000,
    });
    const buildingB = await createUnit(seedActor, { categoryId: femaleCategory.id, name: "Building B", code: "B" });
    for (let r = 1; r <= 2; r++) {
      const room = await createRoom(seedActor, {
        unitId: buildingB.id,
        name: `Room ${r}`,
        code: `R${r}`,
        genderRestriction: "FEMALE",
      });
      for (const letter of ["A", "B", "C", "D"]) await createBedspace(seedActor, room.id, letter);
    }

    const lodge2 = await createLodge(seedActor, {
      eventId,
      name: "Shiloh Apartments",
      slug: "shiloh-apartments",
      description: "Demo",
      address: "Demo address",
    });
    const privateCategory = await createCategory(seedActor, {
      lodgeId: lodge2.id,
      name: "Private",
      mode: "PRIVATE",
      pricingModel: "PER_UNIT",
      defaultPriceMinor: 1500000,
    });
    for (const [name, capacity] of [
      ["Chalet A", 4],
      ["Chalet B", 4],
      ["Chalet C", 2],
    ] as const) {
      const unit = await createUnit(seedActor, { categoryId: privateCategory.id, name, code: name.replace("Chalet ", "CH"), capacity });
      await setUnitFacilities(seedActor, unit.id, [ac.id]);
    }

    // Assertions: the numbers actually match what the brief's example describes.
    const allLodges = await testDb.select().from(lodges);
    expect(allLodges.map((l) => l.name).sort()).toEqual(["Shiloh Apartments", "White House Lotto"]);

    const allCategories = await testDb.select().from(accommodationCategories);
    expect(allCategories).toHaveLength(3);

    const allRooms = await testDb.select().from(rooms);
    expect(allRooms).toHaveLength(5); // 3 male rooms + 2 female rooms

    const allBedspaces = await testDb.select().from(bedspaces);
    expect(allBedspaces).toHaveLength(20); // 5 rooms x 4 bedspaces
  });
});
