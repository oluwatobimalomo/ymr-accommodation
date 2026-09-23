import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  accommodationCategories,
  accommodationUnits,
  bedspaces,
  lodges,
  rooms,
  unitFacilities,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { authorize, type Actor } from "@/lib/authz/authorize";

/**
 * "Apartment" is the simplified admin-facing concept this module builds on
 * top of the underlying category/unit(/room/bedspace) tables: one form,
 * shaped by Mode, that creates everything needed underneath in a single
 * step. The admin never has to think about categories, units, rooms or
 * bedspaces as separate things to create one by one - they just add an
 * apartment. The lower-level tables and their invariants (gender-matching
 * triggers, capacity sync, the anti-oversell unique indexes) are unchanged
 * and still fully enforced; this is a friendlier way to drive them.
 */

export interface CreateApartmentInput {
  lodgeId: string;
  name: string;
  mode: "PRIVATE" | "SHARED";
  priceNaira: number;
  description?: string;
  images?: string[];
  // PRIVATE
  facilityIds?: string[];
  // SHARED
  genderRestriction?: "MALE" | "FEMALE" | "ANY";
  bedspaceCount?: number;
}

function slugCode(name: string): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
  return (base || "APT") + Math.random().toString(36).slice(2, 4).toUpperCase();
}

/**
 * Spreadsheet-style column naming: A, B, ... Z, AA, AB, ... - unlike falling
 * back to plain numbers past 26, this never mixes digit and letter sorting
 * (which put "27".."40" before "A".."Z" in a plain text sort) and never
 * looks like something broke once a room has more than 26 bedspaces.
 */
function letterForIndex(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export async function createApartment(actor: Actor, input: CreateApartmentInput) {
  authorize(actor, "inventory.write");
  if (!input.name.trim()) throw new Error("Apartment name is required.");
  if (!Number.isFinite(input.priceNaira) || input.priceNaira <= 0) throw new Error("Please enter a valid price.");

  const db = getDb();
  return db.transaction(async (tx) => {
    const [lodge] = await tx.select().from(lodges).where(eq(lodges.id, input.lodgeId)).limit(1);
    if (!lodge) throw new Error("That lodge could not be found.");

    const priceMinor = Math.round(input.priceNaira * 100);
    const [category] = await tx
      .insert(accommodationCategories)
      .values({
        lodgeId: input.lodgeId,
        name: input.name,
        mode: input.mode,
        genderRestriction: input.mode === "SHARED" ? (input.genderRestriction ?? "ANY") : "ANY",
        pricingModel: input.mode === "PRIVATE" ? "PER_UNIT" : "PER_PERSON",
        defaultPriceMinor: priceMinor,
        description: input.description ?? "",
      })
      .returning();
    if (!category) throw new Error("Could not create the apartment.");

    const [unit] = await tx
      .insert(accommodationUnits)
      .values({
        categoryId: category.id,
        name: input.name,
        code: slugCode(input.name),
        description: input.description ?? "",
        images: input.images ?? [],
      })
      .returning();
    if (!unit) throw new Error("Could not create the apartment.");

    if (input.mode === "PRIVATE") {
      if (input.facilityIds?.length) {
        await tx.insert(unitFacilities).values(input.facilityIds.map((facilityId) => ({ unitId: unit.id, facilityId })));
      }
    } else {
      const count = input.bedspaceCount ?? 0;
      if (count < 1) throw new Error("Please enter at least 1 bedspace.");
      const [room] = await tx
        .insert(rooms)
        .values({
          unitId: unit.id,
          name: input.name,
          code: "R1",
          genderRestriction: input.genderRestriction ?? "ANY",
        })
        .returning();
      if (!room) throw new Error("Could not create the apartment.");

      const values = Array.from({ length: count }, (_, i) => ({
        roomId: room.id,
        letter: letterForIndex(i),
      }));
      await tx.insert(bedspaces).values(values);
    }

    await recordAudit(tx, {
      actor,
      action: "inventory.apartment_created",
      entityType: "accommodation_unit",
      entityId: unit.id,
      after: { categoryId: category.id, name: input.name, mode: input.mode },
    });

    return { categoryId: category.id, unitId: unit.id };
  });
}

export interface ApartmentSummary {
  unitId: string;
  categoryId: string;
  name: string;
  mode: "PRIVATE" | "SHARED";
  priceMinor: number;
  pricingModel: "PER_UNIT" | "PER_PERSON";
  genderRestriction: "ANY" | "MALE" | "FEMALE";
  capacity: number;
  status: string;
  image?: string;
}

/** Flat list of every apartment (unit) in a lodge, across all its categories - the admin no longer manages categories separately. */
export async function listApartmentsForLodge(lodgeId: string): Promise<ApartmentSummary[]> {
  const rows = await getDb()
    .select({
      unitId: accommodationUnits.id,
      categoryId: accommodationCategories.id,
      name: accommodationUnits.name,
      mode: accommodationCategories.mode,
      priceMinor: accommodationCategories.defaultPriceMinor,
      pricingModel: accommodationCategories.pricingModel,
      genderRestriction: accommodationCategories.genderRestriction,
      capacity: accommodationUnits.capacity,
      status: accommodationUnits.status,
      images: accommodationUnits.images,
    })
    .from(accommodationUnits)
    .innerJoin(accommodationCategories, eq(accommodationCategories.id, accommodationUnits.categoryId))
    .where(eq(accommodationCategories.lodgeId, lodgeId))
    .orderBy(accommodationUnits.name);

  return rows.map((r) => ({ ...r, image: r.images[0] }));
}

export interface ApartmentDetail {
  unit: typeof accommodationUnits.$inferSelect;
  category: typeof accommodationCategories.$inferSelect;
  room: typeof rooms.$inferSelect | null;
  bedspaceList: (typeof bedspaces.$inferSelect)[];
  facilityIds: string[];
}

export async function getApartmentDetail(unitId: string): Promise<ApartmentDetail | null> {
  const db = getDb();
  const [unit] = await db.select().from(accommodationUnits).where(eq(accommodationUnits.id, unitId)).limit(1);
  if (!unit) return null;
  const [category] = await db.select().from(accommodationCategories).where(eq(accommodationCategories.id, unit.categoryId)).limit(1);
  if (!category) return null;

  const [room] = await db.select().from(rooms).where(eq(rooms.unitId, unitId)).limit(1);
  const bedspaceList = room
    ? await db
        .select()
        .from(bedspaces)
        .where(eq(bedspaces.roomId, room.id))
        .orderBy(sql`length(${bedspaces.letter})`, bedspaces.letter)
    : [];
  const facilityRows = await db.select({ facilityId: unitFacilities.facilityId }).from(unitFacilities).where(eq(unitFacilities.unitId, unitId));

  return { unit, category, room: room ?? null, bedspaceList, facilityIds: facilityRows.map((f) => f.facilityId) };
}

export interface UpdateApartmentInput {
  name?: string;
  priceNaira?: number;
  images?: string[];
  facilityIds?: string[]; // PRIVATE only
}

export async function updateApartment(actor: Actor, unitId: string, input: UpdateApartmentInput) {
  authorize(actor, "inventory.write");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [unit] = await tx.select().from(accommodationUnits).where(eq(accommodationUnits.id, unitId)).limit(1);
    if (!unit) throw new Error("That apartment could not be found.");

    if (input.name !== undefined || input.images !== undefined) {
      await tx
        .update(accommodationUnits)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.images !== undefined ? { images: input.images } : {}),
          updatedAt: new Date(),
        })
        .where(eq(accommodationUnits.id, unitId));
      // Keep the category's own name in step, so it doesn't silently
      // diverge from the apartment name shown everywhere else.
      if (input.name !== undefined) {
        await tx
          .update(accommodationCategories)
          .set({ name: input.name, updatedAt: new Date() })
          .where(eq(accommodationCategories.id, unit.categoryId));
      }
    }

    if (input.priceNaira !== undefined) {
      const priceMinor = Math.round(input.priceNaira * 100);
      await tx
        .update(accommodationCategories)
        .set({ defaultPriceMinor: priceMinor, updatedAt: new Date() })
        .where(eq(accommodationCategories.id, unit.categoryId));
    }

    if (input.facilityIds !== undefined) {
      await tx.delete(unitFacilities).where(eq(unitFacilities.unitId, unitId));
      if (input.facilityIds.length) {
        await tx.insert(unitFacilities).values(input.facilityIds.map((facilityId) => ({ unitId, facilityId })));
      }
    }

    await recordAudit(tx, {
      actor,
      action: "inventory.apartment_updated",
      entityType: "accommodation_unit",
      entityId: unitId,
      after: input,
    });
  });
}

/** Adds more bedspaces to an existing shared apartment (e.g. Room 1 gains letters E, F). */
export async function addBedspacesToApartment(actor: Actor, unitId: string, count: number) {
  authorize(actor, "inventory.write");
  if (count < 1) throw new Error("Enter at least 1 bedspace to add.");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [room] = await tx.select().from(rooms).where(eq(rooms.unitId, unitId)).limit(1);
    if (!room) throw new Error("This apartment has no room configured yet.");
    const existing = await tx.select().from(bedspaces).where(eq(bedspaces.roomId, room.id));
    const startIndex = existing.length;
    const values = Array.from({ length: count }, (_, i) => ({ roomId: room.id, letter: letterForIndex(startIndex + i) }));
    await tx.insert(bedspaces).values(values);
    await recordAudit(tx, {
      actor,
      action: "inventory.bedspaces_added",
      entityType: "accommodation_unit",
      entityId: unitId,
      after: { added: count },
    });
  });
}
