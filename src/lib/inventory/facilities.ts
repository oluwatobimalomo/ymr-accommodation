import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { facilities } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { authorize, type Actor } from "@/lib/authz/authorize";

export async function createFacility(actor: Actor, name: string, icon = "") {
  authorize(actor, "inventory.write");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Facility name cannot be empty.");

  const db = getDb();
  const [facility] = await db.insert(facilities).values({ name: trimmed, icon }).returning();
  if (!facility) throw new Error("Could not create the facility.");

  await recordAudit(db, {
    actor,
    action: "inventory.facility_created",
    entityType: "facility",
    entityId: facility.id,
    after: facility,
  });
  return facility;
}

export async function listFacilities() {
  const rows = await getDb().select().from(facilities).orderBy(facilities.sortOrder, facilities.name);
  return rows.filter((facility) => facility.name.trim().toLowerCase() !== "air conditioning");
}

/** Deleting is deliberately unavailable while a unit still uses the facility — the FK (ON DELETE RESTRICT) enforces this even if a caller is added later that skips this check. */
export async function deleteFacility(actor: Actor, facilityId: string) {
  authorize(actor, "inventory.write");
  const db = getDb();
  const [before] = await db.select().from(facilities).where(eq(facilities.id, facilityId)).limit(1);
  if (!before) throw new Error("That facility could not be found.");

  await db.delete(facilities).where(eq(facilities.id, facilityId));
  await recordAudit(db, {
    actor,
    action: "inventory.facility_deleted",
    entityType: "facility",
    entityId: facilityId,
    before,
  });
}
