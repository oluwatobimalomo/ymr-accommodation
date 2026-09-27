import { and, count, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accommodationCategories, accommodationUnits, bedspaces, bookingOccupants, bookings, keyCustody, lodges, rooms } from "@/db/schema";
import { authorizeAnyAssignedLodge, type Actor } from "@/lib/authz/authorize";

const statuses = ["UNALLOCATED", "ALLOCATED", "CHECKED_IN", "CHECKED_OUT"] as const;
type OperationsStatus = (typeof statuses)[number];

export async function getOperationsOverview(actor: Actor, filters: { q?: string; status?: string; lodge?: string; page?: string } = {}) {
  authorizeAnyAssignedLodge(actor, "booking.read");
  const db = getDb();
  const isGlobal = actor.globalPermissions.has("booking.read");
  const permittedLodges = [...actor.lodgeIds];
  if (!isGlobal && permittedLodges.length === 0) return { rows: [], totals: Object.fromEntries(statuses.map((status) => [status, 0])) as Record<OperationsStatus, number>, lodges: [], page: 1, pageSize: 50, total: 0 };

  const scopeConditions = [];
  if (!isGlobal) scopeConditions.push(inArray(lodges.id, permittedLodges));
  if (filters.lodge && (isGlobal || permittedLodges.includes(filters.lodge))) scopeConditions.push(eq(lodges.id, filters.lodge));
  const scope = scopeConditions.length ? and(...scopeConditions) : undefined;
  const visibleLodges = await db.select({ id: lodges.id, name: lodges.name }).from(lodges).where(scope).orderBy(lodges.name);
  const status = statuses.includes(filters.status as OperationsStatus) ? filters.status as OperationsStatus : undefined;
  const search = filters.q?.trim().slice(0, 100);
  const conditions = [eq(bookings.paymentStatus, "PAID"), ne(bookings.accommodationStatus, "CANCELLED"), ...(scope ? [scope] : [])];
  if (status) conditions.push(eq(bookings.accommodationStatus, status));
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(or(ilike(bookingOccupants.name, pattern), ilike(bookings.reference, pattern), ilike(bookings.bookerPhone, pattern), ilike(bookings.bookerEmail, pattern))!);
  }

  const [summary, matchingCount] = await Promise.all([
    db.select({ status: bookings.accommodationStatus, count: count() }).from(bookingOccupants)
      .innerJoin(bookings, eq(bookings.id, bookingOccupants.bookingId))
      .innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId))
      .innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId))
      .where(and(eq(bookings.paymentStatus, "PAID"), ne(bookings.accommodationStatus, "CANCELLED"), ...(scope ? [scope] : [])))
      .groupBy(bookings.accommodationStatus),
    db.select({ count: count() }).from(bookingOccupants)
      .innerJoin(bookings, eq(bookings.id, bookingOccupants.bookingId))
      .innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId))
      .innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId))
      .where(and(...conditions)),
  ]);
  const totals = Object.fromEntries(statuses.map((value) => [value, Number(summary.find((item) => item.status === value)?.count ?? 0)])) as Record<OperationsStatus, number>;
  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1);
  const pageSize = 50;
  const rows = await db.select({
    occupantId: bookingOccupants.id,
    occupantName: bookingOccupants.name,
    occupantPhone: bookingOccupants.phone,
    occupantEmail: bookingOccupants.email,
    gender: bookingOccupants.gender,
    reference: bookings.reference,
    bookingId: bookings.id,
    paymentStatus: bookings.paymentStatus,
    accommodationStatus: bookings.accommodationStatus,
    createdAt: bookings.createdAt,
    lodgeId: lodges.id,
    lodgeName: lodges.name,
    categoryName: accommodationCategories.name,
    roomName: rooms.name,
    bedspaceLetter: bedspaces.letter,
    unitName: accommodationUnits.name,
    checkInDate: accommodationCategories.checkInDate,
    checkOutDate: accommodationCategories.checkOutDate,
    keyLabel: keyCustody.keyLabel,
  }).from(bookingOccupants)
    .innerJoin(bookings, eq(bookings.id, bookingOccupants.bookingId))
    .innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId))
    .innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId))
    .leftJoin(bedspaces, eq(bedspaces.id, bookingOccupants.bedspaceId))
    .leftJoin(rooms, or(eq(rooms.id, bedspaces.roomId), eq(rooms.id, bookingOccupants.roomId)))
    .leftJoin(accommodationUnits, or(eq(accommodationUnits.id, bookingOccupants.unitId), eq(accommodationUnits.id, rooms.unitId)))
    .leftJoin(keyCustody, and(eq(keyCustody.occupantId, bookingOccupants.id), eq(keyCustody.status, "ISSUED")))
    .where(and(...conditions))
    .orderBy(desc(bookings.createdAt), bookingOccupants.name)
    .limit(pageSize).offset((page - 1) * pageSize);

  return { rows, totals, lodges: visibleLodges, page, pageSize, total: Number(matchingCount[0]?.count ?? 0) };
}
