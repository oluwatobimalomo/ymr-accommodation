import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { accommodationCategories, accommodationUnits, bedspaces, events, lodges, rooms } from "@/db/schema";
import { renumberAllBedspaces } from "@/lib/inventory/renumber";

let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  client = new PGlite();
  db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
});
afterAll(() => client.close());

async function makeRoomWithLabels(labels: string[]) {
  const [event] = await db
    .insert(events)
    .values({ name: "T", slug: "renumber-" + Math.random().toString(36).slice(2), year: 2026, bookingRefPrefix: "T-ACM" })
    .returning();
  const [lodge] = await db.insert(lodges).values({ eventId: event!.id, name: "L", slug: "renumber-lodge-" + Math.random().toString(36).slice(2) }).returning();
  const [category] = await db
    .insert(accommodationCategories)
    .values({ lodgeId: lodge!.id, name: "C", mode: "SHARED", pricingModel: "PER_PERSON", defaultPriceMinor: 1000 })
    .returning();
  const [unit] = await db.insert(accommodationUnits).values({ categoryId: category!.id, name: "U", code: "U1" }).returning();
  const [room] = await db.insert(rooms).values({ unitId: unit!.id, name: "Room 1", code: "R1" }).returning();
  // Insert one at a time so createdAt ordering matches array order, exactly
  // reproducing how the old buggy scheme would have created them in sequence.
  for (const letter of labels) {
    await db.insert(bedspaces).values({ roomId: room!.id, letter });
  }
  return room!;
}

async function currentLabelsInOrder(roomId: string) {
  const rows = await db.select().from(bedspaces).where(eq(bedspaces.roomId, roomId)).orderBy(asc(bedspaces.createdAt));
  return rows.map((r) => r.letter);
}

describe("renumberAllBedspaces", () => {
  it("fixes the exact real-world bug: A-Z followed by plain numbers 27-40, in one room of 40", async () => {
    // Reproduces exactly what the old numeric-fallback scheme produced.
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const overflow = Array.from({ length: 14 }, (_, i) => String(27 + i)); // 27..40
    const room = await makeRoomWithLabels([...letters, ...overflow]);

    const result = await renumberAllBedspaces(db as unknown as Parameters<typeof renumberAllBedspaces>[0]);
    expect(result.roomsChanged).toBeGreaterThanOrEqual(1);

    const finalLabels = await currentLabelsInOrder(room.id);
    expect(finalLabels).toEqual(Array.from({ length: 40 }, (_, i) => String(i + 1)));
  });

  it("does not touch a room that is already correctly numbered", async () => {
    const room = await makeRoomWithLabels(["1", "2", "3", "4"]);
    const result = await renumberAllBedspaces(db as unknown as Parameters<typeof renumberAllBedspaces>[0]);
    const finalLabels = await currentLabelsInOrder(room.id);
    expect(finalLabels).toEqual(["1", "2", "3", "4"]);
    // Confirm this specific already-correct room wasn't what changed by
    // re-running immediately: a second run should report zero further changes.
    const second = await renumberAllBedspaces(db as unknown as Parameters<typeof renumberAllBedspaces>[0]);
    expect(second.roomsChanged).toBe(0);
  });

  it("is idempotent: running it twice in a row produces the same correct result", async () => {
    const room = await makeRoomWithLabels(["C", "A", "B"]); // out-of-order labels, as if manually mixed
    await renumberAllBedspaces(db as unknown as Parameters<typeof renumberAllBedspaces>[0]);
    const first = await currentLabelsInOrder(room.id);
    await renumberAllBedspaces(db as unknown as Parameters<typeof renumberAllBedspaces>[0]);
    const second = await currentLabelsInOrder(room.id);
    expect(second).toEqual(first);
    expect(first).toEqual(["1", "2", "3"]); // creation order preserved, not alphabetical
  });

  it("never violates the unique(room, letter) constraint even with colliding old and new labels", async () => {
    // Old label "2" already exists where the new scheme would also want to
    // place a "2" at a different position - the classic collision risk this
    // two-phase rename exists to avoid.
    const room = await makeRoomWithLabels(["A", "2", "C"]);
    await expect(renumberAllBedspaces(db as unknown as Parameters<typeof renumberAllBedspaces>[0])).resolves.toBeDefined();
    const finalLabels = await currentLabelsInOrder(room.id);
    expect(finalLabels).toEqual(["1", "2", "3"]);
    expect(new Set(finalLabels).size).toBe(3); // no duplicates survived
  });
});
