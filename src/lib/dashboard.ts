import { sql } from "drizzle-orm";
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
export async function getDashboardStats() {
  const db = getDb();

  const [lodgeCounts] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      active: sql<number>`count(*) filter (where ${lodges.status} = 'ACTIVE')`.mapWith(Number),
    })
    .from(lodges);

  const [categoryCounts] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      shared: sql<number>`count(*) filter (where ${accommodationCategories.mode} = 'SHARED')`.mapWith(Number),
      private: sql<number>`count(*) filter (where ${accommodationCategories.mode} = 'PRIVATE')`.mapWith(Number),
    })
    .from(accommodationCategories);

  const [unitCounts] = await db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(accommodationUnits);

  const [bedspaceCounts] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      available: sql<number>`count(*) filter (where ${bedspaces.status} = 'AVAILABLE')`.mapWith(Number),
      blocked: sql<number>`count(*) filter (where ${bedspaces.status} = 'BLOCKED')`.mapWith(Number),
      maintenance: sql<number>`count(*) filter (where ${bedspaces.status} = 'MAINTENANCE')`.mapWith(Number),
      retired: sql<number>`count(*) filter (where ${bedspaces.status} = 'RETIRED')`.mapWith(Number),
    })
    .from(bedspaces);

  const [heldCount] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(inventoryHolds)
    .where(sql`${inventoryHolds.expiresAt} > now() and ${inventoryHolds.bookingId} is null`);

  const [assignedCount] = await db
    .select({ count: sql<number>`count(distinct ${bookingOccupants.bedspaceId})`.mapWith(Number) })
    .from(bookingOccupants)
    .where(sql`${bookingOccupants.bedspaceId} is not null`);

  const [bookingCounts] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      pending: sql<number>`count(*) filter (where ${bookings.paymentStatus} = 'PENDING')`.mapWith(Number),
      paid: sql<number>`count(*) filter (where ${bookings.paymentStatus} = 'PAID')`.mapWith(Number),
      failed: sql<number>`count(*) filter (where ${bookings.paymentStatus} = 'FAILED')`.mapWith(Number),
      unallocated: sql<number>`count(*) filter (where ${bookings.accommodationStatus} = 'UNALLOCATED')`.mapWith(Number),
    })
    .from(bookings);

  const [privateUnitBookings] = await db
    .select({ count: sql<number>`count(distinct ${bookingOccupants.unitId})`.mapWith(Number) })
    .from(bookingOccupants)
    .where(sql`${bookingOccupants.unitId} is not null`);

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
    privateUnitBookings: privateUnitBookings!.count,
  };
}

export type DashboardStats = Awaited<ReturnType<typeof getDashboardStats>>;
