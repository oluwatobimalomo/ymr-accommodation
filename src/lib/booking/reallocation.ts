import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db/client";
import { accommodationCategories, accommodationUnits, bedspaces, bookingOccupants, bookings, inventoryHolds, keyCustody, lodges, reallocationHistory, rooms } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { authorize, type Actor } from "@/lib/authz/authorize";

export interface ReallocationChoice {
  bedspaceId: string;
  label: string;
}

export async function listReallocationHistory(actor: Actor, bookingId: string) {
  const db = getDb();
  const [scope] = await db.select({ lodgeId: accommodationCategories.lodgeId }).from(bookings)
    .innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId))
    .where(eq(bookings.id, bookingId)).limit(1);
  if (!scope) return [];
  authorize(actor, "booking.read", { lodgeId: scope.lodgeId });
  const fromBedspace = alias(bedspaces, "from_bedspace");
  const toBedspace = alias(bedspaces, "to_bedspace");
  const fromRoom = alias(rooms, "from_room");
  const toRoom = alias(rooms, "to_room");
  return db.select({ id: reallocationHistory.id, occupantName: bookingOccupants.name, reason: reallocationHistory.reason, movedAt: reallocationHistory.movedAt,
    fromLabel: fromRoom.name, fromLetter: fromBedspace.letter, toLabel: toRoom.name, toLetter: toBedspace.letter })
    .from(reallocationHistory)
    .innerJoin(bookingOccupants, eq(bookingOccupants.id, reallocationHistory.occupantId))
    .innerJoin(fromBedspace, eq(fromBedspace.id, reallocationHistory.fromBedspaceId))
    .innerJoin(fromRoom, eq(fromRoom.id, fromBedspace.roomId))
    .innerJoin(toBedspace, eq(toBedspace.id, reallocationHistory.toBedspaceId))
    .innerJoin(toRoom, eq(toRoom.id, toBedspace.roomId))
    .where(eq(reallocationHistory.bookingId, bookingId))
    .orderBy(desc(reallocationHistory.movedAt));
}

/** Only offer empty, active beds in the same shared category to preserve the paid booking terms. */
export async function getOccupantReallocationChoices(actor: Actor, bookingId: string, occupantId: string): Promise<ReallocationChoice[]> {
  const db = getDb();
  const [row] = await db.select({ booking: bookings, occupant: bookingOccupants, lodgeId: accommodationCategories.lodgeId, mode: accommodationCategories.mode })
    .from(bookings)
    .innerJoin(bookingOccupants, and(eq(bookingOccupants.bookingId, bookings.id), eq(bookingOccupants.id, occupantId)))
    .innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId))
    .where(eq(bookings.id, bookingId)).limit(1);
  if (!row) return [];
  authorize(actor, "booking.reallocate", { lodgeId: row.lodgeId });
  if (row.mode !== "SHARED" || !row.occupant.bedspaceId || row.booking.paymentStatus !== "PAID" || ["CANCELLED", "CHECKED_OUT"].includes(row.booking.accommodationStatus)) return [];

  const candidates = await db.select({ bedspaceId: bedspaces.id, letter: bedspaces.letter, roomName: rooms.name, roomGender: rooms.genderRestriction, categoryGender: accommodationCategories.genderRestriction })
    .from(bedspaces)
    .innerJoin(rooms, eq(rooms.id, bedspaces.roomId))
    .innerJoin(accommodationUnits, eq(accommodationUnits.id, rooms.unitId))
    .innerJoin(accommodationCategories, eq(accommodationCategories.id, accommodationUnits.categoryId))
    .innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId))
    .where(and(
      eq(accommodationCategories.id, row.booking.categoryId),
      eq(accommodationCategories.status, "ACTIVE"),
      eq(accommodationUnits.status, "ACTIVE"),
      eq(rooms.status, "ACTIVE"),
      eq(lodges.status, "ACTIVE"),
      eq(bedspaces.status, "AVAILABLE"),
    ))
    .orderBy(rooms.name, bedspaces.letter);
  const ids = candidates.map((candidate) => candidate.bedspaceId).filter((id) => id !== row.occupant.bedspaceId);
  if (!ids.length) return [];
  const [assignments, holds] = await Promise.all([
    db.select({ id: bookingOccupants.bedspaceId }).from(bookingOccupants).where(and(inArray(bookingOccupants.bedspaceId, ids), ne(bookingOccupants.id, occupantId))),
    db.select({ id: inventoryHolds.bedspaceId }).from(inventoryHolds).where(and(inArray(inventoryHolds.bedspaceId, ids), gt(inventoryHolds.expiresAt, new Date()))),
  ]);
  const unavailable = new Set([...assignments.map((item) => item.id), ...holds.map((item) => item.id)]);
  return candidates
    .filter((candidate) => candidate.bedspaceId !== row.occupant.bedspaceId && !unavailable.has(candidate.bedspaceId))
    .filter((candidate) => [candidate.roomGender, candidate.categoryGender].every((restriction) => restriction === "ANY" || restriction === row.occupant.gender))
    .map(({ bedspaceId, letter, roomName }) => ({ bedspaceId, label: `${roomName} · Bedspace ${letter}` }));
}

/** Atomically move one paid guest; inventory locking and the unique assignment index are both retained as safeguards. */
export async function reallocateOccupant(actor: Actor, bookingId: string, occupantId: string, targetBedspaceId: string, reason: string) {
  const cleanReason = reason.trim();
  if (cleanReason.length < 5 || cleanReason.length > 500) throw new Error("Enter a reallocation reason between 5 and 500 characters.");
  if (!targetBedspaceId) throw new Error("Choose a destination bedspace.");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ booking: bookings, occupant: bookingOccupants, lodgeId: accommodationCategories.lodgeId, mode: accommodationCategories.mode })
      .from(bookings)
      .innerJoin(bookingOccupants, and(eq(bookingOccupants.bookingId, bookings.id), eq(bookingOccupants.id, occupantId)))
      .innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId))
      .where(eq(bookings.id, bookingId)).for("update").limit(1);
    if (!row) throw new Error("That booking occupant could not be found.");
    authorize(actor, "booking.reallocate", { lodgeId: row.lodgeId });
    if (row.mode !== "SHARED") throw new Error("This reallocation flow is for shared bedspaces.");
    if (row.booking.paymentStatus !== "PAID") throw new Error("Only a paid booking can be reallocated.");
    if (["CANCELLED", "CHECKED_OUT"].includes(row.booking.accommodationStatus)) throw new Error("This booking can no longer be reallocated.");
    if (!row.occupant.bedspaceId) throw new Error("This occupant does not have an assigned bedspace.");
    if (targetBedspaceId === row.occupant.bedspaceId) throw new Error("Choose a different bedspace.");

    const activeKey = await tx.select({ id: keyCustody.id }).from(keyCustody)
      .where(and(eq(keyCustody.occupantId, occupantId), eq(keyCustody.status, "ISSUED"))).limit(1);
    if (activeKey.length) throw new Error("Return or report the occupant’s issued key before changing their bedspace.");

    const lockedBeds = await tx.select({ id: bedspaces.id }).from(bedspaces)
      .where(inArray(bedspaces.id, [row.occupant.bedspaceId, targetBedspaceId]))
      .orderBy(bedspaces.id).for("update");
    if (lockedBeds.length !== 2) throw new Error("The current or destination bedspace could not be found.");

    const [target] = await tx.select({ bedspace: bedspaces, room: rooms, unit: accommodationUnits, category: accommodationCategories, lodge: lodges })
      .from(bedspaces)
      .innerJoin(rooms, eq(rooms.id, bedspaces.roomId))
      .innerJoin(accommodationUnits, eq(accommodationUnits.id, rooms.unitId))
      .innerJoin(accommodationCategories, eq(accommodationCategories.id, accommodationUnits.categoryId))
      .innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId))
      .where(eq(bedspaces.id, targetBedspaceId)).limit(1);
    if (!target || target.category.id !== row.booking.categoryId || target.category.status !== "ACTIVE" || target.unit.status !== "ACTIVE" || target.room.status !== "ACTIVE" || target.lodge.status !== "ACTIVE") {
      throw new Error("Choose an active bedspace in this booking’s accommodation category.");
    }
    if (target.bedspace.status !== "AVAILABLE") throw new Error("That bedspace is not available.");
    const gender = row.occupant.gender;
    for (const restriction of [target.category.genderRestriction, target.room.genderRestriction]) {
      if (restriction !== "ANY" && restriction !== gender) throw new Error("The destination bedspace does not match the occupant’s gender restriction.");
    }
    const [assignment] = await tx.select({ id: bookingOccupants.id }).from(bookingOccupants)
      .where(eq(bookingOccupants.bedspaceId, targetBedspaceId)).limit(1);
    if (assignment) throw new Error("That bedspace has already been assigned. Refresh and choose another.");
    const [hold] = await tx.select({ id: inventoryHolds.id }).from(inventoryHolds)
      .where(and(eq(inventoryHolds.bedspaceId, targetBedspaceId), gt(inventoryHolds.expiresAt, new Date()))).limit(1);
    if (hold) throw new Error("That bedspace is temporarily reserved. Choose another.");

    const fromBedspaceId = row.occupant.bedspaceId;
    const [after] = await tx.update(bookingOccupants).set({ bedspaceId: targetBedspaceId, roomId: null, unitId: null })
      .where(and(eq(bookingOccupants.id, occupantId), eq(bookingOccupants.bedspaceId, fromBedspaceId))).returning();
    if (!after) throw new Error("The occupant’s allocation changed. Refresh and try again.");
    const [history] = await tx.insert(reallocationHistory).values({ bookingId, occupantId, fromBedspaceId, toBedspaceId: targetBedspaceId, reason: cleanReason, movedBy: actor.userId }).returning();
    await recordAudit(tx, {
      actor,
      action: "booking.reallocated",
      entityType: "booking_occupant",
      entityId: occupantId,
      before: { bedspaceId: fromBedspaceId },
      after: { bedspaceId: targetBedspaceId, historyId: history!.id },
      reason: cleanReason,
    });
    return history;
  });
}
