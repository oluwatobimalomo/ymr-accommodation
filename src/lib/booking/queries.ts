import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  accommodationCategories,
  accommodationUnits,
  bedspaces,
  bookingOccupants,
  bookings,
  lodges,
  rooms,
} from "@/db/schema";

export async function listActiveLodges() {
  return getDb().select().from(lodges).where(eq(lodges.status, "ACTIVE")).orderBy(lodges.name);
}

export async function getLodgeBySlug(slug: string) {
  const [row] = await getDb().select().from(lodges).where(eq(lodges.slug, slug)).limit(1);
  return row && row.status === "ACTIVE" ? row : null;
}

export async function listActiveCategoriesForLodge(lodgeId: string) {
  const db = getDb();
  const categoryRows = await db
    .select()
    .from(accommodationCategories)
    .where(eq(accommodationCategories.lodgeId, lodgeId))
    .orderBy(accommodationCategories.name)
    .then((rows) => rows.filter((r) => r.status === "ACTIVE"));

  const categoryIds = categoryRows.map((c) => c.id);
  const unitRows = categoryIds.length
    ? (await db.select().from(accommodationUnits)).filter((u) => categoryIds.includes(u.categoryId))
    : [];

  // Each category maps to (usually) one apartment/unit in the simplified
  // admin model - use its real photo instead of a generic placeholder
  // repeated identically across every category card.
  return categoryRows.map((c) => ({
    ...c,
    image: unitRows.find((u) => u.categoryId === c.id)?.images[0],
  }));
}

export async function getCategoryForBooking(categoryId: string) {
  const [category] = await getDb()
    .select()
    .from(accommodationCategories)
    .where(eq(accommodationCategories.id, categoryId))
    .limit(1);
  if (!category || category.status !== "ACTIVE") return null;

  const [lodge] = await getDb().select().from(lodges).where(eq(lodges.id, category.lodgeId)).limit(1);
  if (!lodge || lodge.status !== "ACTIVE") return null;

  const units = await getDb()
    .select()
    .from(accommodationUnits)
    .where(eq(accommodationUnits.categoryId, categoryId))
    .then((rows) => rows.filter((u) => u.status === "ACTIVE"));

  const unitIds = units.map((u) => u.id);
  const allRooms = unitIds.length
    ? (await getDb().select().from(rooms)).filter((r) => unitIds.includes(r.unitId) && r.status === "ACTIVE")
    : [];
  const roomIds = allRooms.map((r) => r.id);
  const allBedspaces = roomIds.length
    ? (await getDb().select().from(bedspaces)).filter((b) => roomIds.includes(b.roomId))
    : [];

  return {
    category,
    lodge,
    units,
    rooms: allRooms.map((r) => ({ ...r, bedspaces: allBedspaces.filter((b) => b.roomId === r.id) })),
  };
}

export async function getBookingByReference(reference: string) {
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking) return null;
  const occupants = await getDb().select().from(bookingOccupants).where(eq(bookingOccupants.bookingId, booking.id));
  const [category] = await getDb()
    .select()
    .from(accommodationCategories)
    .where(eq(accommodationCategories.id, booking.categoryId))
    .limit(1);
  const lodge = category ? await getDb().select().from(lodges).where(eq(lodges.id, category.lodgeId)).limit(1) : [];
  return { booking, occupants, categoryName: category?.name, lodgeName: lodge[0]?.name };
}
