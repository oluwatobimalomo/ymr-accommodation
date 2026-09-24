import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  accommodationCategories,
  accommodationUnits,
  bedspaces,
  bookingOccupants,
  bookings,
  events,
  inventoryHolds,
  lodges,
  rooms,
} from "@/db/schema";
import { autoHoldBedspaces, autoHoldUnit, holdBedspace, holdEntireRoom, holdUnit, InventoryUnavailableError } from "./holds";
import { nextBookingReference } from "./reference";
import { recordAudit } from "@/lib/audit";

export interface OccupantInput {
  name: string;
  phone?: string;
  email?: string;
  gender: "MALE" | "FEMALE";
  /** Required when the category lets the customer pick the exact bedspace. */
  bedspaceId?: string;
}

export interface CreateBookingInput {
  categoryId: string;
  bookerName: string;
  bookerPhone: string;
  bookerEmail: string;
  occupants: OccupantInput[];
  /** SHARED + allowEntireRoomBooking: book every bedspace in this room at once. */
  entireRoomId?: string;
  /** PRIVATE + customerSelectsRoom: the specific unit the customer chose. */
  unitId?: string;
}

export interface CreateBookingResult {
  reference: string;
  bookingId: string;
  amountMinor: number;
  currency: string;
}

type Assignment = { bedspaceId?: string; unitId?: string };

function assertNonEmptyName(value: string, field: string) {
  if (!value.trim()) throw new Error(`${field} is required.`);
}

/**
 * Orchestrates one booking end to end: validate, hold inventory, generate
 * the reference, write booking + occupant rows, all inside one transaction.
 * Payment is Phase 4 — this leaves the booking at paymentStatus PENDING.
 *
 * Scope note: PRIVATE categories are handled at the whole-UNIT level only
 * (matching every private example in the brief, e.g. "Chalet A" with no
 * room breakdown). A private category that also breaks into individual
 * bookable rooms would need a small follow-up; the schema already supports
 * it (holdRoom exists), this orchestration function just doesn't call it yet.
 */
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  assertNonEmptyName(input.bookerName, "Booker name");
  assertNonEmptyName(input.bookerPhone, "Phone number");
  assertNonEmptyName(input.bookerEmail, "Email");
  if (input.occupants.length === 0) throw new Error("At least one occupant is required.");
  for (const o of input.occupants) assertNonEmptyName(o.name, "Each occupant's name");

  const db = getDb();
  return db.transaction(async (tx) => {
    const [category] = await tx
      .select()
      .from(accommodationCategories)
      .where(eq(accommodationCategories.id, input.categoryId))
      .limit(1);
    if (!category || category.status !== "ACTIVE") throw new Error("That accommodation category is not available.");

    const [lodge] = await tx.select().from(lodges).where(eq(lodges.id, category.lodgeId)).limit(1);
    if (!lodge || lodge.status !== "ACTIVE") throw new Error("That lodge is not currently available.");

    const [event] = await tx.select().from(events).where(eq(events.id, lodge.eventId)).limit(1);
    if (!event) throw new Error("That event could not be found.");
    if (event.status !== "OPEN") throw new Error("Booking is not currently open for this event.");

    const occupantCount = input.occupants.length;
    const amountMinor =
      category.pricingModel === "PER_PERSON" ? category.defaultPriceMinor * occupantCount : category.defaultPriceMinor;

    const assignments = await resolveAssignments(tx, category, input, occupantCount, event.holdMinutes);
    const reference = await nextBookingReference(tx, event.id, lodge.name);

    const [booking] = await tx
      .insert(bookings)
      .values({
        eventId: event.id,
        reference,
        categoryId: category.id,
        bookerName: input.bookerName,
        bookerPhone: input.bookerPhone,
        bookerEmail: input.bookerEmail,
        occupantCount,
        amountMinor,
        currency: event.currency,
      })
      .returning();
    if (!booking) throw new Error("Could not create the booking.");

    try {
      await tx.insert(bookingOccupants).values(
        input.occupants.map((o, i) => ({
          bookingId: booking.id,
          name: o.name,
          phone: o.phone ?? "",
          email: o.email ?? "",
          gender: o.gender,
          bedspaceId: assignments[i]?.bedspaceId ?? null,
          unitId: assignments[i]?.unitId ?? null,
        })),
      );
    } catch (error) {
      // The occupant trigger creates the durable private-unit claim. Its
      // partial unique index is the final guard against a competing claim.
      if (isUniqueViolation(error)) {
        throw new InventoryUnavailableError("This accommodation was just reserved by another participant.");
      }
      throw error;
    }

    const targetUnitIds = [...new Set(assignments.map((a) => a.unitId).filter((v): v is string => !!v))];
    if (category.mode === "PRIVATE" && targetUnitIds.length) {
      await recordAudit(tx, {
        actor: null,
        action: "inventory.private_unit_reserved",
        entityType: "booking",
        entityId: booking.id,
        after: { unitIds: targetUnitIds },
      });
    }

    const targetBedspaceIds = assignments.map((a) => a.bedspaceId).filter((v): v is string => !!v);
    if (targetBedspaceIds.length) {
      await tx
        .update(inventoryHolds)
        .set({ bookingId: booking.id })
        .where(inArray(inventoryHolds.bedspaceId, targetBedspaceIds));
    }
    if (targetUnitIds.length) {
      await tx.update(inventoryHolds).set({ bookingId: booking.id }).where(inArray(inventoryHolds.unitId, targetUnitIds));
    }

    return { reference, bookingId: booking.id, amountMinor, currency: event.currency };
  });
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

async function resolveAssignments(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  category: typeof accommodationCategories.$inferSelect,
  input: CreateBookingInput,
  occupantCount: number,
  holdMinutes: number,
): Promise<Assignment[]> {
  if (category.mode === "SHARED") {
    if (input.entireRoomId) {
      if (!category.allowEntireRoomBooking) throw new Error("Booking an entire room is not available for this category.");
      await holdEntireRoom(tx, input.entireRoomId, holdMinutes);
      const roomBedspaces = await tx.select().from(bedspaces).where(eq(bedspaces.roomId, input.entireRoomId));
      if (roomBedspaces.length !== occupantCount) {
        throw new Error(`This room has ${roomBedspaces.length} bedspaces; you provided ${occupantCount} occupant(s).`);
      }
      return roomBedspaces.map((b) => ({ bedspaceId: b.id }));
    }

    if (category.customerSelectsBedspace) {
      const ids = input.occupants.map((o) => o.bedspaceId);
      if (ids.some((id) => !id)) throw new Error("Please select a bedspace for every occupant.");
      if (new Set(ids).size !== ids.length) throw new Error("Each occupant needs a different bedspace.");

      // Check gender BEFORE holding anything or touching the database
      // trigger that also enforces this: that trigger's job is to be the
      // unconditional last line of defense, not the first place a mismatch
      // is ever caught. Catching it here means a real customer sees a
      // specific, actionable message instead of a generic "something went
      // wrong" (a mismatch caught only by the trigger surfaces as a raw,
      // sanitized database error with no useful detail for the customer).
      const bedspaceRows = await tx
        .select({ bedspaceId: bedspaces.id, roomGender: rooms.genderRestriction, roomName: rooms.name })
        .from(bedspaces)
        .innerJoin(rooms, eq(rooms.id, bedspaces.roomId))
        .where(inArray(bedspaces.id, ids as string[]));
      const genderById = new Map(bedspaceRows.map((b) => [b.bedspaceId, b]));

      for (const [i, occupant] of input.occupants.entries()) {
        const target = genderById.get(ids[i] as string);
        if (!target) throw new Error("That bedspace could not be found.");
        if (target.roomGender !== "ANY" && target.roomGender !== occupant.gender) {
          const wrongLabel = target.roomGender === "MALE" ? "Male" : "Female";
          const rightLabel = occupant.gender === "MALE" ? "Male" : "Female";
          throw new Error(
            `${occupant.name || "One of your occupants"} is ${rightLabel.toLowerCase()}, but that bedspace is in ${target.roomName} (${wrongLabel}-only). Please go back and choose a bedspace in the ${rightLabel} section instead.`,
          );
        }
      }

      for (const id of ids as string[]) await holdBedspace(tx, id, holdMinutes);
      return ids.map((id) => ({ bedspaceId: id as string }));
    }

    const units = await tx.select().from(accommodationUnits).where(eq(accommodationUnits.categoryId, category.id));
    const unitIds = units.map((u) => u.id);
    const candidateRooms = unitIds.length ? await tx.select().from(rooms).where(inArray(rooms.unitId, unitIds)) : [];
    const roomIds = candidateRooms.filter((r) => r.status === "ACTIVE").map((r) => r.id);
    const holdIds = await autoHoldBedspaces(tx, roomIds, occupantCount, holdMinutes);
    const heldRows = await tx.select().from(inventoryHolds).where(inArray(inventoryHolds.id, holdIds));
    return heldRows.map((h) => ({ bedspaceId: h.bedspaceId! }));
  }

  // PRIVATE, whole-unit only (see the scope note on createBooking).
  if (input.unitId) {
    if (!category.customerSelectsRoom) throw new Error("This category does not let customers choose a specific unit.");
    const [unit] = await tx
      .select({ id: accommodationUnits.id })
      .from(accommodationUnits)
      .where(and(eq(accommodationUnits.id, input.unitId), eq(accommodationUnits.categoryId, category.id)))
      .limit(1);
    if (!unit) throw new Error("That unit is not part of this accommodation category.");
    await holdUnit(tx, input.unitId, holdMinutes);
    return input.occupants.map(() => ({ unitId: input.unitId }));
  }

  const units = await tx.select().from(accommodationUnits).where(eq(accommodationUnits.categoryId, category.id));
  const { unitId } = await autoHoldUnit(
    tx,
    units.map((u) => u.id),
    holdMinutes,
  );
  return input.occupants.map(() => ({ unitId }));
}

export { InventoryUnavailableError };
