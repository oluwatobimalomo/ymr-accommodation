import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accommodationCategories, accommodationUnits, bedspaces, bookingOccupants, bookings, events, lodges, privateUnitAllocations, rooms } from "@/db/schema";
import { authorizeAnyAssignedLodge, type Actor } from "@/lib/authz/authorize";

export async function getOccupancyReport(actor: Actor, filters: { event?: string; lodge?: string } = {}) {
  authorizeAnyAssignedLodge(actor, "booking.read");
  const db = getDb();
  const isGlobal = actor.globalPermissions.has("booking.read");
  const permittedLodges = [...actor.lodgeIds];
  if (!isGlobal && !permittedLodges.length) return { events: [], lodges: [], rows: [], summary: { capacity: 0, reserved: 0, checkedIn: 0, unassigned: 0 } };

  const conditions = [eq(lodges.status, "ACTIVE"), eq(accommodationCategories.status, "ACTIVE")];
  if (!isGlobal) conditions.push(inArray(lodges.id, permittedLodges));
  if (filters.lodge && (isGlobal || permittedLodges.includes(filters.lodge))) conditions.push(eq(lodges.id, filters.lodge));
  if (filters.event && /^[0-9a-f-]{36}$/i.test(filters.event)) conditions.push(eq(events.id, filters.event));
  const scope = and(...conditions);

  const [eventRows, lodgeRows, inventoryRows, occupantRows, privateRows] = await Promise.all([
    db.selectDistinct({ id: events.id, name: events.name }).from(events)
      .innerJoin(lodges, eq(lodges.eventId, events.id))
      .innerJoin(accommodationCategories, eq(accommodationCategories.lodgeId, lodges.id))
      .where(and(eq(lodges.status, "ACTIVE"), ...(isGlobal ? [] : [inArray(lodges.id, permittedLodges)]))).orderBy(events.name),
    db.selectDistinct({ id: lodges.id, name: lodges.name }).from(lodges)
      .innerJoin(accommodationCategories, eq(accommodationCategories.lodgeId, lodges.id))
      .innerJoin(events, eq(events.id, lodges.eventId))
      .where(scope).orderBy(lodges.name),
    db.select({ categoryId: accommodationCategories.id, categoryName: accommodationCategories.name, mode: accommodationCategories.mode, eventId: events.id, eventName: events.name, lodgeId: lodges.id, lodgeName: lodges.name,
      capacity: sql<number>`case when ${accommodationCategories.mode} = 'PRIVATE' then count(distinct case when ${accommodationUnits.status} = 'ACTIVE' then ${accommodationUnits.id} end) else count(distinct case when ${accommodationUnits.status} = 'ACTIVE' and ${rooms.status} = 'ACTIVE' and ${bedspaces.status} <> 'RETIRED' then ${bedspaces.id} end) end`.mapWith(Number),
    }).from(accommodationCategories).innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId)).innerJoin(events, eq(events.id, lodges.eventId))
      .leftJoin(accommodationUnits, eq(accommodationUnits.categoryId, accommodationCategories.id)).leftJoin(rooms, eq(rooms.unitId, accommodationUnits.id)).leftJoin(bedspaces, eq(bedspaces.roomId, rooms.id))
      .where(scope).groupBy(accommodationCategories.id, accommodationCategories.name, accommodationCategories.mode, events.id, events.name, lodges.id, lodges.name).orderBy(lodges.name, accommodationCategories.name),
    db.select({ categoryId: accommodationCategories.id,
      assigned: sql<number>`count(distinct ${bookingOccupants.id}) filter (where ${bookingOccupants.bedspaceId} is not null or ${bookingOccupants.roomId} is not null or ${bookingOccupants.unitId} is not null)`.mapWith(Number),
      checkedIn: sql<number>`count(distinct ${bookingOccupants.id}) filter (where ${bookings.accommodationStatus} = 'CHECKED_IN')`.mapWith(Number),
      unassigned: sql<number>`count(distinct ${bookingOccupants.id}) filter (where ${bookingOccupants.bedspaceId} is null and ${bookingOccupants.roomId} is null and ${bookingOccupants.unitId} is null and ${bookings.accommodationStatus} not in ('CANCELLED', 'CHECKED_OUT'))`.mapWith(Number),
    }).from(bookingOccupants).innerJoin(bookings, eq(bookings.id, bookingOccupants.bookingId)).innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId)).innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId)).innerJoin(events, eq(events.id, bookings.eventId))
      .where(and(eq(bookings.paymentStatus, "PAID"), ne(bookings.accommodationStatus, "CANCELLED"), ne(bookings.accommodationStatus, "CHECKED_OUT"), scope)).groupBy(accommodationCategories.id),
    db.select({ categoryId: accommodationCategories.id, reserved: sql<number>`count(distinct ${privateUnitAllocations.unitId})`.mapWith(Number) })
      .from(privateUnitAllocations).innerJoin(bookings, eq(bookings.id, privateUnitAllocations.bookingId)).innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId)).innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId)).innerJoin(events, eq(events.id, bookings.eventId))
      .where(and(isNull(privateUnitAllocations.releasedAt), eq(bookings.paymentStatus, "PAID"), ne(bookings.accommodationStatus, "CANCELLED"), ne(bookings.accommodationStatus, "CHECKED_OUT"), scope)).groupBy(accommodationCategories.id),
  ]);

  const occupantsByCategory = new Map(occupantRows.map((row) => [row.categoryId, row]));
  const privateByCategory = new Map(privateRows.map((row) => [row.categoryId, Number(row.reserved)]));
  const rows = inventoryRows.map((row) => {
    const occupancy = occupantsByCategory.get(row.categoryId);
    const capacity = Number(row.capacity ?? 0);
    const reserved = row.mode === "PRIVATE" ? (privateByCategory.get(row.categoryId) ?? 0) : Number(occupancy?.assigned ?? 0);
    return { ...row, capacity, reserved, checkedIn: Number(occupancy?.checkedIn ?? 0), unassigned: Number(occupancy?.unassigned ?? 0), occupancyPercent: capacity ? Math.min(100, Math.round(reserved / capacity * 100)) : 0, spaceLabel: row.mode === "PRIVATE" ? "units" : "bedspaces" };
  });
  return {
    events: eventRows,
    lodges: lodgeRows,
    rows,
    summary: rows.reduce((totals, row) => ({ capacity: totals.capacity + row.capacity, reserved: totals.reserved + row.reserved, checkedIn: totals.checkedIn + row.checkedIn, unassigned: totals.unassigned + row.unassigned }), { capacity: 0, reserved: 0, checkedIn: 0, unassigned: 0 }),
  };
}
