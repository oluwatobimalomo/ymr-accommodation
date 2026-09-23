import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accommodationCategories, accommodationUnits, bedspaces, rooms } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { authorize, type Actor } from "@/lib/authz/authorize";

export interface CreateRoomInput {
  unitId: string;
  name: string;
  code: string;
  /** Required only when the room won't have bedspace rows (a private, whole-room booking). */
  capacity?: number;
  genderRestriction?: "ANY" | "MALE" | "FEMALE";
}

/**
 * The database trigger `rooms_check_gender_matches_category` is the actual
 * enforcement point; this pre-check exists only to turn that into a clear
 * message instead of a raw constraint-violation error.
 */
async function assertGenderAllowed(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  unitId: string,
  requested: "ANY" | "MALE" | "FEMALE",
) {
  const [row] = await tx
    .select({ categoryGender: accommodationCategories.genderRestriction })
    .from(accommodationUnits)
    .innerJoin(accommodationCategories, eq(accommodationCategories.id, accommodationUnits.categoryId))
    .where(eq(accommodationUnits.id, unitId))
    .limit(1);
  if (!row) throw new Error("That unit could not be found.");
  if ((row.categoryGender === "MALE" || row.categoryGender === "FEMALE") && requested !== row.categoryGender) {
    throw new Error(
      `This room's category is restricted to ${row.categoryGender.toLowerCase()} occupants, so the room must be too.`,
    );
  }
}

export async function createRoom(actor: Actor, input: CreateRoomInput) {
  authorize(actor, "inventory.write");
  const db = getDb();
  return db.transaction(async (tx) => {
    const genderRestriction = input.genderRestriction ?? "ANY";
    await assertGenderAllowed(tx, input.unitId, genderRestriction);

    const [room] = await tx
      .insert(rooms)
      .values({
        unitId: input.unitId,
        name: input.name,
        code: input.code,
        capacity: input.capacity ?? 0,
        genderRestriction,
      })
      .returning();
    if (!room) throw new Error("Could not create the room.");

    await recordAudit(tx, {
      actor,
      action: "inventory.room_created",
      entityType: "room",
      entityId: room.id,
      after: room,
    });
    return room;
  });
}

export interface UpdateRoomInput {
  name?: string;
  code?: string;
  genderRestriction?: "ANY" | "MALE" | "FEMALE";
}

export async function updateRoom(actor: Actor, roomId: string, input: UpdateRoomInput) {
  authorize(actor, "inventory.write");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
    if (!before) throw new Error("That room could not be found.");

    if (input.genderRestriction) await assertGenderAllowed(tx, before.unitId, input.genderRestriction);

    const [after] = await tx
      .update(rooms)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(rooms.id, roomId))
      .returning();

    await recordAudit(tx, {
      actor,
      action: "inventory.room_updated",
      entityType: "room",
      entityId: roomId,
      before,
      after,
    });
    return after;
  });
}

/** Capacity here only takes effect for a room with no bedspace rows; otherwise the trigger keeps it derived. */
export async function updateRoomCapacity(actor: Actor, roomId: string, capacity: number, reason?: string) {
  authorize(actor, "capacity.write");
  if (capacity < 0 || !Number.isInteger(capacity)) throw new Error("Capacity must be a whole number, 0 or more.");

  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
    if (!before) throw new Error("That room could not be found.");

    const bedspaceCount = await tx.select().from(bedspaces).where(eq(bedspaces.roomId, roomId));
    if (bedspaceCount.length > 0) {
      throw new Error("This room's capacity is set by its bedspaces. Add or retire bedspaces instead.");
    }

    const [after] = await tx
      .update(rooms)
      .set({ capacity, updatedAt: new Date() })
      .where(eq(rooms.id, roomId))
      .returning();

    await recordAudit(tx, {
      actor,
      action: "inventory.room_capacity_changed",
      entityType: "room",
      entityId: roomId,
      before,
      after,
      reason,
    });
    return after;
  });
}

export async function setRoomStatus(
  actor: Actor,
  roomId: string,
  status: "ACTIVE" | "INACTIVE" | "MAINTENANCE",
  reason?: string,
) {
  authorize(actor, "inventory.block");

  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
    if (!before) throw new Error("That room could not be found.");

    const [after] = await tx
      .update(rooms)
      .set({ status, updatedAt: new Date() })
      .where(eq(rooms.id, roomId))
      .returning();

    await recordAudit(tx, {
      actor,
      action: "inventory.room_status_changed",
      entityType: "room",
      entityId: roomId,
      before,
      after,
      reason,
    });
    return after;
  });
}

export async function listRoomsForUnit(unitId: string) {
  return getDb().select().from(rooms).where(eq(rooms.unitId, unitId)).orderBy(rooms.name);
}

export async function getRoom(roomId: string) {
  const [row] = await getDb().select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  return row ?? null;
}
