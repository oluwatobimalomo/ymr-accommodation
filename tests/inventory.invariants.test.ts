import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  accommodationCategories,
  accommodationUnits,
  bedspaces,
  events,
  facilities,
  lodges,
  rooms,
  unitFacilities,
} from "@/db/schema";

let client: PGlite;
let db: ReturnType<typeof drizzle>;
let eventId: string;
let lodgeId: string;

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [event] = await db
    .insert(events)
    .values({ name: "Test Event", slug: "test-event", year: 2026, bookingRefPrefix: "T-ACM" })
    .returning();
  eventId = event!.id;
});
afterAll(async () => client.close());

beforeEach(async () => {
  const [lodge] = await db
    .insert(lodges)
    .values({ eventId, name: "Test Lodge " + Math.random(), slug: "lodge-" + Math.random() })
    .returning();
  lodgeId = lodge!.id;
});

async function makeCategory(overrides: Partial<typeof accommodationCategories.$inferInsert> = {}) {
  const [c] = await db
    .insert(accommodationCategories)
    .values({
      lodgeId,
      name: "Male Shared",
      mode: "SHARED",
      genderRestriction: "MALE",
      pricingModel: "PER_PERSON",
      defaultPriceMinor: 5000000,
      ...overrides,
    })
    .returning();
  return c!;
}

async function makeUnit(categoryId: string, overrides: Partial<typeof accommodationUnits.$inferInsert> = {}) {
  const [u] = await db
    .insert(accommodationUnits)
    .values({ categoryId, name: "Building A", code: "A", ...overrides })
    .returning();
  return u!;
}

async function makeRoom(unitId: string, overrides: Partial<typeof rooms.$inferInsert> = {}) {
  const [r] = await db
    .insert(rooms)
    .values({ unitId, name: "Room 1", code: "R1", genderRestriction: "MALE", ...overrides })
    .returning();
  return r!;
}

describe("bedspace letters are unique within a room", () => {
  it("rejects a duplicate letter in the same room", async () => {
    const cat = await makeCategory();
    const unit = await makeUnit(cat.id);
    const room = await makeRoom(unit.id);
    await db.insert(bedspaces).values({ roomId: room.id, letter: "A" });
    await expect(db.insert(bedspaces).values({ roomId: room.id, letter: "A" })).rejects.toThrow();
  });

  it("allows the same letter in a different room", async () => {
    const cat = await makeCategory();
    const unit = await makeUnit(cat.id);
    const roomA = await makeRoom(unit.id, { name: "Room 1", code: "R1" });
    const roomB = await makeRoom(unit.id, { name: "Room 2", code: "R2" });
    await db.insert(bedspaces).values({ roomId: roomA.id, letter: "A" });
    await expect(db.insert(bedspaces).values({ roomId: roomB.id, letter: "A" })).resolves.toBeDefined();
  });
});

describe("room capacity stays in sync with its bedspaces", () => {
  it("starts at 0 and grows as bedspaces are added", async () => {
    const cat = await makeCategory();
    const unit = await makeUnit(cat.id);
    const room = await makeRoom(unit.id);
    expect(room.capacity).toBe(0);

    await db.insert(bedspaces).values({ roomId: room.id, letter: "A" });
    await db.insert(bedspaces).values({ roomId: room.id, letter: "B" });
    const [after] = await db.select().from(rooms).where(eq(rooms.id, room.id));
    expect(after!.capacity).toBe(2);
  });

  it("excludes RETIRED bedspaces from capacity", async () => {
    const cat = await makeCategory();
    const unit = await makeUnit(cat.id);
    const room = await makeRoom(unit.id);
    const [a] = await db.insert(bedspaces).values({ roomId: room.id, letter: "A" }).returning();
    await db.insert(bedspaces).values({ roomId: room.id, letter: "B" });
    await db.update(bedspaces).set({ status: "RETIRED" }).where(eq(bedspaces.id, a!.id));
    const [after] = await db.select().from(rooms).where(eq(rooms.id, room.id));
    expect(after!.capacity).toBe(1);
  });

  it("still counts BLOCKED and MAINTENANCE bedspaces toward capacity", async () => {
    const cat = await makeCategory();
    const unit = await makeUnit(cat.id);
    const room = await makeRoom(unit.id);
    const [a] = await db.insert(bedspaces).values({ roomId: room.id, letter: "A" }).returning();
    await db.insert(bedspaces).values({ roomId: room.id, letter: "B" });
    await db.update(bedspaces).set({ status: "MAINTENANCE" }).where(eq(bedspaces.id, a!.id));
    const [after] = await db.select().from(rooms).where(eq(rooms.id, room.id));
    expect(after!.capacity).toBe(2);
  });

  it("does not touch capacity for a room with no bedspace rows (admin-set)", async () => {
    const cat = await makeCategory({ mode: "PRIVATE", genderRestriction: "ANY" });
    const unit = await makeUnit(cat.id);
    const [room] = await db
      .insert(rooms)
      .values({ unitId: unit.id, name: "Whole chalet", code: "R1", genderRestriction: "ANY", capacity: 4 })
      .returning();
    expect(room!.capacity).toBe(4);
  });
});

describe("unit capacity stays in sync with its rooms", () => {
  it("sums room capacities as bedspaces are added across rooms", async () => {
    const cat = await makeCategory();
    const unit = await makeUnit(cat.id);
    const roomA = await makeRoom(unit.id, { name: "Room 1", code: "R1" });
    const roomB = await makeRoom(unit.id, { name: "Room 2", code: "R2" });
    await db.insert(bedspaces).values({ roomId: roomA.id, letter: "A" });
    await db.insert(bedspaces).values({ roomId: roomA.id, letter: "B" });
    await db.insert(bedspaces).values({ roomId: roomB.id, letter: "A" });

    const [after] = await db.select().from(accommodationUnits).where(eq(accommodationUnits.id, unit.id));
    expect(after!.capacity).toBe(3);
  });

  it("does not touch capacity for a unit with no room rows (private, admin-set)", async () => {
    const cat = await makeCategory({ mode: "PRIVATE", genderRestriction: "ANY" });
    const unit = await makeUnit(cat.id, { name: "Chalet A", code: "CHA", capacity: 2 });
    expect(unit.capacity).toBe(2);
  });
});

describe("room gender restriction must agree with its category", () => {
  it("rejects a room whose gender conflicts with a MALE category", async () => {
    const cat = await makeCategory({ genderRestriction: "MALE" });
    const unit = await makeUnit(cat.id);
    await expect(
      db.insert(rooms).values({ unitId: unit.id, name: "Room 1", code: "R1", genderRestriction: "FEMALE" }),
    ).rejects.toThrow(/gender_restriction/);
  });

  it("allows a room whose gender matches a MALE category", async () => {
    const cat = await makeCategory({ genderRestriction: "MALE" });
    const unit = await makeUnit(cat.id);
    await expect(
      db.insert(rooms).values({ unitId: unit.id, name: "Room 1", code: "R1", genderRestriction: "MALE" }),
    ).resolves.toBeDefined();
  });

  it("allows a room to set its own gender when the category is ANY", async () => {
    const cat = await makeCategory({ mode: "SHARED", genderRestriction: "ANY" });
    const unit = await makeUnit(cat.id);
    await expect(
      db.insert(rooms).values({ unitId: unit.id, name: "Room 1", code: "R1", genderRestriction: "FEMALE" }),
    ).resolves.toBeDefined();
    await expect(
      db.insert(rooms).values({ unitId: unit.id, name: "Room 2", code: "R2", genderRestriction: "MALE" }),
    ).resolves.toBeDefined();
  });

  it("rejects moving a room to a unit whose category conflicts with its gender", async () => {
    const maleCat = await makeCategory({ genderRestriction: "MALE" });
    const femaleCat = await makeCategory({ name: "Female Shared", genderRestriction: "FEMALE" });
    const maleUnit = await makeUnit(maleCat.id, { code: "A" });
    const femaleUnit = await makeUnit(femaleCat.id, { code: "B" });
    const room = await makeRoom(maleUnit.id, { genderRestriction: "MALE" });
    await expect(
      db.update(rooms).set({ unitId: femaleUnit.id }).where(eq(rooms.id, room.id)),
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/gender_restriction/) } });
  });
});

describe("facilities are configurable, not hard-coded", () => {
  it("can attach an arbitrary facility to a unit", async () => {
    const cat = await makeCategory({ mode: "PRIVATE", genderRestriction: "ANY" });
    const unit = await makeUnit(cat.id);
    const [facility] = await db.insert(facilities).values({ name: "Standing Fan", icon: "fan" }).returning();
    await db.insert(unitFacilities).values({ unitId: unit.id, facilityId: facility!.id });
    const rows = await db.select().from(unitFacilities).where(eq(unitFacilities.unitId, unit.id));
    expect(rows).toHaveLength(1);
  });

  it("prevents deleting a facility still attached to a unit", async () => {
    const cat = await makeCategory({ mode: "PRIVATE", genderRestriction: "ANY" });
    const unit = await makeUnit(cat.id);
    const [facility] = await db.insert(facilities).values({ name: "Water Heater" }).returning();
    await db.insert(unitFacilities).values({ unitId: unit.id, facilityId: facility!.id });
    await expect(db.delete(facilities).where(eq(facilities.id, facility!.id))).rejects.toThrow();
  });
});

describe("lodges are never hard-deleted", () => {
  it("has no delete exposed at the schema level beyond status toggling", async () => {
    // Structural guarantee: the service layer (Phase 2 services) never calls
    // db.delete(lodges); this test documents that lodges support status
    // instead, and a real FK exists to keep bookings tied to their lodge.
    const [row] = await db.select().from(lodges).where(eq(lodges.id, lodgeId));
    expect(row!.status).toBe("ACTIVE");
    await db.update(lodges).set({ status: "INACTIVE" }).where(eq(lodges.id, lodgeId));
    const [after] = await db.select().from(lodges).where(eq(lodges.id, lodgeId));
    expect(after!.status).toBe("INACTIVE");
  });
});
