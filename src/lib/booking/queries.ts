import { and, eq, gt, inArray, min, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  accommodationCategories,
  accommodationUnits,
  bedspaces,
  bookingOccupants,
  bookings,
  facilities,
  inventoryHolds,
  lodges,
  rooms,
  unitFacilities,
} from "@/db/schema";

export async function listActiveLodges() {
  const db = getDb();
  const activeLodges = await db.select({
    id: lodges.id, name: lodges.name, slug: lodges.slug, description: lodges.description, address: lodges.address,
    mainImage: sql<string | null>`${lodges.images}[1]`,
  }).from(lodges).where(eq(lodges.status, "ACTIVE")).orderBy(lodges.name);
  if (activeLodges.length === 0) return [];

  const prices = await db
    .select({ lodgeId: accommodationCategories.lodgeId, minimumPriceMinor: min(accommodationCategories.defaultPriceMinor) })
    .from(accommodationCategories)
    .where(and(inArray(accommodationCategories.lodgeId, activeLodges.map((lodge) => lodge.id)), eq(accommodationCategories.status, "ACTIVE")))
    .groupBy(accommodationCategories.lodgeId);
  const minimumByLodge = new Map(prices.map((price) => [price.lodgeId, price.minimumPriceMinor]));
  return activeLodges.map((lodge) => ({ ...lodge, minimumPriceMinor: minimumByLodge.get(lodge.id) ?? null }));
}

export async function getLodgeBySlug(slug: string) {
  const [row] = await getDb().select({ id: lodges.id, name: lodges.name, slug: lodges.slug, status: lodges.status, description: lodges.description, address: lodges.address }).from(lodges).where(eq(lodges.slug, slug)).limit(1);
  return row && row.status === "ACTIVE" ? row : null;
}

export async function listActiveCategoriesForLodge(lodgeId: string) {
  const db = getDb();
  const categoryRows = await db
    .select()
    .from(accommodationCategories)
    .where(and(eq(accommodationCategories.lodgeId, lodgeId), eq(accommodationCategories.status, "ACTIVE")))
    .orderBy(accommodationCategories.name)
    .then((rows) => rows.filter((r) => r.status === "ACTIVE"));

  const categoryIds = categoryRows.map((c) => c.id);
  const unitRows = categoryIds.length
    ? await db.select({ categoryId: accommodationUnits.categoryId, image: sql<string | null>`${accommodationUnits.images}[1]`, bedSpecifications: accommodationUnits.bedSpecifications, facilityName: facilities.name }).from(accommodationUnits).leftJoin(unitFacilities, eq(unitFacilities.unitId, accommodationUnits.id)).leftJoin(facilities, eq(facilities.id, unitFacilities.facilityId)).where(inArray(accommodationUnits.categoryId, categoryIds))
    : [];
  const unitByCategory = new Map<string, { image: string | null; bedSpecifications: string[]; facilities: string[] }>();
  for (const unit of unitRows) {
    const current = unitByCategory.get(unit.categoryId) ?? { image: unit.image, bedSpecifications: unit.bedSpecifications, facilities: [] };
    if (unit.facilityName && !current.facilities.includes(unit.facilityName)) current.facilities.push(unit.facilityName);
    unitByCategory.set(unit.categoryId, current);
  }

  // Each category maps to (usually) one apartment/unit in the simplified
  // admin model - use its real photo instead of a generic placeholder
  // repeated identically across every category card.
  return categoryRows.map((c) => ({
    ...c,
    image: unitByCategory.get(c.id)?.image ?? undefined,
    bedSpecifications: unitByCategory.get(c.id)?.bedSpecifications ?? [],
    facilities: unitByCategory.get(c.id)?.facilities ?? [],
  }));
}

export async function getCategoryForBooking(categoryId: string) {
  const [category] = await getDb()
    .select()
    .from(accommodationCategories)
    .where(eq(accommodationCategories.id, categoryId))
    .limit(1);
  if (!category || category.status !== "ACTIVE") return null;

  const db = getDb();
  // These reads are independent once we have the category. Run them together
  // so opening a booking page does not wait for a second database round trip.
  const [[lodge], units] = await Promise.all([
    db.select({ id: lodges.id, name: lodges.name, slug: lodges.slug, status: lodges.status }).from(lodges).where(eq(lodges.id, category.lodgeId)).limit(1),
    db.select({ id: accommodationUnits.id }).from(accommodationUnits).where(and(eq(accommodationUnits.categoryId, categoryId), eq(accommodationUnits.status, "ACTIVE"))),
  ]);
  if (!lodge || lodge.status !== "ACTIVE") return null;
  const unitIds = units.map((u) => u.id);
  const allRooms = unitIds.length
    ? await db.select().from(rooms).where(and(inArray(rooms.unitId, unitIds), eq(rooms.status, "ACTIVE")))
    : [];
  const roomIds = allRooms.map((r) => r.id);
  const allBedspaces = roomIds.length
    ? await db.select().from(bedspaces).where(inArray(bedspaces.roomId, roomIds))
    : [];

  // The bedspaces.status column describes maintenance/admin state only. A
  // booking does not change it, so derive customer-facing availability from
  // the durable occupant assignment and any unexpired checkout hold.
  const bedspaceIds = allBedspaces.map((b) => b.id);
  const assigned = bedspaceIds.length
    ? await db
        .select({ bedspaceId: bookingOccupants.bedspaceId, paymentStatus: bookings.paymentStatus })
        .from(bookingOccupants)
        .innerJoin(bookings, eq(bookings.id, bookingOccupants.bookingId))
        .where(inArray(bookingOccupants.bedspaceId, bedspaceIds))
    : [];
  const paidBedspaces = new Set(
    assigned.filter((row) => row.paymentStatus === "PAID").map((row) => row.bedspaceId!),
  );
  const activeHolds = bedspaceIds.length
    ? await db
        .select({ bedspaceId: inventoryHolds.bedspaceId })
        .from(inventoryHolds)
        .where(and(inArray(inventoryHolds.bedspaceId, bedspaceIds), gt(inventoryHolds.expiresAt, new Date())))
    : [];
  const heldBedspaces = new Set(activeHolds.map((row) => row.bedspaceId!));

  return {
    category,
    lodge,
    rooms: allRooms.map((r) => ({
      ...r,
      bedspaces: allBedspaces
        .filter((b) => b.roomId === r.id)
        .map((b) => ({
          ...b,
          status: b.status !== "AVAILABLE"
            ? b.status
            : paidBedspaces.has(b.id)
              ? "OCCUPIED" as const
              : heldBedspaces.has(b.id)
                ? "HELD" as const
                : "AVAILABLE" as const,
        })),
    })),
  };
}

export async function getBookingByReference(reference: string) {
  const db = getDb();
  const [booking] = await db.select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking) return null;
  const [occupants, [stay]] = await Promise.all([
    db.select().from(bookingOccupants).where(eq(bookingOccupants.bookingId, booking.id)),
    db.select({
      categoryName: accommodationCategories.name,
      lodgeName: lodges.name,
      checkInDate: accommodationCategories.checkInDate,
      checkOutDate: accommodationCategories.checkOutDate,
    })
      .from(accommodationCategories)
      .innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId))
      .where(eq(accommodationCategories.id, booking.categoryId))
      .limit(1),
  ]);
  return {
    booking,
    occupants,
    categoryName: stay?.categoryName,
    lodgeName: stay?.lodgeName,
    checkInDate: stay?.checkInDate ?? null,
    checkOutDate: stay?.checkOutDate ?? null,
  };
}
