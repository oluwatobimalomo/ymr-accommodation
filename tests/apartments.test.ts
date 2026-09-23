import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { accommodationCategories, accommodationUnits, bedspaces, events, facilities, rooms } from "@/db/schema";
import { computeGrants } from "@/lib/authz/authorize";
import { ROLE_DEFINITIONS } from "@/lib/authz/roles";

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
vi.mock("@/db/client", () => ({ getDb: () => testDb }));

const { createApartment, listApartmentsForLodge, getApartmentDetail, updateApartment, addBedspacesToApartment } =
  await import("@/lib/inventory/apartments");
const { createLodge } = await import("@/lib/inventory/lodges");

let eventId: string;
const admin = (() => {
  const def = ROLE_DEFINITIONS.find((r) => r.key === "accommodation_admin")!;
  return {
    userId: "00000000-0000-0000-0000-0000000000ff",
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
    .values({ name: "T", slug: "apartments-test", year: 2026, bookingRefPrefix: "T-ACM" })
    .returning();
  eventId = event!.id;
});
afterAll(() => client.close());

describe("createApartment: PRIVATE", () => {
  it("creates a category + unit together, PER_UNIT pricing, with facilities attached", async () => {
    const lodge = await createLodge(admin, { eventId, name: "L1", slug: "apt-lodge-1" });
    const [fan] = await testDb.insert(facilities).values({ name: "Fan-apt-test" }).returning();

    const result = await createApartment(admin, {
      lodgeId: lodge.id,
      name: "Chalet A",
      mode: "PRIVATE",
      priceNaira: 15000,
      facilityIds: [fan!.id],
    });

    const [category] = await testDb.select().from(accommodationCategories).where(eq(accommodationCategories.id, result.categoryId));
    expect(category!.mode).toBe("PRIVATE");
    expect(category!.pricingModel).toBe("PER_UNIT");
    expect(category!.defaultPriceMinor).toBe(1500000);

    const [unit] = await testDb.select().from(accommodationUnits).where(eq(accommodationUnits.id, result.unitId));
    expect(unit!.name).toBe("Chalet A");

    const detail = await getApartmentDetail(result.unitId);
    expect(detail!.facilityIds).toEqual([fan!.id]);
    expect(detail!.room).toBeNull();
  });

  it("rejects an invalid price", async () => {
    const lodge = await createLodge(admin, { eventId, name: "L2", slug: "apt-lodge-2" });
    await expect(
      createApartment(admin, { lodgeId: lodge.id, name: "X", mode: "PRIVATE", priceNaira: 0 }),
    ).rejects.toThrow(/valid price/);
  });
});

describe("createApartment: SHARED", () => {
  it("creates a category + unit + room + N lettered bedspaces, PER_PERSON pricing", async () => {
    const lodge = await createLodge(admin, { eventId, name: "L3", slug: "apt-lodge-3" });
    const result = await createApartment(admin, {
      lodgeId: lodge.id,
      name: "Male Shared Room 1",
      mode: "SHARED",
      priceNaira: 5000,
      genderRestriction: "MALE",
      bedspaceCount: 4,
    });

    const [category] = await testDb.select().from(accommodationCategories).where(eq(accommodationCategories.id, result.categoryId));
    expect(category!.pricingModel).toBe("PER_PERSON");
    expect(category!.genderRestriction).toBe("MALE");

    const detail = await getApartmentDetail(result.unitId);
    expect(detail!.room).not.toBeNull();
    expect(detail!.room!.genderRestriction).toBe("MALE");
    expect(detail!.bedspaceList.map((b) => b.letter)).toEqual(["A", "B", "C", "D"]);

    // Capacity-sync trigger from Phase 2 should already have picked this up.
    const [unit] = await testDb.select().from(accommodationUnits).where(eq(accommodationUnits.id, result.unitId));
    expect(unit!.capacity).toBe(4);
  });

  it("rejects a bedspace count of zero", async () => {
    const lodge = await createLodge(admin, { eventId, name: "L4", slug: "apt-lodge-4" });
    await expect(
      createApartment(admin, {
        lodgeId: lodge.id,
        name: "X",
        mode: "SHARED",
        priceNaira: 5000,
        genderRestriction: "FEMALE",
        bedspaceCount: 0,
      }),
    ).rejects.toThrow(/at least 1 bedspace/);
  });

  it("still enforces the gender-match trigger from Phase 2 underneath", async () => {
    // This is the real proof this simplified layer didn't bypass existing
    // invariants: a shared apartment's room and category genders always
    // agree by construction, but let's confirm the trigger is still live
    // by attempting to violate it directly against the created room.
    const lodge = await createLodge(admin, { eventId, name: "L5", slug: "apt-lodge-5" });
    const result = await createApartment(admin, {
      lodgeId: lodge.id,
      name: "Female Room",
      mode: "SHARED",
      priceNaira: 5000,
      genderRestriction: "FEMALE",
      bedspaceCount: 2,
    });
    const detail = await getApartmentDetail(result.unitId);
    await expect(
      testDb.update(rooms).set({ genderRestriction: "MALE" }).where(eq(rooms.id, detail!.room!.id)),
    ).rejects.toThrow();
  });
});

describe("listApartmentsForLodge", () => {
  it("returns a flat list across categories, with image and capacity", async () => {
    const lodge = await createLodge(admin, { eventId, name: "L6", slug: "apt-lodge-6" });
    await createApartment(admin, { lodgeId: lodge.id, name: "Chalet A", mode: "PRIVATE", priceNaira: 15000 });
    await createApartment(admin, {
      lodgeId: lodge.id,
      name: "Shared Room 1",
      mode: "SHARED",
      priceNaira: 5000,
      genderRestriction: "MALE",
      bedspaceCount: 3,
    });

    const list = await listApartmentsForLodge(lodge.id);
    expect(list).toHaveLength(2);
    expect(list.find((a) => a.name === "Chalet A")?.mode).toBe("PRIVATE");
    expect(list.find((a) => a.name === "Shared Room 1")?.capacity).toBe(3);
  });
});

describe("updateApartment", () => {
  it("updates name (kept in sync with the category), price, and facilities", async () => {
    const lodge = await createLodge(admin, { eventId, name: "L7", slug: "apt-lodge-7" });
    const [fan] = await testDb.insert(facilities).values({ name: "AC-apt-test" }).returning();
    const result = await createApartment(admin, { lodgeId: lodge.id, name: "Old Name", mode: "PRIVATE", priceNaira: 10000 });

    await updateApartment(admin, result.unitId, { name: "New Name", priceNaira: 20000, facilityIds: [fan!.id] });

    const [unit] = await testDb.select().from(accommodationUnits).where(eq(accommodationUnits.id, result.unitId));
    expect(unit!.name).toBe("New Name");
    const [category] = await testDb.select().from(accommodationCategories).where(eq(accommodationCategories.id, result.categoryId));
    expect(category!.name).toBe("New Name"); // kept in sync
    expect(category!.defaultPriceMinor).toBe(2000000);

    const detail = await getApartmentDetail(result.unitId);
    expect(detail!.facilityIds).toEqual([fan!.id]);
  });
});

describe("addBedspacesToApartment", () => {
  it("adds more lettered bedspaces continuing from where the existing ones left off", async () => {
    const lodge = await createLodge(admin, { eventId, name: "L8", slug: "apt-lodge-8" });
    const result = await createApartment(admin, {
      lodgeId: lodge.id,
      name: "Room X",
      mode: "SHARED",
      priceNaira: 5000,
      genderRestriction: "ANY",
      bedspaceCount: 2,
    });

    await addBedspacesToApartment(admin, result.unitId, 2);

    const detail = await getApartmentDetail(result.unitId);
    expect(detail!.bedspaceList.map((b) => b.letter)).toEqual(["A", "B", "C", "D"]);

    const [unit] = await testDb.select().from(accommodationUnits).where(eq(accommodationUnits.id, result.unitId));
    expect(unit!.capacity).toBe(4); // capacity-sync trigger picked up the new bedspaces too
  });

  it("rejects adding bedspaces to a private apartment with no room", async () => {
    const lodge = await createLodge(admin, { eventId, name: "L9", slug: "apt-lodge-9" });
    const result = await createApartment(admin, { lodgeId: lodge.id, name: "Chalet Z", mode: "PRIVATE", priceNaira: 10000 });
    await expect(addBedspacesToApartment(admin, result.unitId, 2)).rejects.toThrow(/no room/);
  });
});

describe("bedspace letter generation past 26", () => {
  it("uses spreadsheet-style double letters, never falling back to plain numbers", async () => {
    const lodge = await createLodge(admin, { eventId, name: "L10", slug: "apt-lodge-10" });
    const result = await createApartment(admin, {
      lodgeId: lodge.id,
      name: "Huge Room",
      mode: "SHARED",
      priceNaira: 1000,
      genderRestriction: "ANY",
      bedspaceCount: 28,
    });
    const detail = await getApartmentDetail(result.unitId);
    const letters = detail!.bedspaceList.map((b) => b.letter);
    expect(letters[25]).toBe("Z");
    expect(letters[26]).toBe("AA");
    expect(letters[27]).toBe("AB");
    expect(letters.every((l) => /^[A-Z]+$/.test(l))).toBe(true); // never a bare number
  });
});
