import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accommodationCategories, lodges } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { authorize, type Actor } from "@/lib/authz/authorize";

export interface CreateCategoryInput {
  lodgeId: string;
  name: string;
  mode: "PRIVATE" | "SHARED";
  genderRestriction?: "ANY" | "MALE" | "FEMALE";
  pricingModel: "PER_UNIT" | "PER_PERSON";
  defaultPriceMinor: number;
  description?: string;
  customerSelectsRoom?: boolean;
  customerSelectsBedspace?: boolean;
  allowEntireRoomBooking?: boolean;
}

export async function createCategory(actor: Actor, input: CreateCategoryInput) {
  authorize(actor, "inventory.write");
  if (input.defaultPriceMinor < 0 || !Number.isInteger(input.defaultPriceMinor)) {
    throw new Error("Price must be a whole number of kobo, 0 or more.");
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const [lodge] = await tx.select().from(lodges).where(eq(lodges.id, input.lodgeId)).limit(1);
    if (!lodge) throw new Error("That lodge could not be found.");

    const [category] = await tx
      .insert(accommodationCategories)
      .values({
        lodgeId: input.lodgeId,
        name: input.name,
        mode: input.mode,
        genderRestriction: input.genderRestriction ?? "ANY",
        pricingModel: input.pricingModel,
        defaultPriceMinor: input.defaultPriceMinor,
        description: input.description ?? "",
        customerSelectsRoom: input.customerSelectsRoom ?? true,
        customerSelectsBedspace: input.customerSelectsBedspace ?? true,
        allowEntireRoomBooking: input.allowEntireRoomBooking ?? false,
      })
      .returning();
    if (!category) throw new Error("Could not create the category.");

    await recordAudit(tx, {
      actor,
      action: "inventory.category_created",
      entityType: "accommodation_category",
      entityId: category.id,
      after: category,
    });
    return category;
  });
}

export interface UpdatePricingInput {
  pricingModel?: "PER_UNIT" | "PER_PERSON";
  defaultPriceMinor?: number;
}

/** Pricing changes are their own function because they need `pricing.write`, a narrower permission than general inventory edits. */
export async function updateCategoryPricing(
  actor: Actor,
  categoryId: string,
  input: UpdatePricingInput,
  reason?: string,
) {
  authorize(actor, "pricing.write");
  if (input.defaultPriceMinor !== undefined && (input.defaultPriceMinor < 0 || !Number.isInteger(input.defaultPriceMinor))) {
    throw new Error("Price must be a whole number of kobo, 0 or more.");
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(accommodationCategories)
      .where(eq(accommodationCategories.id, categoryId))
      .limit(1);
    if (!before) throw new Error("That category could not be found.");

    const [after] = await tx
      .update(accommodationCategories)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(accommodationCategories.id, categoryId))
      .returning();

    await recordAudit(tx, {
      actor,
      action: "inventory.category_pricing_changed",
      entityType: "accommodation_category",
      entityId: categoryId,
      before,
      after,
      reason,
    });
    return after;
  });
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string;
  customerSelectsRoom?: boolean;
  customerSelectsBedspace?: boolean;
  allowEntireRoomBooking?: boolean;
  status?: "ACTIVE" | "INACTIVE";
}

export async function updateCategory(actor: Actor, categoryId: string, input: UpdateCategoryInput) {
  authorize(actor, "inventory.write");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(accommodationCategories)
      .where(eq(accommodationCategories.id, categoryId))
      .limit(1);
    if (!before) throw new Error("That category could not be found.");

    const [after] = await tx
      .update(accommodationCategories)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(accommodationCategories.id, categoryId))
      .returning();

    await recordAudit(tx, {
      actor,
      action: "inventory.category_updated",
      entityType: "accommodation_category",
      entityId: categoryId,
      before,
      after,
    });
    return after;
  });
}

export async function listCategoriesForLodge(lodgeId: string) {
  return getDb()
    .select()
    .from(accommodationCategories)
    .where(eq(accommodationCategories.lodgeId, lodgeId))
    .orderBy(accommodationCategories.name);
}

export async function getCategory(categoryId: string) {
  const [row] = await getDb()
    .select()
    .from(accommodationCategories)
    .where(eq(accommodationCategories.id, categoryId))
    .limit(1);
  return row ?? null;
}
