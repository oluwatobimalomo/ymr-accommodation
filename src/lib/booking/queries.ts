import { and, eq, gt, inArray, min, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  accommodationCategories,
  accommodationUnits,
  bedspaces,
  bookingOccupants,
  bookings,
  bookingOrders,
  facilities,
  inventoryHolds,
  lodges,
  rooms,
  unitFacilities,
  unitOverviewFacilities,
} from "@/db/schema";

function coordinatorValue(value: string | null | undefined, lodgeName: string | null | undefined) {
  const text = value?.trim() ?? "";
  const lodge = lodgeName?.trim() ?? "";
  if (!text || !lodge || !text.toLowerCase().startsWith(lodge.toLowerCase())) return text;
  return text.slice(lodge.length).replace(/^\s*[:|–—-]\s*/, "").trim();
}

export async function listActiveLodges() {
  const db = getDb();
  const activeLodges = await db.select({
    id: lodges.id, name: lodges.name, slug: lodges.slug, description: lodges.description, address: lodges.address,
    mainImage: sql<string | null>`${lodges.images}[1]`,
    images: lodges.images,
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
  const [row] = await getDb().select({ id: lodges.id, name: lodges.name, slug: lodges.slug, status: lodges.status, description: lodges.description, address: lodges.address, images: lodges.images }).from(lodges).where(eq(lodges.slug, slug)).limit(1);
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
    ? await db.select({ unitId: accommodationUnits.id, categoryId: accommodationUnits.categoryId, images: accommodationUnits.images, bedSpecifications: accommodationUnits.bedSpecifications, bedTypes: accommodationUnits.bedTypes, bedSizes: accommodationUnits.bedSizes }).from(accommodationUnits).where(and(inArray(accommodationUnits.categoryId, categoryIds), eq(accommodationUnits.status, "ACTIVE")))
    : [];
  const unitIds = unitRows.map((unit) => unit.unitId);
  const [facilityRows, overviewRows] = await Promise.all([
    unitIds.length ? db.select({ unitId: unitFacilities.unitId, name: facilities.name }).from(unitFacilities).innerJoin(facilities, eq(facilities.id, unitFacilities.facilityId)).where(inArray(unitFacilities.unitId, unitIds)) : [],
    unitIds.length ? db.select({ unitId: unitOverviewFacilities.unitId, name: facilities.name }).from(unitOverviewFacilities).innerJoin(facilities, eq(facilities.id, unitOverviewFacilities.facilityId)).where(inArray(unitOverviewFacilities.unitId, unitIds)) : [],
  ]);
  const unitByCategory = new Map<string, { image: string | null; images: string[]; bedSpecifications: string[]; bedTypes: string[]; bedSizes: string[]; facilities: string[]; overviewFacilities: string[] }>();
  for (const unit of unitRows) {
    const current = unitByCategory.get(unit.categoryId) ?? { image: unit.images[0] ?? null, images: [], bedSpecifications: [], bedTypes: [], bedSizes: [], facilities: [], overviewFacilities: [] };
    current.images.push(...unit.images);
    current.bedSpecifications.push(...unit.bedSpecifications);
    current.bedTypes.push(...unit.bedTypes);
    current.bedSizes.push(...unit.bedSizes);
    unitByCategory.set(unit.categoryId, current);
  }
  for (const [rows, field] of [[facilityRows, "facilities"], [overviewRows, "overviewFacilities"]] as const) {
    for (const facility of rows) {
      if (facility.name.trim().toLowerCase() === "bed") continue;
      const unit = unitRows.find((row) => row.unitId === facility.unitId);
      const target = unit && unitByCategory.get(unit.categoryId);
      if (target && !target[field].includes(facility.name)) target[field].push(facility.name);
    }
  }
  const bedspaceRows = categoryIds.length ? await db.select({
    categoryId: accommodationUnits.categoryId,
    bedspaceId: bedspaces.id,
    bedspaceLetter: bedspaces.letter,
    bedspaceStatus: bedspaces.status,
    roomName: rooms.name,
    roomGender: rooms.genderRestriction,
  }).from(accommodationUnits).innerJoin(rooms, eq(rooms.unitId, accommodationUnits.id)).innerJoin(bedspaces, eq(bedspaces.roomId, rooms.id))
    .where(and(inArray(accommodationUnits.categoryId, categoryIds), eq(accommodationUnits.status, "ACTIVE"), eq(rooms.status, "ACTIVE"))) : [];
  const candidateBedspaceIds = bedspaceRows.map((bedspace) => bedspace.bedspaceId);
  const [paidAssignments, heldBedspaces] = await Promise.all([
    candidateBedspaceIds.length ? db.select({ bedspaceId: bookingOccupants.bedspaceId }).from(bookingOccupants).innerJoin(bookings, eq(bookings.id, bookingOccupants.bookingId))
      .where(and(inArray(bookingOccupants.bedspaceId, candidateBedspaceIds), eq(bookings.paymentStatus, "PAID"))) : [],
    candidateBedspaceIds.length ? db.select({ bedspaceId: inventoryHolds.bedspaceId }).from(inventoryHolds)
      .where(and(inArray(inventoryHolds.bedspaceId, candidateBedspaceIds), gt(inventoryHolds.expiresAt, new Date()))) : [],
  ]);
  const paidBedspaceIds = new Set(paidAssignments.map((row) => row.bedspaceId).filter((id): id is string => id !== null));
  const heldBedspaceIds = new Set(heldBedspaces.map((row) => row.bedspaceId).filter((id): id is string => id !== null));
  const bedspacesByCategory = new Map<string, Array<{ id: string; letter: string; roomName: string; genderRestriction: string; status: "AVAILABLE" | "OCCUPIED" | "HELD" | "BLOCKED" | "MAINTENANCE" | "RETIRED" }>>();
  for (const bedspace of bedspaceRows) {
    const status = bedspace.bedspaceStatus !== "AVAILABLE" ? bedspace.bedspaceStatus as "BLOCKED" | "MAINTENANCE" | "RETIRED"
      : paidBedspaceIds.has(bedspace.bedspaceId) ? "OCCUPIED"
        : heldBedspaceIds.has(bedspace.bedspaceId) ? "HELD" : "AVAILABLE";
    bedspacesByCategory.set(bedspace.categoryId, [...(bedspacesByCategory.get(bedspace.categoryId) ?? []), {
      id: bedspace.bedspaceId, letter: bedspace.bedspaceLetter, roomName: bedspace.roomName, genderRestriction: bedspace.roomGender, status,
    }]);
  }

  // Each category maps to (usually) one apartment/unit in the simplified
  // admin model - use its real photo instead of a generic placeholder
  // repeated identically across every category card.
  return categoryRows.map((c) => ({
    ...c,
    image: unitByCategory.get(c.id)?.image ?? undefined,
    images: unitByCategory.get(c.id)?.images ?? [],
    bedSpecifications: unitByCategory.get(c.id)?.bedSpecifications ?? [],
    bedTypes: [...new Set(unitByCategory.get(c.id)?.bedTypes ?? [])],
    bedSizes: [...new Set(unitByCategory.get(c.id)?.bedSizes ?? [])],
    facilities: unitByCategory.get(c.id)?.facilities ?? [],
    overviewFacilities: unitByCategory.get(c.id)?.overviewFacilities ?? [],
    bedspaceOptions: bedspacesByCategory.get(c.id) ?? [],
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
  const [order] = await db.select().from(bookingOrders).where(eq(bookingOrders.reference, reference)).limit(1);
  if (order) {
    const orderBookings = await db.select().from(bookings).where(eq(bookings.checkoutOrderId, order.id)).orderBy(bookings.createdAt);
    if (!orderBookings.length) return null;
    const bookingIds = orderBookings.map((booking) => booking.id);
    const categoryIds = [...new Set(orderBookings.map((booking) => booking.categoryId))];
    const [occupants, stays] = await Promise.all([
      db.select().from(bookingOccupants).where(inArray(bookingOccupants.bookingId, bookingIds)),
      db.select({ categoryId: accommodationCategories.id, categoryName: accommodationCategories.name, lodgeName: lodges.name, coordinatorName: lodges.contactName, coordinatorPhone: lodges.contactPhone, checkInDate: accommodationCategories.checkInDate, checkOutDate: accommodationCategories.checkOutDate })
        .from(accommodationCategories).innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId)).where(inArray(accommodationCategories.id, categoryIds)),
    ]);
    const bedspaceIds = occupants.map((occupant) => occupant.bedspaceId).filter((id): id is string => id !== null);
    const bedspaceLabels = bedspaceIds.length ? await db.select({ id: bedspaces.id, letter: bedspaces.letter, roomName: rooms.name }).from(bedspaces).innerJoin(rooms, eq(rooms.id, bedspaces.roomId)).where(inArray(bedspaces.id, bedspaceIds)) : [];
    const first = orderBookings[0]!;
    const allPaid = orderBookings.every((booking) => booking.paymentStatus === "PAID");
    const anyCancelled = orderBookings.some((booking) => booking.paymentStatus === "CANCELLED");
    const uniqueValues = (items: string[]) => [...new Set(items.filter(Boolean))];
    const selectedStays = orderBookings.map((booking) => stays.find((stay) => stay.categoryId === booking.categoryId)).filter((stay) => stay !== undefined);
    const items = orderBookings.map((itemBooking, index) => {
      const stay = stays.find((candidate) => candidate.categoryId === itemBooking.categoryId);
      const itemOccupants = occupants.filter((occupant) => occupant.bookingId === itemBooking.id);
      return { reference: itemBooking.reference, lodgeName: stay?.lodgeName ?? "Accommodation", apartmentName: stay?.categoryName ?? "Assigned accommodation", amountMinor: itemBooking.amountMinor, checkInDate: stay?.checkInDate ?? null, checkOutDate: stay?.checkOutDate ?? null, coordinatorName: coordinatorValue(stay?.coordinatorName, stay?.lodgeName), coordinatorPhone: coordinatorValue(stay?.coordinatorPhone, stay?.lodgeName), occupants: itemOccupants.map((occupant) => ({ name: occupant.name, gender: occupant.gender, allocation: bedspaceLabels.find((bedspace) => bedspace.id === occupant.bedspaceId) ? `BDS ${bedspaceLabels.find((bedspace) => bedspace.id === occupant.bedspaceId)!.letter} · ${bedspaceLabels.find((bedspace) => bedspace.id === occupant.bedspaceId)!.roomName}` : "" })), sequence: index + 1 };
    });
    return {
      booking: {
        ...first,
        reference: order.reference,
        bookerName: order.bookerName,
        bookerPhone: order.bookerPhone,
        bookerEmail: order.bookerEmail,
        amountMinor: order.amountMinor,
        currency: order.currency,
        paymentStatus: allPaid ? "PAID" as const : anyCancelled ? "CANCELLED" as const : order.paymentStatus,
        occupantCount: occupants.length,
        accommodationStatus: allPaid && orderBookings.every((booking) => booking.accommodationStatus === "ALLOCATED") ? "ALLOCATED" as const : first.accommodationStatus,
        allocationStatus: allPaid && orderBookings.every((booking) => booking.allocationStatus === "FULLY_ALLOCATED") ? "FULLY_ALLOCATED" as const : first.allocationStatus,
      },
      occupants,
      items,
      isGift: Boolean(order.giftRecipientName),
      bookerEmail: order.bookerEmail,
      giftRecipient: order.giftRecipientName ? { name: order.giftRecipientName, phone: order.giftRecipientPhone ?? "", email: order.giftRecipientEmail ?? "" } : null,
      categoryName: uniqueValues(orderBookings.map((booking) => stays.find((stay) => stay.categoryId === booking.categoryId)?.categoryName ?? "")).join(", "),
      lodgeName: uniqueValues(selectedStays.map((stay) => stay.lodgeName)).join(", "),
      coordinatorName: uniqueValues(selectedStays.map((stay) => coordinatorValue(stay.coordinatorName, stay.lodgeName) || "Lodge coordinator")).join(" · "),
      coordinatorPhone: uniqueValues(selectedStays.map((stay) => coordinatorValue(stay.coordinatorPhone, stay.lodgeName))).join(" · "),
      checkInDate: selectedStays.length && selectedStays.every((stay) => stay.checkInDate === selectedStays[0]?.checkInDate) ? selectedStays[0]?.checkInDate ?? null : null,
      checkOutDate: selectedStays.length && selectedStays.every((stay) => stay.checkOutDate === selectedStays[0]?.checkOutDate) ? selectedStays[0]?.checkOutDate ?? null : null,
    };
  }
  const [booking] = await db.select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking) return null;
  const [occupants, [stay]] = await Promise.all([
    db.select().from(bookingOccupants).where(eq(bookingOccupants.bookingId, booking.id)),
    db.select({
      categoryName: accommodationCategories.name,
      lodgeName: lodges.name,
      coordinatorName: lodges.contactName,
      coordinatorPhone: lodges.contactPhone,
      checkInDate: accommodationCategories.checkInDate,
      checkOutDate: accommodationCategories.checkOutDate,
    })
      .from(accommodationCategories)
      .innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId))
      .where(eq(accommodationCategories.id, booking.categoryId))
      .limit(1),
  ]);
  const bedspaceIds = occupants.map((occupant) => occupant.bedspaceId).filter((id): id is string => id !== null);
  const bedspaceLabels = bedspaceIds.length ? await db.select({ id: bedspaces.id, letter: bedspaces.letter, roomName: rooms.name }).from(bedspaces).innerJoin(rooms, eq(rooms.id, bedspaces.roomId)).where(inArray(bedspaces.id, bedspaceIds)) : [];
  const item = { reference: booking.reference, lodgeName: stay?.lodgeName ?? "Accommodation", apartmentName: stay?.categoryName ?? "Assigned accommodation", amountMinor: booking.amountMinor, checkInDate: stay?.checkInDate ?? null, checkOutDate: stay?.checkOutDate ?? null, coordinatorName: coordinatorValue(stay?.coordinatorName, stay?.lodgeName), coordinatorPhone: coordinatorValue(stay?.coordinatorPhone, stay?.lodgeName), occupants: occupants.map((occupant) => ({ name: occupant.name, gender: occupant.gender, allocation: bedspaceLabels.find((bedspace) => bedspace.id === occupant.bedspaceId) ? `BDS ${bedspaceLabels.find((bedspace) => bedspace.id === occupant.bedspaceId)!.letter} · ${bedspaceLabels.find((bedspace) => bedspace.id === occupant.bedspaceId)!.roomName}` : "" })), sequence: 1 };
  return {
    booking,
    occupants,
    items: [item],
    isGift: occupants.some((occupant) => occupant.name.trim().toLowerCase() !== booking.bookerName.trim().toLowerCase() || (occupant.phone && occupant.phone.trim() !== booking.bookerPhone.trim()) || (occupant.email && occupant.email.trim().toLowerCase() !== booking.bookerEmail.trim().toLowerCase())),
    bookerEmail: booking.bookerEmail,
    giftRecipient: null,
    categoryName: stay?.categoryName,
    lodgeName: stay?.lodgeName,
    coordinatorName: coordinatorValue(stay?.coordinatorName, stay?.lodgeName),
    coordinatorPhone: coordinatorValue(stay?.coordinatorPhone, stay?.lodgeName),
    checkInDate: stay?.checkInDate ?? null,
    checkOutDate: stay?.checkOutDate ?? null,
  };
}
