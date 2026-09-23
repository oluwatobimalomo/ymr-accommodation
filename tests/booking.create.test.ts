import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accommodationUnits, bedspaces, bookingOccupants, bookings, inventoryHolds, rooms } from "@/db/schema";

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;

vi.mock("@/db/client", () => ({ getDb: () => testDb }));

const { createBooking, InventoryUnavailableError } = await import("@/lib/booking/create-booking");
const { createLodge, setLodgeStatus } = await import("@/lib/inventory/lodges");
const { createCategory } = await import("@/lib/inventory/categories");
const { createUnit } = await import("@/lib/inventory/units");
const { createRoom } = await import("@/lib/inventory/rooms");
const { createBedspace } = await import("@/lib/inventory/bedspaces");
const { computeGrants } = await import("@/lib/authz/authorize");
const { ROLE_DEFINITIONS } = await import("@/lib/authz/roles");

let eventId: string;
let slugCounter = 0;
function uniqueSlug(): string {
  slugCounter += 1;
  return `test-slug-${slugCounter}`;
}
const admin = (() => {
  const def = ROLE_DEFINITIONS.find((r) => r.key === "accommodation_admin")!;
  return {
    userId: "00000000-0000-0000-0000-0000000000aa",
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
  const { events } = await import("@/db/schema");
  const [event] = await testDb
    .insert(events)
    .values({ name: "Test", slug: uniqueSlug(), year: 2026, bookingRefPrefix: "T-ACM", status: "OPEN" })
    .returning();
  eventId = event!.id;
});
afterAll(() => client.close());

async function makeSharedMaleRoom(bedspaceCount = 4) {
  const lodge = await createLodge(admin, { eventId, name: "L", slug: "l-" + uniqueSlug() });
  const category = await createCategory(admin, {
    lodgeId: lodge.id,
    name: "Male Shared",
    mode: "SHARED",
    genderRestriction: "MALE",
    pricingModel: "PER_PERSON",
    defaultPriceMinor: 500000,
  });
  const unit = await createUnit(admin, { categoryId: category.id, name: "A", code: "A" });
  const room = await createRoom(admin, { unitId: unit.id, name: "Room 1", code: "R1", genderRestriction: "MALE" });
  const beds = [];
  for (let i = 0; i < bedspaceCount; i++) beds.push(await createBedspace(admin, room.id, String.fromCharCode(65 + i)));
  return { lodge, category, unit, room, beds };
}

function occupant(name: string, bedspaceId?: string) {
  return { name, phone: "0800", email: "x@x.com", gender: "MALE" as const, bedspaceId };
}

describe("createBooking: customer-selected bedspace (SHARED)", () => {
  it("creates a booking, occupants, and converts the holds to belong to it", async () => {
    const { category, beds } = await makeSharedMaleRoom();
    const result = await createBooking({
      categoryId: category.id,
      bookerName: "John Doe",
      bookerPhone: "08000000000",
      bookerEmail: "john@example.com",
      occupants: [occupant("John Doe", beds[0]!.id), occupant("James Smith", beds[1]!.id)],
    });

    expect(result.reference).toMatch(/^T-ACM-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(result.amountMinor).toBe(1_000_000); // 2 occupants x 500000

    const occRows = await testDb.select().from(bookingOccupants).where(eq(bookingOccupants.bookingId, result.bookingId));
    expect(occRows).toHaveLength(2);

    const holdRows = await testDb.select().from(inventoryHolds).where(eq(inventoryHolds.bookingId, result.bookingId));
    expect(holdRows).toHaveLength(2);
  });

  it("rejects booking the same bedspace twice (the actual anti-oversell test)", async () => {
    const { category, beds } = await makeSharedMaleRoom();
    await createBooking({
      categoryId: category.id,
      bookerName: "First",
      bookerPhone: "1",
      bookerEmail: "a@a.com",
      occupants: [occupant("First", beds[0]!.id)],
    });

    await expect(
      createBooking({
        categoryId: category.id,
        bookerName: "Second",
        bookerPhone: "2",
        bookerEmail: "b@b.com",
        occupants: [occupant("Second", beds[0]!.id)],
      }),
    ).rejects.toThrow(InventoryUnavailableError);
  });

  it("rejects two occupants requesting the same bedspace in one request", async () => {
    const { category, beds } = await makeSharedMaleRoom();
    await expect(
      createBooking({
        categoryId: category.id,
        bookerName: "X",
        bookerPhone: "1",
        bookerEmail: "a@a.com",
        occupants: [occupant("A", beds[0]!.id), occupant("B", beds[0]!.id)],
      }),
    ).rejects.toThrow(/different bedspace/);
  });

  it("rejects a booking on an inactive lodge", async () => {
    const { category, beds, lodge } = await makeSharedMaleRoom();
    await setLodgeStatus(admin, lodge.id, "INACTIVE", "closed for testing");
    await expect(
      createBooking({
        categoryId: category.id,
        bookerName: "X",
        bookerPhone: "1",
        bookerEmail: "a@a.com",
        occupants: [occupant("A", beds[0]!.id)],
      }),
    ).rejects.toThrow(/lodge/);
  });
});

describe("createBooking: system auto-allocates (SHARED, customerSelectsBedspace=false)", () => {
  it("assigns bedspaces automatically without the customer choosing", async () => {
    const lodge = await createLodge(admin, { eventId, name: "L2", slug: "l2-" + uniqueSlug() });
    const category = await createCategory(admin, {
      lodgeId: lodge.id,
      name: "Male Shared Auto",
      mode: "SHARED",
      genderRestriction: "MALE",
      pricingModel: "PER_PERSON",
      defaultPriceMinor: 100000,
      customerSelectsBedspace: false,
      customerSelectsRoom: false,
    });
    const unit = await createUnit(admin, { categoryId: category.id, name: "A", code: "A" });
    const room = await createRoom(admin, { unitId: unit.id, name: "Room 1", code: "R1", genderRestriction: "MALE" });
    await createBedspace(admin, room.id, "A");
    await createBedspace(admin, room.id, "B");

    const result = await createBooking({
      categoryId: category.id,
      bookerName: "Auto Person",
      bookerPhone: "1",
      bookerEmail: "a@a.com",
      occupants: [occupant("One"), occupant("Two")],
    });

    const occRows = await testDb.select().from(bookingOccupants).where(eq(bookingOccupants.bookingId, result.bookingId));
    expect(occRows.every((o) => o.bedspaceId !== null)).toBe(true);
    expect(new Set(occRows.map((o) => o.bedspaceId)).size).toBe(2);
  });

  it("fails cleanly when not enough space remains", async () => {
    const lodge = await createLodge(admin, { eventId, name: "L3", slug: "l3-" + uniqueSlug() });
    const category = await createCategory(admin, {
      lodgeId: lodge.id,
      name: "Tiny",
      mode: "SHARED",
      genderRestriction: "MALE",
      pricingModel: "PER_PERSON",
      defaultPriceMinor: 100000,
      customerSelectsBedspace: false,
    });
    const unit = await createUnit(admin, { categoryId: category.id, name: "A", code: "A" });
    const room = await createRoom(admin, { unitId: unit.id, name: "Room 1", code: "R1", genderRestriction: "MALE" });
    await createBedspace(admin, room.id, "A");

    await expect(
      createBooking({
        categoryId: category.id,
        bookerName: "X",
        bookerPhone: "1",
        bookerEmail: "a@a.com",
        occupants: [occupant("One"), occupant("Two")],
      }),
    ).rejects.toThrow(InventoryUnavailableError);
  });
});

describe("createBooking: entire-room booking", () => {
  it("books every bedspace in the room when all are free", async () => {
    const { category, room, beds } = await makeSharedMaleRoom(3);
    await testDb
      .update((await import("@/db/schema")).accommodationCategories)
      .set({ allowEntireRoomBooking: true })
      .where(eq((await import("@/db/schema")).accommodationCategories.id, category.id));

    const result = await createBooking({
      categoryId: category.id,
      bookerName: "Group Leader",
      bookerPhone: "1",
      bookerEmail: "a@a.com",
      entireRoomId: room.id,
      occupants: beds.map((_, i) => occupant(`Person ${i + 1}`)),
    });

    const occRows = await testDb.select().from(bookingOccupants).where(eq(bookingOccupants.bookingId, result.bookingId));
    expect(occRows).toHaveLength(3);
    expect(new Set(occRows.map((o) => o.bedspaceId))).toEqual(new Set(beds.map((b) => b.id)));
  });

  it("rejects entire-room booking when a bedspace is already taken", async () => {
    const { category, room, beds } = await makeSharedMaleRoom(2);
    await testDb
      .update((await import("@/db/schema")).accommodationCategories)
      .set({ allowEntireRoomBooking: true })
      .where(eq((await import("@/db/schema")).accommodationCategories.id, category.id));

    await createBooking({
      categoryId: category.id,
      bookerName: "First",
      bookerPhone: "1",
      bookerEmail: "a@a.com",
      occupants: [occupant("First", beds[0]!.id)],
    });

    await expect(
      createBooking({
        categoryId: category.id,
        bookerName: "Group",
        bookerPhone: "1",
        bookerEmail: "a@a.com",
        entireRoomId: room.id,
        occupants: [occupant("A"), occupant("B")],
      }),
    ).rejects.toThrow(InventoryUnavailableError);
  });
});

describe("createBooking: PRIVATE whole-unit", () => {
  it("lets the customer pick a specific unit", async () => {
    const lodge = await createLodge(admin, { eventId, name: "Shiloh", slug: uniqueSlug() });
    const category = await createCategory(admin, {
      lodgeId: lodge.id,
      name: "Private",
      mode: "PRIVATE",
      pricingModel: "PER_UNIT",
      defaultPriceMinor: 1_500_000,
    });
    const unit = await createUnit(admin, { categoryId: category.id, name: "Chalet A", code: "CHA", capacity: 4 });

    const result = await createBooking({
      categoryId: category.id,
      bookerName: "Private Booker",
      bookerPhone: "1",
      bookerEmail: "a@a.com",
      unitId: unit.id,
      occupants: [occupant("One"), occupant("Two")],
    });
    expect(result.amountMinor).toBe(1_500_000); // PER_UNIT: flat regardless of occupant count

    const occRows = await testDb.select().from(bookingOccupants).where(eq(bookingOccupants.bookingId, result.bookingId));
    expect(occRows.every((o) => o.unitId === unit.id)).toBe(true);
  });

  it("rejects booking the same private unit twice", async () => {
    const lodge = await createLodge(admin, { eventId, name: "Shiloh2", slug: uniqueSlug() });
    const category = await createCategory(admin, {
      lodgeId: lodge.id,
      name: "Private",
      mode: "PRIVATE",
      pricingModel: "PER_UNIT",
      defaultPriceMinor: 1000,
    });
    const unit = await createUnit(admin, { categoryId: category.id, name: "Chalet B", code: "CHB" });

    await createBooking({
      categoryId: category.id,
      bookerName: "First",
      bookerPhone: "1",
      bookerEmail: "a@a.com",
      unitId: unit.id,
      occupants: [occupant("One")],
    });

    await expect(
      createBooking({
        categoryId: category.id,
        bookerName: "Second",
        bookerPhone: "1",
        bookerEmail: "a@a.com",
        unitId: unit.id,
        occupants: [occupant("Two")],
      }),
    ).rejects.toThrow(InventoryUnavailableError);
  });
});

describe("createBooking: gender validation", () => {
  it("rejects a female occupant selecting a bedspace in a male-only room", async () => {
    const { category, beds } = await makeSharedMaleRoom();
    await expect(
      createBooking({
        categoryId: category.id,
        bookerName: "X",
        bookerPhone: "1",
        bookerEmail: "a@a.com",
        occupants: [{ name: "Jane", gender: "FEMALE", bedspaceId: beds[0]!.id }],
      }),
    ).rejects.toThrow(/gender/);
  });
});

describe("booking references", () => {
  it("generates unique, non-sequential references that never collide", async () => {
    const { category: c1, beds: b1 } = await makeSharedMaleRoom(4);
    const refs: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await createBooking({
        categoryId: c1.id,
        bookerName: "A",
        bookerPhone: "1",
        bookerEmail: "a@a.com",
        occupants: [occupant("A", b1[i]!.id)],
      });
      refs.push(r.reference);
    }
    expect(new Set(refs).size).toBe(refs.length); // all unique

    // Not a simple incrementing counter: consecutive references must not
    // differ by exactly one digit in the suffix (the exact guessability
    // problem this format replaces).
    const suffixes = refs.map((r) => r.split("-").pop()!);
    const looksSequential = suffixes.every((s, i) => i === 0 || Number(s) === Number(suffixes[i - 1]) + 1);
    expect(looksSequential).toBe(false);
  });
});
