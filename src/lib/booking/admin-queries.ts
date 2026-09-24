import { and, count, desc, eq, gte, isNull, lte, ne, sql, sum } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accommodationCategories, bookingOccupants, bookings, inventoryHolds, lodges, paymentTransactions, privateUnitAllocations } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { authorize, type Actor } from "@/lib/authz/authorize";

export interface BookingListFilters { status?: string; lodgeId?: string; from?: string; to?: string; page?: string }

export async function getBookingsDashboard(actor: Actor, filters: BookingListFilters = {}) {
  authorize(actor, "booking.read");
  const db = getDb();
  const where = [];
  if (["PENDING", "PAID", "FAILED", "REFUNDED", "CANCELLED"].includes(filters.status ?? "")) where.push(eq(bookings.paymentStatus, filters.status as never));
  if (filters.lodgeId) where.push(eq(lodges.id, filters.lodgeId));
  if (filters.from && !Number.isNaN(Date.parse(filters.from))) where.push(gte(bookings.createdAt, new Date(`${filters.from}T00:00:00`)));
  if (filters.to && !Number.isNaN(Date.parse(filters.to))) where.push(lte(bookings.createdAt, new Date(`${filters.to}T23:59:59.999`)));
  const condition = where.length ? and(...where) : undefined;
  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1);
  const limit = 100;
  const base = db
    .select({
      id: bookings.id,
      reference: bookings.reference,
      bookerName: bookings.bookerName,
      paymentStatus: bookings.paymentStatus,
      accommodationStatus: bookings.accommodationStatus,
      amountMinor: bookings.amountMinor,
      currency: bookings.currency,
      createdAt: bookings.createdAt,
      categoryName: accommodationCategories.name,
      lodgeName: lodges.name,
    })
    .from(bookings)
    .innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId))
    .innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId));
  const [rows, totals, transactions] = await Promise.all([
    base.where(condition).orderBy(desc(bookings.createdAt)).limit(limit).offset((page - 1) * limit),
    db.select({ count: count(), amountMinor: sum(sql`case when ${bookings.paymentStatus} = 'PAID' then ${bookings.amountMinor} else 0 end`).mapWith(Number), paid: sql<number>`count(*) filter (where ${bookings.paymentStatus} = 'PAID')`.mapWith(Number), pending: sql<number>`count(*) filter (where ${bookings.paymentStatus} = 'PENDING')`.mapWith(Number) }).from(bookings).innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId)).innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId)).where(condition),
    db.select({ count: count() }).from(paymentTransactions).innerJoin(bookings, eq(bookings.id, paymentTransactions.bookingId)).innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId)).innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId)).where(condition),
  ]);
  return { rows, totals: totals[0] ?? { count: 0, amountMinor: 0, paid: 0, pending: 0 }, transactionCount: transactions[0]?.count ?? 0, page, limit };
}

export async function getBookingDetail(actor: Actor, bookingId: string) {
  authorize(actor, "booking.read");
  const db = getDb();
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) return null;
  const occupants = await db.select().from(bookingOccupants).where(eq(bookingOccupants.bookingId, bookingId));
  const [category] = await db
    .select()
    .from(accommodationCategories)
    .where(eq(accommodationCategories.id, booking.categoryId))
    .limit(1);
  return { booking, occupants, category };
}

export async function cancelBooking(actor: Actor, bookingId: string, reason?: string) {
  authorize(actor, "booking.cancel");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).for("update").limit(1);
    if (!before) throw new Error("That booking could not be found.");

    const nextPaymentStatus = before.paymentStatus === "PAID" || before.paymentStatus === "REFUNDED"
      ? before.paymentStatus
      : "CANCELLED";
    const [after] = await tx
      .update(bookings)
      .set({ paymentStatus: nextPaymentStatus, accommodationStatus: "CANCELLED", allocationStatus: "NOT_ALLOCATED", updatedAt: new Date() })
      .where(and(eq(bookings.id, bookingId), ne(bookings.accommodationStatus, "CANCELLED")))
      .returning();
    if (!after) return; // already cancelled; preserve idempotency
    const released = await tx
      .update(privateUnitAllocations)
      .set({ releasedAt: new Date(), releaseReason: "booking cancelled" })
      .where(and(eq(privateUnitAllocations.bookingId, bookingId), isNull(privateUnitAllocations.releasedAt)))
      .returning({ unitId: privateUnitAllocations.unitId });
    if (released.length) {
      await recordAudit(tx, {
        actor,
        action: "inventory.private_unit_released",
        entityType: "booking",
        entityId: bookingId,
        before: { unitIds: released.map((row) => row.unitId) },
        after: { released: true },
        reason: reason ?? "booking cancelled",
      });
    }
    await tx
      .update(bookingOccupants)
      .set({ bedspaceId: null, roomId: null, unitId: null })
      .where(eq(bookingOccupants.bookingId, bookingId));
    await tx.delete(inventoryHolds).where(eq(inventoryHolds.bookingId, bookingId));

    await recordAudit(tx, {
      actor,
      action: "booking.cancelled",
      entityType: "booking",
      entityId: bookingId,
      before,
      after,
      reason: reason ?? (before.paymentStatus === "PAID" ? "paid booking accommodation cancelled; refund remains separate" : undefined),
    });
  });
}
