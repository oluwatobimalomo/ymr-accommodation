import { asc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { bedspaces, rooms } from "@/db/schema";

export interface RenumberSummary {
  roomsChanged: number;
  bedspacesChanged: number;
}

/**
 * Renumbers every room's bedspaces to plain sequential numbers (1, 2, 3...)
 * in original creation order. See src/scripts/renumber-bedspaces.ts for why
 * this uses a two-phase rename (bedspaces has a UNIQUE(room_id, letter)
 * constraint, so an in-place rename can collide mid-way with another row's
 * current label depending on the room's history).
 */
export async function renumberAllBedspaces(db: DbOrTx): Promise<RenumberSummary> {
  const allRooms = await db.select().from(rooms);
  let roomsChanged = 0;
  let bedspacesChanged = 0;

  for (const room of allRooms) {
    const roomBedspaces = await db
      .select()
      .from(bedspaces)
      .where(eq(bedspaces.roomId, room.id))
      .orderBy(asc(bedspaces.createdAt));
    if (roomBedspaces.length === 0) continue;

    const alreadyCorrect = roomBedspaces.every((b, i) => b.letter === String(i + 1));
    if (alreadyCorrect) continue;

    for (const b of roomBedspaces) {
      await db.update(bedspaces).set({ letter: `tmp_${b.id}` }).where(eq(bedspaces.id, b.id));
    }
    for (let i = 0; i < roomBedspaces.length; i++) {
      await db.update(bedspaces).set({ letter: String(i + 1) }).where(eq(bedspaces.id, roomBedspaces[i]!.id));
    }

    bedspacesChanged += roomBedspaces.length;
    roomsChanged++;
  }

  return { roomsChanged, bedspacesChanged };
}
