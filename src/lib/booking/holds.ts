import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { getDb } from "@/db/client";
import { accommodationUnits, bedspaces, bookingOccupants, bookings, inventoryHolds, rooms } from "@/db/schema";

export class InventoryUnavailableError extends Error {
  constructor(message = "This bedspace was just booked by another participant. Please choose another available space.") {
    super(message);
    this.name = "InventoryUnavailableError";
  }
}

/**
 * Deletes any hold rows past their expiry. Call this before checking
 * availability, inside the same transaction that will insert a new hold.
 *
 * Critical: a hold that already belongs to a booking (bookingId set) is not
 * just a temporary claim anymore — createBooking already wrote the occupant's
 * bedspaceId/unitId directly onto booking_occupants when the hold was made.
 * Deleting an expired hold on its own, without unwinding that assignment,
 * would leave the bedspace permanently stuck as "taken" by an abandoned,
 * never-paid booking with no way back to AVAILABLE. So for every expiring
 * hold still tied to a PENDING booking, this cancels that booking and clears
 * its occupants' inventory assignment in the same transaction before the
 * hold row is removed. The booking row itself is never deleted (never lose
 * booking history) — only marked CANCELLED.
 */
export async function sweepExpiredHolds(tx: DbOrTx): Promise<void> {
  const expired = await tx.select().from(inventoryHolds).where(lt(inventoryHolds.expiresAt, new Date()));
  if (expired.length === 0) return;

  const bookingIds = [...new Set(expired.map((h) => h.bookingId).filter((id): id is string => id !== null))];
  if (bookingIds.length > 0) {
    const pending = await tx
      .select()
      .from(bookings)
      .where(and(inArray(bookings.id, bookingIds), eq(bookings.paymentStatus, "PENDING")));
    for (const booking of pending) {
      await tx
        .update(bookings)
        .set({ paymentStatus: "CANCELLED", accommodationStatus: "CANCELLED", updatedAt: new Date() })
        .where(eq(bookings.id, booking.id));
      await tx
        .update(bookingOccupants)
        .set({ bedspaceId: null, roomId: null, unitId: null })
        .where(eq(bookingOccupants.bookingId, booking.id));
    }
  }

  await tx.delete(inventoryHolds).where(lt(inventoryHolds.expiresAt, new Date()));
}

/**
 * Locks the target bedspace row, sweeps expired holds, and confirms the
 * bedspace is genuinely free (AVAILABLE status, no active hold, no existing
 * occupant) before inserting a new hold. The unique index on
 * inventory_holds(bedspace_id) is the hard backstop if two requests somehow
 * race past this check anyway — one insert will simply fail.
 */
export async function holdBedspace(tx: DbOrTx, bedspaceId: string, holdMinutes: number): Promise<string> {
  const [locked] = await tx
    .select()
    .from(bedspaces)
    .where(eq(bedspaces.id, bedspaceId))
    .for("update");
  if (!locked) throw new Error("That bedspace could not be found.");
  if (locked.status !== "AVAILABLE") {
    throw new InventoryUnavailableError(`This bedspace is currently ${locked.status.toLowerCase()}, not available.`);
  }

  await sweepExpiredHolds(tx);
  const [existingHold] = await tx.select().from(inventoryHolds).where(eq(inventoryHolds.bedspaceId, bedspaceId));
  if (existingHold) throw new InventoryUnavailableError();

  try {
    const [hold] = await tx
      .insert(inventoryHolds)
      .values({ bedspaceId, expiresAt: new Date(Date.now() + holdMinutes * 60_000) })
      .returning();
    return hold!.id;
  } catch {
    // The unique index rejected a genuine race the check above missed.
    throw new InventoryUnavailableError();
  }
}

/** Same pattern as holdBedspace, for a whole private room with no bedspace breakdown. */
export async function holdRoom(tx: DbOrTx, roomId: string, holdMinutes: number): Promise<string> {
  const [locked] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).for("update");
  if (!locked) throw new Error("That room could not be found.");
  if (locked.status !== "ACTIVE") throw new InventoryUnavailableError("This room is not currently available.");

  await sweepExpiredHolds(tx);
  const [existingHold] = await tx.select().from(inventoryHolds).where(eq(inventoryHolds.roomId, roomId));
  if (existingHold) throw new InventoryUnavailableError();

  try {
    const [hold] = await tx
      .insert(inventoryHolds)
      .values({ roomId, expiresAt: new Date(Date.now() + holdMinutes * 60_000) })
      .returning();
    return hold!.id;
  } catch {
    throw new InventoryUnavailableError();
  }
}

/**
 * Finds up to `count` currently free bedspaces among the given room ids,
 * for categories where the customer does not pick a specific bedspace.
 * Locks each candidate with SKIP LOCKED so two concurrent auto-allocations
 * never grab the same one. This is a simple first pass: it does not yet try
 * to keep a group together in a single room when several rooms have room
 * to spare — it fills rooms in order instead. Good enough to guarantee
 * correctness (no overselling); grouping quality can improve later without
 * changing the safety guarantee.
 */
export async function autoHoldBedspaces(
  tx: DbOrTx,
  roomIds: string[],
  count: number,
  holdMinutes: number,
): Promise<string[]> {
  if (roomIds.length === 0) return [];
  await sweepExpiredHolds(tx);

  const heldIds = new Set(
    (await tx.select({ id: inventoryHolds.bedspaceId }).from(inventoryHolds).where(isNull(inventoryHolds.bookingId)))
      .map((r) => r.id)
      .filter((id): id is string => id !== null),
  );

  const candidates = await tx
    .select()
    .from(bedspaces)
    .where(and(eq(bedspaces.status, "AVAILABLE"), or(...roomIds.map((id) => eq(bedspaces.roomId, id)))))
    .orderBy(bedspaces.roomId, bedspaces.letter)
    .for("update", { skipLocked: true });

  const free = candidates.filter((b) => !heldIds.has(b.id));
  if (free.length < count) {
    throw new InventoryUnavailableError("Not enough space left in this category for the number of people requested.");
  }

  const chosen = free.slice(0, count);
  const holdIds: string[] = [];
  for (const bedspace of chosen) {
    try {
      const [hold] = await tx
        .insert(inventoryHolds)
        .values({ bedspaceId: bedspace.id, expiresAt: new Date(Date.now() + holdMinutes * 60_000) })
        .returning();
      holdIds.push(hold!.id);
    } catch {
      throw new InventoryUnavailableError();
    }
  }
  return holdIds;
}

/** Same pattern again, for a whole private unit (e.g. a chalet with no room breakdown). */
export async function holdUnit(tx: DbOrTx, unitId: string, holdMinutes: number): Promise<string> {
  const [locked] = await tx.select().from(accommodationUnits).where(eq(accommodationUnits.id, unitId)).for("update");
  if (!locked) throw new Error("That unit could not be found.");
  if (locked.status !== "ACTIVE") throw new InventoryUnavailableError("This unit is not currently available.");

  await sweepExpiredHolds(tx);
  const [existingHold] = await tx.select().from(inventoryHolds).where(eq(inventoryHolds.unitId, unitId));
  if (existingHold) throw new InventoryUnavailableError();

  try {
    const [hold] = await tx
      .insert(inventoryHolds)
      .values({ unitId, expiresAt: new Date(Date.now() + holdMinutes * 60_000) })
      .returning();
    return hold!.id;
  } catch {
    throw new InventoryUnavailableError();
  }
}

/** Auto-picks one available unit under the given category (private, system-allocates). */
export async function autoHoldUnit(tx: DbOrTx, unitIds: string[], holdMinutes: number): Promise<{ unitId: string; holdId: string }> {
  if (unitIds.length === 0) throw new InventoryUnavailableError("No units are configured for this category yet.");
  await sweepExpiredHolds(tx);

  const heldUnitIds = new Set(
    (await tx.select({ id: inventoryHolds.unitId }).from(inventoryHolds))
      .map((r) => r.id)
      .filter((id): id is string => id !== null),
  );

  const candidates = await tx
    .select()
    .from(accommodationUnits)
    .where(and(eq(accommodationUnits.status, "ACTIVE"), or(...unitIds.map((id) => eq(accommodationUnits.id, id)))))
    .orderBy(accommodationUnits.name)
    .for("update", { skipLocked: true });

  const free = candidates.find((u) => !heldUnitIds.has(u.id));
  if (!free) throw new InventoryUnavailableError("No units are currently available in this category.");

  const holdId = await holdUnit(tx, free.id, holdMinutes);
  return { unitId: free.id, holdId };
}

/**
 * "Book Entire Room" (brief section 11): only available when every bedspace
 * in the room is simultaneously AVAILABLE with no active hold. Holds every
 * bedspace in the room as one atomic operation.
 */
export async function holdEntireRoom(tx: DbOrTx, roomId: string, holdMinutes: number): Promise<string[]> {
  const all = await tx.select().from(bedspaces).where(eq(bedspaces.roomId, roomId)).for("update");
  if (all.length === 0) throw new InventoryUnavailableError("This room has no bedspaces configured.");
  if (all.some((b) => b.status !== "AVAILABLE")) {
    throw new InventoryUnavailableError("This room is not fully available for an entire-room booking.");
  }

  await sweepExpiredHolds(tx);
  const activeHolds = await tx
    .select()
    .from(inventoryHolds)
    .where(or(...all.map((b) => eq(inventoryHolds.bedspaceId, b.id))));
  if (activeHolds.length > 0) {
    throw new InventoryUnavailableError("Part of this room was just reserved by someone else. Please try again.");
  }

  const holdIds: string[] = [];
  try {
    for (const bedspace of all) {
      const [hold] = await tx
        .insert(inventoryHolds)
        .values({ bedspaceId: bedspace.id, expiresAt: new Date(Date.now() + holdMinutes * 60_000) })
        .returning();
      holdIds.push(hold!.id);
    }
  } catch {
    throw new InventoryUnavailableError();
  }
  return holdIds;
}

export async function releaseHold(holdId: string): Promise<void> {
  await getDb().delete(inventoryHolds).where(eq(inventoryHolds.id, holdId));
}
