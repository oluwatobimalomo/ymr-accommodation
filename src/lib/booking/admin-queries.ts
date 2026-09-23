import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accommodationCategories, bookingOccupants, bookings, lodges } from "@/db/schema";
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
    const [before] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!before) throw new Error("That booking could not be found.");

    const [after] = await tx
      .update(bookings)
      .set({ paymentStatus: "CANCELLED", accommodationStatus: "CANCELLED", updatedAt: new Date() })
      .where(eq(bookings.id, bookingId))
      .returning();
    await tx
      .update(bookingOccupants)
      .set({ bedspaceId: null, roomId: null, unitId: null })
      .where(eq(bookingOccupants.bookingId, bookingId));

    await recordAudit(tx, {
      actor,
      action: "booking.cancelled",
      entityType: "booking",
      entityId: bookingId,
      before,
      after,
      reason,
    });
  });
}
