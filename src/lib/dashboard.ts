import { and, gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  accommodationCategories,
  accommodationUnits,
  bedspaces,
  bookingOccupants,
  bookings,
  inventoryHolds,
  lodges,
} from "@/db/schema";

/**
 * Real counts for the admin dashboard, computed from what actually exists so
 * far (Phases 1-3). Held/occupied are DERIVED, not stored, matching the
 * design in inventory.ts: a bedspace's `status` column only tracks its
 * administrative state (AVAILABLE/BLOCKED/MAINTENANCE/RETIRED); whether it's
 * currently held or booked comes from inventory_holds and booking_occupants.
 */
export async function getDashboardStats(filters: { from?: string; to?: string } = {}) {
  const db = getDb();
  const bookingWhere = [];
  if (filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from)) bookingWhere.push(gte(bookings.createdAt, new Date(`${filters.from}T00:00:00.000Z`)));
  if (filters.to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to)) { const end = new Date(`${filters.to}T00:00:00.000Z`); end.setUTCDate(end.getUTCDate() + 1); bookingWhere.push(lt(bookings.createdAt, end)); }
  const bookingCondition = bookingWhere.length ? and(...bookingWhere) : undefined;

  const [lodgeRows, categoryRows, unitRows, bedspaceRows, heldRows, assignedRows, bookingRows, dailyRows, privateRows, recentRows] = await Promise.all([
  db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      active: sql<number>`count(*) filter (where ${lodges.status} = 'ACTIVE')`.mapWith(Number),
    })
    .from(lodges),

  db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      shared: sql<number>`count(*) filter (where ${accommodationCategories.mode} = 'SHARED')`.mapWith(Number),
      private: sql<number>`count(*) filter (where ${accommodationCategories.mode} = 'PRIVATE')`.mapWith(Number),
    })
    .from(accommodationCategories),

  db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(accommodationUnits),

  db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      available: sql<number>`count(*) filter (where ${bedspaces.status} = 'AVAILABLE')`.mapWith(Number),
      blocked: sql<number>`count(*) filter (where ${bedspaces.status} = 'BLOCKED')`.mapWith(Number),
      maintenance: sql<number>`count(*) filter (where ${bedspaces.status} = 'MAINTENANCE')`.mapWith(Number),
      retired: sql<number>`count(*) filter (where ${bedspaces.status} = 'RETIRED')`.mapWith(Number),
    })
    .from(bedspaces),

  db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(inventoryHolds)
    .where(sql`${inventoryHolds.expiresAt} > now() and ${inventoryHolds.bookingId} is null`),

  db
    .select({ count: sql<number>`count(distinct ${bookingOccupants.bedspaceId})`.mapWith(Number) })
    .from(bookingOccupants)
    .where(sql`${bookingOccupants.bedspaceId} is not null`),

  db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      pending: sql<number>`count(*) filter (where ${bookings.paymentStatus} = 'PENDING')`.mapWith(Number),
      paid: sql<number>`count(*) filter (where ${bookings.paymentStatus} = 'PAID')`.mapWith(Number),
      failed: sql<number>`count(*) filter (where ${bookings.paymentStatus} = 'FAILED')`.mapWith(Number),
      unallocated: sql<number>`count(*) filter (where ${bookings.accommodationStatus} = 'UNALLOCATED')`.mapWith(Number),
      paidAmountMinor: sql<number>`coalesce(sum(${bookings.amountMinor}) filter (where ${bookings.paymentStatus} = 'PAID'), 0)`.mapWith(Number),
    })
    .from(bookings)
    .where(bookingCondition),

  db.select({ date: sql<string>`to_char(date_trunc('day', ${bookings.createdAt}), 'YYYY-MM-DD')`, amount: sql<number>`coalesce(sum(${bookings.amountMinor}) filter (where ${bookings.paymentStatus} = 'PAID'), 0)`.mapWith(Number), count: sql<number>`count(*)`.mapWith(Number) }).from(bookings).where(bookingCondition).groupBy(sql`date_trunc('day', ${bookings.createdAt})`).orderBy(sql`date_trunc('day', ${bookings.createdAt}) desc`).limit(30),

  db
    .select({ count: sql<number>`count(distinct ${bookingOccupants.unitId})`.mapWith(Number) })
    .from(bookingOccupants)
    .where(sql`${bookingOccupants.unitId} is not null`),

  db.select({ id: bookings.id, reference: bookings.reference, guestName: bookings.bookerName, lodgeName: lodges.name, categoryName: accommodationCategories.name, paymentStatus: bookings.paymentStatus, accommodationStatus: bookings.accommodationStatus, amountMinor: bookings.amountMinor, checkInDate: accommodationCategories.checkInDate, createdAt: bookings.createdAt })
    .from(bookings).innerJoin(accommodationCategories, sql`${accommodationCategories.id} = ${bookings.categoryId}`).innerJoin(lodges, sql`${lodges.id} = ${accommodationCategories.lodgeId}`)
    .where(bookingCondition).orderBy(sql`${bookings.createdAt} desc`).limit(8),
  ]);

  const lodgeCounts = lodgeRows[0];
  const categoryCounts = categoryRows[0];
  const unitCounts = unitRows[0];
  const bedspaceCounts = bedspaceRows[0];
  const heldCount = heldRows[0];
  const assignedCount = assignedRows[0];
  const bookingCounts = bookingRows[0];
  const privateUnitBookings = privateRows[0];

  const availableNow = Math.max(
    0,
    bedspaceCounts!.available - Math.min(heldCount!.count, bedspaceCounts!.available) - assignedCount!.count,
  );

  return {
    lodges: lodgeCounts!,
    categories: categoryCounts!,
    units: unitCounts!,
    bedspaces: { ...bedspaceCounts!, held: heldCount!.count, assigned: assignedCount!.count, availableNow },
    bookings: bookingCounts!,
    daily: dailyRows.reverse(),
    recentBookings: recentRows,
    privateUnitBookings: privateUnitBookings!.count,
  };
}

export type DashboardStats = Awaited<ReturnType<typeof getDashboardStats>>;
