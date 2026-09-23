import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bedspaces, rooms } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { authorize, type Actor } from "@/lib/authz/authorize";

/**
 * Intentionally no delete function. A bedspace is never hard-deleted once
 * created — retire it instead (setBedspaceStatus with "RETIRED"). This is a
 * structural guarantee: nothing in this module can remove a row, so there is
 * no path (deliberate or accidental) that erases inventory a historical
 * booking might reference. Postgres also holds the line independently: once
 * Phase 3/4 adds allocations referencing bedspaces by ON DELETE RESTRICT, a
 * bedspace with a real occupant becomes physically undeletable regardless.
 */

export async function createBedspace(actor: Actor, roomId: string, letter: string) {
  authorize(actor, "inventory.write");
  const normalized = letter.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,4}$/.test(normalized)) {
    throw new Error("Bedspace letter must be 1-4 letters or numbers (e.g. A, B, 1).");
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
    if (!room) throw new Error("That room could not be found.");

    const [bedspace] = await tx.insert(bedspaces).values({ roomId, letter: normalized }).returning();
    if (!bedspace) throw new Error("Could not create the bedspace.");

    await recordAudit(tx, {
      actor,
      action: "inventory.bedspace_created",
      entityType: "bedspace",
      entityId: bedspace.id,
      after: bedspace,
    });
    return bedspace;
  });
}

/**
 * AVAILABLE and RETIRED are set here by staff. HELD and OCCUPIED are never
 * set through this function — they will be derived (Phase 3/4) from active
 * holds/allocations, so they can't be forced into a false state by hand.
 */
export async function setBedspaceStatus(
  actor: Actor,
  bedspaceId: string,
  status: "AVAILABLE" | "BLOCKED" | "MAINTENANCE" | "RETIRED",
  reason?: string,
) {
  authorize(actor, "inventory.block");

  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(bedspaces).where(eq(bedspaces.id, bedspaceId)).limit(1);
    if (!before) throw new Error("That bedspace could not be found.");

    const [after] = await tx
      .update(bedspaces)
      .set({ status, updatedAt: new Date() })
      .where(eq(bedspaces.id, bedspaceId))
      .returning();

    await recordAudit(tx, {
      actor,
      action: "inventory.bedspace_status_changed",
      entityType: "bedspace",
      entityId: bedspaceId,
      before,
      after,
      reason,
    });
    return after;
  });
}

export async function listBedspacesForRoom(roomId: string) {
  return getDb()
    .select()
    .from(bedspaces)
    .where(eq(bedspaces.roomId, roomId))
    .orderBy(sql`length(${bedspaces.letter})`, bedspaces.letter);
}
