import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accommodationCategories, bookingOccupants, bookings, inventoryHolds, lodges, privateUnitAllocations } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { authorize, type Actor } from "@/lib/authz/authorize";

export async function listBookings(actor: Actor) {
  authorize(actor, "booking.read");
  return getDb()
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
    .innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId))
    .orderBy(desc(bookings.createdAt));
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
