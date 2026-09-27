import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { accommodationCategories, accommodationUnits, auditLogs, bedspaces, bookingOccupants, bookings, events, keyCustody, lodges, reallocationHistory, rooms, users } from "@/db/schema";

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
vi.mock("@/db/client", () => ({ getDb: () => testDb }));

const { computeGrants } = await import("@/lib/authz/authorize");
const { ROLE_DEFINITIONS } = await import("@/lib/authz/roles");
const { getOccupantReallocationChoices, reallocateOccupant } = await import("@/lib/booking/reallocation");
const { getOperationsOverview } = await import("@/lib/booking/operations");

let eventId: string;
const actorId = "00000000-0000-0000-0000-0000000000ad";
const role = ROLE_DEFINITIONS.find((item) => item.key === "accommodation_admin")!;
const admin = { userId: actorId, email: "admin@example.test", name: "Admin", roleKeys: [role.key], ...computeGrants([role]), lodgeIds: new Set<string>() };
let fixture = 0;

beforeAll(async () => {
  client = new PGlite();
  testDb = drizzle(client);
  await migrate(testDb, { migrationsFolder: "./drizzle" });
  const [event] = await testDb.insert(events).values({ name: "Reallocation test", slug: "reallocation-test", year: 2026, bookingRefPrefix: "REAL-ACM", status: "OPEN" }).returning();
  eventId = event!.id;
  await testDb.insert(users).values({ id: actorId, email: admin.email, name: admin.name, passwordHash: "test-hash" });
});
afterAll(() => client.close());

async function setup({ targetGender = "ANY" as "ANY" | "MALE" | "FEMALE", targetOccupied = false } = {}) {
  fixture += 1;
  const [lodge] = await testDb.insert(lodges).values({ eventId, name: "Operations Lodge", slug: `operations-${fixture}` }).returning();
  const [category] = await testDb.insert(accommodationCategories).values({ lodgeId: lodge!.id, name: "Shared", mode: "SHARED", genderRestriction: "ANY", pricingModel: "PER_PERSON", defaultPriceMinor: 700000 }).returning();
  const [unit] = await testDb.insert(accommodationUnits).values({ categoryId: category!.id, name: "Block", code: `B${fixture}` }).returning();
  const [sourceRoom] = await testDb.insert(rooms).values({ unitId: unit!.id, name: "Room 1", code: "R1", genderRestriction: "ANY" }).returning();
  const [targetRoom] = await testDb.insert(rooms).values({ unitId: unit!.id, name: "Room 2", code: "R2", genderRestriction: targetGender }).returning();
  const [source] = await testDb.insert(bedspaces).values({ roomId: sourceRoom!.id, letter: "1" }).returning();
  const [target] = await testDb.insert(bedspaces).values({ roomId: targetRoom!.id, letter: "1" }).returning();
  const [booking] = await testDb.insert(bookings).values({ eventId, categoryId: category!.id, reference: `REAL-ACM-${fixture}`, bookerName: "Guest", bookerPhone: "08000000000", bookerEmail: "guest@example.test", occupantCount: 1, amountMinor: 700000, currency: "NGN", paymentStatus: "PAID", accommodationStatus: "ALLOCATED", allocationStatus: "FULLY_ALLOCATED" }).returning();
  const [occupant] = await testDb.insert(bookingOccupants).values({ bookingId: booking!.id, name: "Guest One", gender: "MALE", bedspaceId: source!.id }).returning();
  if (targetOccupied) {
    const [otherBooking] = await testDb.insert(bookings).values({ eventId, categoryId: category!.id, reference: `REAL-ACM-X${fixture}`, bookerName: "Guest Two", bookerPhone: "08000000001", bookerEmail: "guest2@example.test", occupantCount: 1, amountMinor: 700000, currency: "NGN", paymentStatus: "PAID", accommodationStatus: "ALLOCATED", allocationStatus: "FULLY_ALLOCATED" }).returning();
    await testDb.insert(bookingOccupants).values({ bookingId: otherBooking!.id, name: "Guest Two", gender: "MALE", bedspaceId: target!.id });
  }
  return { lodge: lodge!, category: category!, source: source!, target: target!, booking: booking!, occupant: occupant! };
}

describe("shared accommodation reallocation", () => {
  it("lists paid occupants with their room, bedspace, and scoped guest operations counts", async () => {
    const data = await setup();
    const overview = await getOperationsOverview(admin, { q: "Guest One", status: "ALLOCATED", lodge: data.lodge.id });
    expect(overview.total).toBe(1);
    expect(overview.rows[0]).toMatchObject({ occupantName: "Guest One", roomName: "Room 1", bedspaceLetter: "1", lodgeName: "Operations Lodge" });
    expect(overview.totals.ALLOCATED).toBe(1);
  });

  it("limits a Lodge Coordinator's guest dashboard and reallocation access to assigned lodges", async () => {
    const assigned = await setup();
    await setup();
    const coordinatorRole = ROLE_DEFINITIONS.find((item) => item.key === "accommodation_officer")!;
    const coordinator = { ...admin, ...computeGrants([coordinatorRole]), roleKeys: [coordinatorRole.key], lodgeIds: new Set([assigned.lodge.id]) };
    const overview = await getOperationsOverview(coordinator);
    expect(overview.total).toBe(1);
    expect(overview.rows[0]?.lodgeId).toBe(assigned.lodge.id);
    expect(overview.lodges.map((lodge) => lodge.id)).toEqual([assigned.lodge.id]);
    expect(await getOccupantReallocationChoices(coordinator, assigned.booking.id, assigned.occupant.id)).toHaveLength(1);
    const unassigned = await setup();
    await expect(getOccupantReallocationChoices(coordinator, unassigned.booking.id, unassigned.occupant.id)).rejects.toThrow(/permission/);
  });

  it("moves a paid occupant atomically and writes history plus audit records", async () => {
    const data = await setup();
    const history = await reallocateOccupant(admin, data.booking.id, data.occupant.id, data.target.id, "Guest requested a quieter room");
    const [updatedOccupant] = await testDb.select().from(bookingOccupants).where(eq(bookingOccupants.id, data.occupant.id));
    const [audit] = await testDb.select().from(auditLogs).where(eq(auditLogs.entityId, data.occupant.id));
    expect(updatedOccupant!.bedspaceId).toBe(data.target.id);
    expect(history!.fromBedspaceId).toBe(data.source.id);
    expect(history!.toBedspaceId).toBe(data.target.id);
    expect(audit!.action).toBe("booking.reallocated");
  });

  it("does not offer or accept an occupied destination", async () => {
    const data = await setup({ targetOccupied: true });
    expect(await getOccupantReallocationChoices(admin, data.booking.id, data.occupant.id)).toEqual([]);
    await expect(reallocateOccupant(admin, data.booking.id, data.occupant.id, data.target.id, "Guest requested a quieter room")).rejects.toThrow("already been assigned");
    expect(await testDb.select().from(reallocationHistory).where(eq(reallocationHistory.bookingId, data.booking.id))).toHaveLength(0);
  });

  it("enforces room gender and requires active keys to be returned before moving", async () => {
    const data = await setup({ targetGender: "FEMALE" });
    expect(await getOccupantReallocationChoices(admin, data.booking.id, data.occupant.id)).toEqual([]);
    await expect(reallocateOccupant(admin, data.booking.id, data.occupant.id, data.target.id, "Guest requested a quieter room")).rejects.toThrow("gender restriction");
    await testDb.insert(keyCustody).values({ bookingId: data.booking.id, lodgeId: data.lodge.id, occupantId: data.occupant.id, keyLabel: "Room 1" });
    await expect(reallocateOccupant(admin, data.booking.id, data.occupant.id, data.target.id, "Guest requested a quieter room")).rejects.toThrow("Return or report");
  });

  it("requires a reason and rejects unpaid bookings", async () => {
    const data = await setup();
    await expect(reallocateOccupant(admin, data.booking.id, data.occupant.id, data.target.id, "no")).rejects.toThrow("between 5 and 500 characters");
    await testDb.update(bookings).set({ paymentStatus: "PENDING" }).where(eq(bookings.id, data.booking.id));
    await expect(reallocateOccupant(admin, data.booking.id, data.occupant.id, data.target.id, "Guest requested a move")).rejects.toThrow("Only a paid booking");
  });
});
