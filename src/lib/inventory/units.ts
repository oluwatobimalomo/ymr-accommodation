import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accommodationCategories, accommodationUnits, facilities, unitFacilities } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { authorize, type Actor } from "@/lib/authz/authorize";

export interface CreateUnitInput {
  categoryId: string;
  name: string;
  code: string;
  description?: string;
  /** Only meaningful for a unit with no rooms (e.g. a private chalet); ignored once rooms exist. */
  capacity?: number;
}

export async function createUnit(actor: Actor, input: CreateUnitInput) {
  authorize(actor, "inventory.write");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [category] = await tx
      .select()
      .from(accommodationCategories)
      .where(eq(accommodationCategories.id, input.categoryId))
      .limit(1);
    if (!category) throw new Error("That category could not be found.");

    const [unit] = await tx
      .insert(accommodationUnits)
      .values({
        categoryId: input.categoryId,
        name: input.name,
        code: input.code,
        description: input.description ?? "",
        capacity: input.capacity ?? 0,
      })
      .returning();
    if (!unit) throw new Error("Could not create the unit.");

    await recordAudit(tx, {
      actor,
      action: "inventory.unit_created",
      entityType: "accommodation_unit",
      entityId: unit.id,
      after: unit,
    });
    return unit;
  });
}

export interface UpdateUnitInput {
  name?: string;
  description?: string;
  capacity?: number;
  images?: string[];
}

export async function updateUnit(actor: Actor, unitId: string, input: UpdateUnitInput) {
  authorize(actor, "inventory.write");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(accommodationUnits).where(eq(accommodationUnits.id, unitId)).limit(1);
    if (!before) throw new Error("That unit could not be found.");

    const [after] = await tx
      .update(accommodationUnits)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(accommodationUnits.id, unitId))
      .returning();

    await recordAudit(tx, {
      actor,
      action: "inventory.unit_updated",
      entityType: "accommodation_unit",
      entityId: unitId,
      before,
      after,
    });
    return after;
  });
}

/** Capacity changes get their own audited entry point, matching the brief's confirmation requirement for capacity edits. */
export async function updateUnitCapacity(actor: Actor, unitId: string, capacity: number, reason?: string) {
  authorize(actor, "capacity.write");
  if (capacity < 0 || !Number.isInteger(capacity)) throw new Error("Capacity must be a whole number, 0 or more.");

  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(accommodationUnits).where(eq(accommodationUnits.id, unitId)).limit(1);
    if (!before) throw new Error("That unit could not be found.");

    const [after] = await tx
      .update(accommodationUnits)
      .set({ capacity, updatedAt: new Date() })
      .where(eq(accommodationUnits.id, unitId))
      .returning();

    await recordAudit(tx, {
      actor,
      action: "inventory.unit_capacity_changed",
      entityType: "accommodation_unit",
      entityId: unitId,
      before,
      after,
      reason,
    });
    return after;
  });
}

export async function setUnitStatus(
  actor: Actor,
  unitId: string,
  status: "ACTIVE" | "INACTIVE" | "MAINTENANCE",
  reason?: string,
) {
  authorize(actor, "inventory.block");

  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(accommodationUnits).where(eq(accommodationUnits.id, unitId)).limit(1);
    if (!before) throw new Error("That unit could not be found.");

    const [after] = await tx
      .update(accommodationUnits)
      .set({ status, updatedAt: new Date() })
      .where(eq(accommodationUnits.id, unitId))
      .returning();

    await recordAudit(tx, {
      actor,
      action: "inventory.unit_status_changed",
      entityType: "accommodation_unit",
      entityId: unitId,
      before,
      after,
      reason,
    });
    return after;
  });
}

export async function setUnitFacilities(actor: Actor, unitId: string, facilityIds: string[]) {
  authorize(actor, "inventory.write");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [unit] = await tx.select().from(accommodationUnits).where(eq(accommodationUnits.id, unitId)).limit(1);
    if (!unit) throw new Error("That unit could not be found.");

    const before = await tx.select().from(unitFacilities).where(eq(unitFacilities.unitId, unitId));
    await tx.delete(unitFacilities).where(eq(unitFacilities.unitId, unitId));
    if (facilityIds.length) {
      await tx.insert(unitFacilities).values(facilityIds.map((facilityId) => ({ unitId, facilityId })));
    }

    await recordAudit(tx, {
      actor,
      action: "inventory.unit_facilities_changed",
      entityType: "accommodation_unit",
      entityId: unitId,
      before: before.map((r) => r.facilityId),
      after: facilityIds,
    });
    return facilityIds;
  });
}

export async function listUnitsForCategory(categoryId: string) {
  return getDb()
    .select()
    .from(accommodationUnits)
    .where(eq(accommodationUnits.categoryId, categoryId))
    .orderBy(accommodationUnits.name);
}

export async function getUnit(unitId: string) {
  const [row] = await getDb().select().from(accommodationUnits).where(eq(accommodationUnits.id, unitId)).limit(1);
  return row ?? null;
}

export async function listFacilitiesForUnit(unitId: string) {
  return getDb()
    .select({ id: facilities.id, name: facilities.name, icon: facilities.icon })
    .from(unitFacilities)
    .innerJoin(facilities, eq(facilities.id, unitFacilities.facilityId))
    .where(eq(unitFacilities.unitId, unitId))
    .orderBy(facilities.sortOrder);
}
