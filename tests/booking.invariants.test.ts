import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  accommodationCategories,
  accommodationUnits,
  bedspaces,
  bookingOccupants,
  bookings,
  events,
  inventoryHolds,
  lodges,
  rooms,
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
    .values({ name: "Test", slug: "booking-test", year: 2026, bookingRefPrefix: "T-ACM" })
    .returning();
  eventId = event!.id;
});
afterAll(() => client.close());

beforeEach(async () => {
  const [lodge] = await db.insert(lodges).values({ eventId, name: "L", slug: "l-" + Math.random() }).returning();
  lodgeId = lodge!.id;
});

async function setupMaleRoomWithBedspaces(count = 2) {
  const [cat] = await db
    .insert(accommodationCategories)
    .values({
      lodgeId,
      name: "Male Shared",
      mode: "SHARED",
      genderRestriction: "MALE",
      pricingModel: "PER_PERSON",
      defaultPriceMinor: 500000,
    })
    .returning();
  const [unit] = await db.insert(accommodationUnits).values({ categoryId: cat!.id, name: "A", code: "A" }).returning();
  const [room] = await db
    .insert(rooms)
    .values({ unitId: unit!.id, name: "Room 1", code: "R1", genderRestriction: "MALE" })
    .returning();
  const beds = [];
  for (let i = 0; i < count; i++) {
    const [b] = await db
      .insert(bedspaces)
      .values({ roomId: room!.id, letter: String.fromCharCode(65 + i) })
      .returning();
    beds.push(b!);
  }
  return { cat: cat!, unit: unit!, room: room!, beds };
}

describe("inventory_holds: exactly one target", () => {
  it("rejects a hold with no target", async () => {
    await expect(
      db.insert(inventoryHolds).values({ expiresAt: new Date(Date.now() + 60000) }),
    ).rejects.toThrow();
  });

  it("rejects a hold with two targets", async () => {
    const { beds, room } = await setupMaleRoomWithBedspaces(1);
    await expect(
      db.insert(inventoryHolds).values({
        bedspaceId: beds[0]!.id,
        roomId: room.id,
        expiresAt: new Date(Date.now() + 60000),
      }),
    ).rejects.toThrow();
  });

  it("accepts a hold with exactly one target", async () => {
    const { beds } = await setupMaleRoomWithBedspaces(1);
    await expect(
      db.insert(inventoryHolds).values({ bedspaceId: beds[0]!.id, expiresAt: new Date(Date.now() + 60000) }),
    ).resolves.toBeDefined();
  });
});

describe("the core anti-oversell guarantee", () => {
  it("rejects a second hold on the same bedspace while the first is active", async () => {
    const { beds } = await setupMaleRoomWithBedspaces(1);
    await db.insert(inventoryHolds).values({ bedspaceId: beds[0]!.id, expiresAt: new Date(Date.now() + 60000) });
    await expect(
      db.insert(inventoryHolds).values({ bedspaceId: beds[0]!.id, expiresAt: new Date(Date.now() + 60000) }),
    ).rejects.toThrow();
  });

  it("allows a new hold on the same bedspace once the old one is deleted (expired + swept)", async () => {
    const { beds } = await setupMaleRoomWithBedspaces(1);
    const [hold] = await db
      .insert(inventoryHolds)
      .values({ bedspaceId: beds[0]!.id, expiresAt: new Date(Date.now() - 1000) })
      .returning();
    await db.delete(inventoryHolds).where(eq(inventoryHolds.id, hold!.id)); // simulates the sweep
    await expect(
      db.insert(inventoryHolds).values({ bedspaceId: beds[0]!.id, expiresAt: new Date(Date.now() + 60000) }),
    ).resolves.toBeDefined();
  });

  it("rejects a second occupant assigned to the same bedspace", async () => {
    const { beds } = await setupMaleRoomWithBedspaces(1);
    const [booking] = await db
      .insert(bookings)
      .values({
        eventId,
        reference: "T-ACM-00001",
        categoryId: (await setupMaleRoomWithBedspaces(0)).cat.id,
        bookerName: "A",
        bookerPhone: "1",
        bookerEmail: "a@a.com",
        occupantCount: 2,
        amountMinor: 1000,
        currency: "NGN",
      })
      .returning();
    await db.insert(bookingOccupants).values({
      bookingId: booking!.id,
      name: "First",
      gender: "MALE",
      bedspaceId: beds[0]!.id,
    });
    await expect(
      db.insert(bookingOccupants).values({
        bookingId: booking!.id,
        name: "Second",
        gender: "MALE",
        bedspaceId: beds[0]!.id,
      }),
    ).rejects.toThrow();
  });
});

describe("occupant gender must match the room", () => {
  it("rejects a female occupant assigned to a male-restricted room's bedspace", async () => {
    const { beds } = await setupMaleRoomWithBedspaces(1);
    const [booking] = await db
      .insert(bookings)
      .values({
        eventId,
        reference: "T-ACM-00002",
        categoryId: (await setupMaleRoomWithBedspaces(0)).cat.id,
        bookerName: "A",
        bookerPhone: "1",
        bookerEmail: "a@a.com",
        occupantCount: 1,
        amountMinor: 1000,
        currency: "NGN",
      })
      .returning();
    await expect(
      db.insert(bookingOccupants).values({
        bookingId: booking!.id,
        name: "Wrong Gender",
        gender: "FEMALE",
        bedspaceId: beds[0]!.id,
      }),
    ).rejects.toThrow(/gender/);
  });

  it("accepts a male occupant in the male-restricted room", async () => {
    const { beds } = await setupMaleRoomWithBedspaces(1);
    const [booking] = await db
      .insert(bookings)
      .values({
        eventId,
        reference: "T-ACM-00003",
        categoryId: (await setupMaleRoomWithBedspaces(0)).cat.id,
        bookerName: "A",
        bookerPhone: "1",
        bookerEmail: "a@a.com",
        occupantCount: 1,
        amountMinor: 1000,
        currency: "NGN",
      })
      .returning();
    await expect(
      db.insert(bookingOccupants).values({
        bookingId: booking!.id,
        name: "Right Gender",
        gender: "MALE",
        bedspaceId: beds[0]!.id,
      }),
    ).resolves.toBeDefined();
  });
});

describe("private whole-unit bookings can share one unit_id", () => {
  it("allows multiple occupants assigned to the same unit", async () => {
    const [cat] = await db
      .insert(accommodationCategories)
      .values({ lodgeId, name: "Private", mode: "PRIVATE", pricingModel: "PER_UNIT", defaultPriceMinor: 1000000 })
      .returning();
    const [unit] = await db
      .insert(accommodationUnits)
      .values({ categoryId: cat!.id, name: "Chalet A", code: "CHA", capacity: 4 })
      .returning();
    const [booking] = await db
      .insert(bookings)
      .values({
        eventId,
        reference: "T-ACM-00004",
        categoryId: cat!.id,
        bookerName: "A",
        bookerPhone: "1",
        bookerEmail: "a@a.com",
        occupantCount: 2,
        amountMinor: 1000000,
        currency: "NGN",
      })
      .returning();
    await db.insert(bookingOccupants).values([
      { bookingId: booking!.id, name: "One", gender: "MALE", unitId: unit!.id },
      { bookingId: booking!.id, name: "Two", gender: "FEMALE", unitId: unit!.id },
    ]);
    const rows = await db.select().from(bookingOccupants).where(eq(bookingOccupants.bookingId, booking!.id));
    expect(rows).toHaveLength(2);
  });
});
