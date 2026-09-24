import { and, count, desc, eq, gte, isNull, lte, ne, sql, sum } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accommodationCategories, bookingOccupants, bookingOrders, bookings, inventoryHolds, keyCustody, lodges, paymentTransactions, privateUnitAllocations } from "@/db/schema";
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
  const [checkoutResult, keyRecords] = await Promise.all([booking.checkoutOrderId ? Promise.all([
    db.select().from(bookingOrders).where(eq(bookingOrders.id, booking.checkoutOrderId)).limit(1).then((rows) => rows[0] ?? null),
    db.select({ id: bookings.id, reference: bookings.reference, amountMinor: bookings.amountMinor, paymentStatus: bookings.paymentStatus, accommodationStatus: bookings.accommodationStatus, categoryName: accommodationCategories.name, lodgeName: lodges.name })
      .from(bookings).innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId)).innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId))
      .where(eq(bookings.checkoutOrderId, booking.checkoutOrderId)),
  ] as const) : Promise.resolve([null, [] as Array<{ id: string; reference: string; amountMinor: number; paymentStatus: typeof booking.paymentStatus; accommodationStatus: typeof booking.accommodationStatus; categoryName: string; lodgeName: string }>] as const),
    db.select().from(keyCustody).where(eq(keyCustody.bookingId, bookingId)).orderBy(desc(keyCustody.issuedAt)),
  ]);
  const [checkoutOrder, checkoutItems] = checkoutResult;
  return { booking, occupants, category, checkoutOrder, checkoutItems, keyRecords };
}

export async function checkInBooking(actor: Actor, bookingId: string, overrideReason = "") {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ booking: bookings, lodgeId: accommodationCategories.lodgeId }).from(bookings)
      .innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId))
      .where(eq(bookings.id, bookingId)).for("update").limit(1);
    if (!row) throw new Error("That booking could not be found.");
    const { booking, lodgeId } = row;
    const eligible = booking.paymentStatus === "PAID" && booking.allocationStatus === "FULLY_ALLOCATED";
    authorize(actor, eligible ? "checkin.perform" : "checkin.override", { lodgeId });
    if (booking.accommodationStatus === "CHECKED_IN") return;
    if (booking.accommodationStatus === "CHECKED_OUT" || booking.accommodationStatus === "CANCELLED") throw new Error("This booking can no longer be checked in.");
    if (!eligible && overrideReason.trim().length < 5) throw new Error("Enter a reason of at least 5 characters to override payment or allocation checks.");
    const [after] = await tx.update(bookings).set({ accommodationStatus: "CHECKED_IN", updatedAt: new Date() }).where(eq(bookings.id, bookingId)).returning();
    await recordAudit(tx, { actor, action: eligible ? "booking.checked_in" : "booking.checkin_overridden", entityType: "booking", entityId: bookingId, before: booking, after, reason: eligible ? undefined : overrideReason.trim() });
  });
}

export async function checkOutBooking(actor: Actor, bookingId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ booking: bookings, lodgeId: accommodationCategories.lodgeId }).from(bookings)
      .innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId))
      .where(eq(bookings.id, bookingId)).for("update").limit(1);
    if (!row) throw new Error("That booking could not be found.");
    authorize(actor, "checkout.perform", { lodgeId: row.lodgeId });
    if (row.booking.accommodationStatus === "CHECKED_OUT") return;
    if (row.booking.accommodationStatus !== "CHECKED_IN") throw new Error("Check this booking in before checking it out.");
    const activeKeys = await tx.select({ id: keyCustody.id }).from(keyCustody).where(and(eq(keyCustody.bookingId, bookingId), eq(keyCustody.status, "ISSUED"))).limit(1);
    if (activeKeys.length) throw new Error("Return or report all issued keys before checking this booking out.");
    const [after] = await tx.update(bookings).set({ accommodationStatus: "CHECKED_OUT", updatedAt: new Date() }).where(eq(bookings.id, bookingId)).returning();
    await recordAudit(tx, { actor, action: "booking.checked_out", entityType: "booking", entityId: bookingId, before: row.booking, after });
  });
}

export async function issueOccupantKey(actor: Actor, bookingId: string, occupantId: string, keyLabel: string) {
  const label = keyLabel.trim();
  if (!label || label.length > 64) throw new Error("Enter a key label no longer than 64 characters.");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ booking: bookings, lodgeId: accommodationCategories.lodgeId }).from(bookings)
      .innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId))
      .where(eq(bookings.id, bookingId)).for("update").limit(1);
    if (!row) throw new Error("That booking could not be found.");
    authorize(actor, "keys.issue", { lodgeId: row.lodgeId });
    if (row.booking.accommodationStatus !== "CHECKED_IN") throw new Error("Check the occupant in before issuing a key.");
    const [occupant] = await tx.select().from(bookingOccupants).where(and(eq(bookingOccupants.id, occupantId), eq(bookingOccupants.bookingId, bookingId))).limit(1);
    if (!occupant) throw new Error("That occupant is not part of this booking.");
    if (!occupant.bedspaceId && !occupant.roomId && !occupant.unitId) throw new Error("Allocate this occupant to accommodation before issuing a key.");
    const activeForOccupant = await tx.select({ id: keyCustody.id }).from(keyCustody).where(and(eq(keyCustody.occupantId, occupantId), eq(keyCustody.status, "ISSUED"))).limit(1);
    if (activeForOccupant.length) throw new Error("This occupant already has a key issued.");
    const activeForLabel = await tx.select({ id: keyCustody.id }).from(keyCustody).where(and(eq(keyCustody.lodgeId, row.lodgeId), sql`lower(${keyCustody.keyLabel}) = lower(${label})`, eq(keyCustody.status, "ISSUED"))).limit(1);
    if (activeForLabel.length) throw new Error("That key label is already issued. Check the key register and try a different label.");
    const [record] = await tx.insert(keyCustody).values({ bookingId, lodgeId: row.lodgeId, occupantId, keyLabel: label, issuedBy: actor.userId }).returning();
    await recordAudit(tx, { actor, action: "key.issued", entityType: "key_custody", entityId: record!.id, after: record });
  });
}

export async function updateKeyCustody(actor: Actor, recordId: string, action: "return" | "missing", note = "") {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ record: keyCustody, lodgeId: accommodationCategories.lodgeId }).from(keyCustody)
      .innerJoin(bookings, eq(bookings.id, keyCustody.bookingId))
      .innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId))
      .where(eq(keyCustody.id, recordId)).for("update").limit(1);
    if (!row) throw new Error("That key record could not be found.");
    authorize(actor, action === "return" ? "keys.return" : "keys.manage", { lodgeId: row.lodgeId });
    if (row.record.status !== "ISSUED") throw new Error("This key is no longer marked as issued.");
    if (action === "missing" && note.trim().length < 5) throw new Error("Enter a reason of at least 5 characters for a missing key.");
    const now = new Date();
    const [after] = await tx.update(keyCustody).set(action === "return"
      ? { status: "RETURNED", returnedAt: now, returnedBy: actor.userId, note: note.trim() }
      : { status: "MISSING", missingAt: now, missingBy: actor.userId, note: note.trim() })
      .where(eq(keyCustody.id, recordId)).returning();
    await recordAudit(tx, { actor, action: action === "return" ? "key.returned" : "key.reported_missing", entityType: "key_custody", entityId: recordId, before: row.record, after, reason: note.trim() || undefined });
  });
}

export async function cancelBooking(actor: Actor, bookingId: string, reason?: string) {
  authorize(actor, "booking.cancel");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).for("update").limit(1);
    if (!before) throw new Error("That booking could not be found.");
    if (before.accommodationStatus === "CHECKED_IN" || before.accommodationStatus === "CHECKED_OUT") throw new Error("A booking with completed guest operations cannot be cancelled from here.");

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
