import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  accommodationCategories,
  accommodationUnits,
  bedspaces,
  facilities,
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
  checkInDate?: string;
  checkOutDate?: string;
  description?: string;
  images?: string[];
  // PRIVATE
  facilityIds?: string[];
  bedSpecifications?: string[];
  // SHARED
  genderRestriction?: "MALE" | "FEMALE" | "ANY";
  bedspaceCount?: number;
  /**
   * Number of identical rooms to create under this one apartment, each with
   * `bedspaceCount` bedspaces of its own (independently lettered A, B, C...
   * within each room). Defaults to 1. This is what makes something like
   * "190 rooms of 4 bedspaces" a single submission instead of 190 separate
   * ones - all 190 rooms share one category, one price, one listing.
   */
  roomCount?: number;
}

function validateStayDates(checkInDate?: string, checkOutDate?: string, required = true) {
  if (!checkInDate && !checkOutDate && !required) return;
  if (!checkInDate || !checkOutDate) throw new Error("Choose both the check-in and check-out dates.");
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!validDate(checkInDate) || !validDate(checkOutDate)) throw new Error("Enter valid check-in and check-out dates.");
  if (checkOutDate <= checkInDate) throw new Error("Check-out must be after check-in.");
}

function slugCode(name: string): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
  return (base || "APT") + Math.random().toString(36).slice(2, 4).toUpperCase();
}

/**
 * Plain sequential numbering (1, 2, 3, ...), matching real dormitory bed
 * numbering conventions. The existing sort order elsewhere in this file
 * (length first, then alphabetically) already handles this correctly for
 * pure numeric strings without any further change: "1".."9" (length 1)
 * sort before "10".."40" (length 2), and same-length digit strings sort
 * alphabetically in the same order as numerically.
 */
function bedspaceLabelForIndex(index: number): string {
  return String(index + 1);
}

export async function createApartment(actor: Actor, input: CreateApartmentInput) {
  authorize(actor, "inventory.write");
  if (!input.name.trim()) throw new Error("Apartment name is required.");
  if (!Number.isFinite(input.priceNaira) || input.priceNaira <= 0) throw new Error("Please enter a valid price.");
  validateStayDates(input.checkInDate, input.checkOutDate, false);

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
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
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
        bedSpecifications: [...new Set(input.bedSpecifications ?? [])],
      })
      .returning();
    if (!unit) throw new Error("Could not create the apartment.");

    await tx.insert(facilities).values({ name: "Bed", sortOrder: 0 }).onConflictDoNothing({ target: facilities.name });
    const [bedFacility] = await tx
      .select({ id: facilities.id })
      .from(facilities)
      .where(sql`lower(${facilities.name}) = 'bed'`)
      .limit(1);
    const facilityIds = [...new Set([...(input.facilityIds ?? []), ...(bedFacility ? [bedFacility.id] : [])])];
    if (facilityIds.length) {
      await tx.insert(unitFacilities).values(facilityIds.map((facilityId) => ({ unitId: unit.id, facilityId })));
    }

    if (input.mode === "SHARED") {
      const bedspacesPerRoom = input.bedspaceCount ?? 0;
      if (bedspacesPerRoom < 1) throw new Error("Please enter at least 1 bedspace.");
      const roomCount = Math.max(1, input.roomCount ?? 1);

      for (let r = 0; r < roomCount; r++) {
        const [room] = await tx
          .insert(rooms)
          .values({
            unitId: unit.id,
            name: roomCount > 1 ? `Room ${r + 1}` : input.name,
            code: `R${r + 1}`,
            genderRestriction: input.genderRestriction ?? "ANY",
          })
          .returning();
        if (!room) throw new Error("Could not create the apartment.");

        const values = Array.from({ length: bedspacesPerRoom }, (_, i) => ({
          roomId: room.id,
          letter: bedspaceLabelForIndex(i),
        }));
        await tx.insert(bedspaces).values(values);
      }
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
  bedSpecifications: string[];
  facilities: string[];
}

/** Flat list of every apartment (unit) in a lodge, across all its categories - the admin no longer manages categories separately. */
export async function listApartmentsForLodge(lodgeId: string): Promise<ApartmentSummary[]> {
  const db = getDb();
  const rows = await db
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
      image: sql<string | null>`${accommodationUnits.images}[1]`,
      bedSpecifications: accommodationUnits.bedSpecifications,
    })
    .from(accommodationUnits)
    .innerJoin(accommodationCategories, eq(accommodationCategories.id, accommodationUnits.categoryId))
    .where(eq(accommodationCategories.lodgeId, lodgeId))
    .orderBy(accommodationUnits.name);

  const facilityRows = rows.length
    ? await db.select({ unitId: unitFacilities.unitId, name: facilities.name }).from(unitFacilities).innerJoin(facilities, eq(facilities.id, unitFacilities.facilityId)).where(inArray(unitFacilities.unitId, rows.map((row) => row.unitId)))
    : [];
  const facilitiesByUnit = new Map<string, string[]>();
  for (const facility of facilityRows) facilitiesByUnit.set(facility.unitId, [...(facilitiesByUnit.get(facility.unitId) ?? []), facility.name]);
  return rows.map((r) => ({ ...r, image: r.image ?? undefined, facilities: facilitiesByUnit.get(r.unitId) ?? [] }));
}

export interface ApartmentRoomDetail {
  room: typeof rooms.$inferSelect;
  bedspaceList: (typeof bedspaces.$inferSelect)[];
}

export interface ApartmentDetail {
  unit: typeof accommodationUnits.$inferSelect;
  category: typeof accommodationCategories.$inferSelect;
  rooms: ApartmentRoomDetail[];
  facilityIds: string[];
}

export async function getApartmentDetail(unitId: string): Promise<ApartmentDetail | null> {
  const db = getDb();
  const [unit] = await db.select().from(accommodationUnits).where(eq(accommodationUnits.id, unitId)).limit(1);
  if (!unit) return null;
  const [category] = await db.select().from(accommodationCategories).where(eq(accommodationCategories.id, unit.categoryId)).limit(1);
  if (!category) return null;

  const roomRows = await db.select().from(rooms).where(eq(rooms.unitId, unitId)).orderBy(sql`length(${rooms.code})`, rooms.code);
  const bedspaceRows = roomRows.length
    ? await db.select().from(bedspaces).where(inArray(bedspaces.roomId, roomRows.map((room) => room.id))).orderBy(sql`length(${bedspaces.letter})`, bedspaces.letter)
    : [];
  const bedspacesByRoom = new Map<string, typeof bedspaceRows>();
  for (const bedspace of bedspaceRows) {
    const roomBedspaces = bedspacesByRoom.get(bedspace.roomId) ?? [];
    roomBedspaces.push(bedspace);
    bedspacesByRoom.set(bedspace.roomId, roomBedspaces);
  }
  const roomDetails: ApartmentRoomDetail[] = roomRows.map((room) => ({ room, bedspaceList: bedspacesByRoom.get(room.id) ?? [] }));

  const facilityRows = await db.select({ facilityId: unitFacilities.facilityId }).from(unitFacilities).where(eq(unitFacilities.unitId, unitId));

  return { unit, category, rooms: roomDetails, facilityIds: facilityRows.map((f) => f.facilityId) };
}

export interface UpdateApartmentInput {
  name?: string;
  priceNaira?: number;
  checkInDate?: string;
  checkOutDate?: string;
  images?: string[];
  facilityIds?: string[]; // PRIVATE only
  bedSpecifications?: string[];
}

export async function updateApartment(actor: Actor, unitId: string, input: UpdateApartmentInput) {
  authorize(actor, "inventory.write");
  if (input.checkInDate !== undefined || input.checkOutDate !== undefined) validateStayDates(input.checkInDate, input.checkOutDate);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [unit] = await tx.select().from(accommodationUnits).where(eq(accommodationUnits.id, unitId)).limit(1);
    if (!unit) throw new Error("That apartment could not be found.");

    if (input.name !== undefined || input.images !== undefined || input.bedSpecifications !== undefined) {
      await tx
        .update(accommodationUnits)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.images !== undefined ? { images: input.images } : {}),
          ...(input.bedSpecifications !== undefined ? { bedSpecifications: [...new Set(input.bedSpecifications)] } : {}),
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

    if (input.priceNaira !== undefined || input.checkInDate !== undefined || input.checkOutDate !== undefined) {
      const priceMinor = input.priceNaira === undefined ? undefined : Math.round(input.priceNaira * 100);
      await tx
        .update(accommodationCategories)
        .set({
          ...(priceMinor !== undefined ? { defaultPriceMinor: priceMinor } : {}),
          ...(input.checkInDate !== undefined ? { checkInDate: input.checkInDate, checkOutDate: input.checkOutDate! } : {}),
          updatedAt: new Date(),
        })
        .where(eq(accommodationCategories.id, unit.categoryId));
    }

    if (input.facilityIds !== undefined) {
      await tx.delete(unitFacilities).where(eq(unitFacilities.unitId, unitId));
      await tx.insert(facilities).values({ name: "Bed", sortOrder: 0 }).onConflictDoNothing({ target: facilities.name });
      const [bedFacility] = await tx
        .select({ id: facilities.id })
        .from(facilities)
        .where(sql`lower(${facilities.name}) = 'bed'`)
        .limit(1);
      const facilityIds = [...new Set([...input.facilityIds, ...(bedFacility ? [bedFacility.id] : [])])];
      if (facilityIds.length) {
        await tx.insert(unitFacilities).values(facilityIds.map((facilityId) => ({ unitId, facilityId })));
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
/** Adds more bedspaces to one specific room within an apartment (a room may not be the apartment's only one, now that apartments can have many rooms). */
export async function addBedspacesToRoom(actor: Actor, roomId: string, count: number) {
  authorize(actor, "inventory.write");
  if (count < 1) throw new Error("Enter at least 1 bedspace to add.");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
    if (!room) throw new Error("That room could not be found.");
    const existing = await tx.select().from(bedspaces).where(eq(bedspaces.roomId, roomId));
    const startIndex = existing.length;
    const values = Array.from({ length: count }, (_, i) => ({ roomId, letter: bedspaceLabelForIndex(startIndex + i) }));
    await tx.insert(bedspaces).values(values);
    await recordAudit(tx, {
      actor,
      action: "inventory.bedspaces_added",
      entityType: "room",
      entityId: roomId,
      after: { added: count },
    });
  });
}

/** Adds a whole new room to an existing shared apartment, e.g. going from 189 to 190 rooms without recreating the apartment. */
export async function addRoomToApartment(actor: Actor, unitId: string, bedspaceCount: number) {
  authorize(actor, "inventory.write");
  if (bedspaceCount < 1) throw new Error("Enter at least 1 bedspace for the new room.");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [unit] = await tx.select().from(accommodationUnits).where(eq(accommodationUnits.id, unitId)).limit(1);
    if (!unit) throw new Error("That apartment could not be found.");
    const [category] = await tx.select().from(accommodationCategories).where(eq(accommodationCategories.id, unit.categoryId)).limit(1);
    if (!category) throw new Error("That apartment's category could not be found.");

    const existingRooms = await tx.select().from(rooms).where(eq(rooms.unitId, unitId));
    const nextIndex = existingRooms.length + 1;
    const [room] = await tx
      .insert(rooms)
      .values({
        unitId,
        name: `Room ${nextIndex}`,
        code: `R${nextIndex}`,
        genderRestriction: category.genderRestriction,
      })
      .returning();
    if (!room) throw new Error("Could not create the room.");

    const values = Array.from({ length: bedspaceCount }, (_, i) => ({ roomId: room.id, letter: bedspaceLabelForIndex(i) }));
    await tx.insert(bedspaces).values(values);

    await recordAudit(tx, {
      actor,
      action: "inventory.room_added_to_apartment",
      entityType: "accommodation_unit",
      entityId: unitId,
      after: { roomName: room.name, bedspaceCount },
    });
  });
}
