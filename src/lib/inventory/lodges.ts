import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, lodges } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { authorize, type Actor } from "@/lib/authz/authorize";

export interface CreateLodgeInput {
  eventId: string;
  name: string;
  slug: string;
  description?: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
  images?: string[];
}

/** Slug must be URL-safe: lowercase letters, digits and hyphens only. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

export async function createLodge(actor: Actor, input: CreateLodgeInput) {
  authorize(actor, "inventory.write");
  if (!isValidSlug(input.slug)) throw new Error("Slug must be lowercase letters, numbers and hyphens only.");

  const db = getDb();
  return db.transaction(async (tx) => {
    const [event] = await tx.select().from(events).where(eq(events.id, input.eventId)).limit(1);
    if (!event) throw new Error("That event could not be found.");

    const [lodge] = await tx
      .insert(lodges)
      .values({
        eventId: input.eventId,
        name: input.name,
        slug: input.slug,
        description: input.description ?? "",
        address: input.address ?? "",
        contactName: input.contactName ?? "",
        contactPhone: input.contactPhone ?? "",
        images: input.images ?? [],
      })
      .returning();
    if (!lodge) throw new Error("Could not create the lodge.");

    await recordAudit(tx, {
      actor,
      action: "inventory.lodge_created",
      entityType: "lodge",
      entityId: lodge.id,
      after: lodge,
    });
    return lodge;
  });
}

export interface UpdateLodgeInput {
  name?: string;
  description?: string;
  address?: string;
  proximityKm?: string | null;
  contactName?: string;
  contactPhone?: string;
  images?: string[];
}

export async function updateLodge(actor: Actor, lodgeId: string, input: UpdateLodgeInput) {
  authorize(actor, "inventory.write");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(lodges).where(eq(lodges.id, lodgeId)).limit(1);
    if (!before) throw new Error("That lodge could not be found.");

    const [after] = await tx
      .update(lodges)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(lodges.id, lodgeId))
      .returning();

    await recordAudit(tx, {
      actor,
      action: "inventory.lodge_updated",
      entityType: "lodge",
      entityId: lodgeId,
      before,
      after,
    });
    return after;
  });
}

/**
 * Lodges are never hard-deleted (historical bookings may reference them via
 * category > unit). Deactivating hides a lodge from new bookings without
 * touching anything it's already tied to.
 */
export async function setLodgeStatus(
  actor: Actor,
  lodgeId: string,
  status: "ACTIVE" | "INACTIVE",
  reason?: string,
) {
  authorize(actor, "inventory.write");

  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(lodges).where(eq(lodges.id, lodgeId)).limit(1);
    if (!before) throw new Error("That lodge could not be found.");

    const [after] = await tx
      .update(lodges)
      .set({ status, updatedAt: new Date() })
      .where(eq(lodges.id, lodgeId))
      .returning();

    await recordAudit(tx, {
      actor,
      action: status === "ACTIVE" ? "inventory.lodge_activated" : "inventory.lodge_deactivated",
      entityType: "lodge",
      entityId: lodgeId,
      before,
      after,
      reason,
    });
    return after;
  });
}

export async function listLodges() {
  return getDb().select().from(lodges).orderBy(lodges.name);
}

export async function getLodge(lodgeId: string) {
  const [row] = await getDb().select().from(lodges).where(eq(lodges.id, lodgeId)).limit(1);
  return row ?? null;
}
