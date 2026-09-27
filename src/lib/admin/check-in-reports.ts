import { and, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accommodationCategories, accommodationUnits, bedspaces, bookingOccupants, bookings, events, lodges, rooms } from "@/db/schema";
import { authorizeAnyAssignedLodge, type Actor } from "@/lib/authz/authorize";
import { getBookingOperationTimestamps } from "@/lib/booking/operation-audit";

const checkInStatuses = ["ALLOCATED", "CHECKED_IN", "CHECKED_OUT"] as const;
type CheckInStatus = (typeof checkInStatuses)[number];
const pageSize = 50;

function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : value;
}

export async function getCheckInReport(actor: Actor, filters: { event?: string; lodge?: string; status?: string; from?: string; to?: string; q?: string; page?: string } = {}) {
  authorizeAnyAssignedLodge(actor, "booking.read");
  const db = getDb();
  const isGlobal = actor.globalPermissions.has("booking.read");
  const permittedLodges = [...actor.lodgeIds];
  if (!isGlobal && !permittedLodges.length) return {
    events: [], lodges: [], rows: [], summary: { expected: 0, checkedIn: 0, checkedOut: 0, guests: 0 }, total: 0, page: 1, pageSize,
    filters: { event: "", lodge: "", status: "", from: "", to: "", q: "" },
  };

  const eventId = filters.event && /^[0-9a-f-]{36}$/i.test(filters.event) ? filters.event : undefined;
  const lodgeId = filters.lodge && /^[0-9a-f-]{36}$/i.test(filters.lodge) ? filters.lodge : undefined;
  const from = validDate(filters.from);
  const to = validDate(filters.to);
  const status = checkInStatuses.includes(filters.status as CheckInStatus) ? filters.status as CheckInStatus : undefined;
  const search = filters.q?.trim().slice(0, 100);
  const scopeConditions = [
    ...(isGlobal ? [] : [inArray(lodges.id, permittedLodges)]),
    ...(eventId ? [eq(events.id, eventId)] : []),
    ...(lodgeId && (isGlobal || permittedLodges.includes(lodgeId)) ? [eq(lodges.id, lodgeId)] : []),
    ...(from ? [gte(accommodationCategories.checkInDate, from)] : []),
    ...(to ? [lte(accommodationCategories.checkInDate, to)] : []),
  ];
  const eventScope = and(eq(lodges.status, "ACTIVE"), ...(isGlobal ? [] : [inArray(lodges.id, permittedLodges)]));
  const availableLodgeScope = and(eq(lodges.status, "ACTIVE"), ...(isGlobal ? [] : [inArray(lodges.id, permittedLodges)]), ...(eventId ? [eq(events.id, eventId)] : []));
  const baseConditions = [
    eq(bookings.paymentStatus, "PAID"),
    inArray(bookings.accommodationStatus, checkInStatuses),
    ...(scopeConditions.length ? [and(...scopeConditions)!] : []),
  ];
  const searchCondition = search
    ? or(
        ilike(bookingOccupants.name, `%${search.replace(/[\\%_]/g, "\\$&")}%`),
        ilike(bookings.reference, `%${search.replace(/[\\%_]/g, "\\$&")}%`),
        ilike(bookingOccupants.phone, `%${search.replace(/[\\%_]/g, "\\$&")}%`),
        ilike(bookingOccupants.email, `%${search.replace(/[\\%_]/g, "\\$&")}%`),
      )!
    : undefined;
  const summaryConditions = [...baseConditions, ...(searchCondition ? [searchCondition] : [])];
  const rowConditions = [...summaryConditions, ...(status ? [eq(bookings.accommodationStatus, status)] : [])];

  const [eventRows, lodgeRows, summaryRows, totalRows] = await Promise.all([
    db.selectDistinct({ id: events.id, name: events.name }).from(events)
      .innerJoin(lodges, eq(lodges.eventId, events.id)).where(eventScope).orderBy(events.name),
    db.selectDistinct({ id: lodges.id, name: lodges.name }).from(lodges)
      .innerJoin(events, eq(events.id, lodges.eventId)).where(availableLodgeScope).orderBy(lodges.name),
    db.select({
      status: bookings.accommodationStatus,
      count: count(),
    }).from(bookingOccupants)
      .innerJoin(bookings, eq(bookings.id, bookingOccupants.bookingId))
      .innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId))
      .innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId))
      .innerJoin(events, eq(events.id, bookings.eventId))
      .where(and(...summaryConditions)).groupBy(bookings.accommodationStatus),
    db.select({ count: count() }).from(bookingOccupants)
      .innerJoin(bookings, eq(bookings.id, bookingOccupants.bookingId))
      .innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId))
      .innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId))
      .innerJoin(events, eq(events.id, bookings.eventId))
      .where(and(...rowConditions)),
  ]);

  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1);
  const rows = await db.select({
    occupantId: bookingOccupants.id,
    occupantName: bookingOccupants.name,
    phone: bookingOccupants.phone,
    email: bookingOccupants.email,
    reference: bookings.reference,
    bookingId: bookings.id,
    bookingStatus: bookings.accommodationStatus,
    eventName: events.name,
    lodgeId: lodges.id,
    lodgeName: lodges.name,
    categoryName: accommodationCategories.name,
    expectedCheckIn: accommodationCategories.checkInDate,
    expectedCheckOut: accommodationCategories.checkOutDate,
    roomName: rooms.name,
    bedspaceLetter: bedspaces.letter,
    unitName: accommodationUnits.name,
  }).from(bookingOccupants)
    .innerJoin(bookings, eq(bookings.id, bookingOccupants.bookingId))
    .innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId))
    .innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId))
    .innerJoin(events, eq(events.id, bookings.eventId))
    .leftJoin(bedspaces, eq(bedspaces.id, bookingOccupants.bedspaceId))
    .leftJoin(rooms, or(eq(rooms.id, bedspaces.roomId), eq(rooms.id, bookingOccupants.roomId)))
    .leftJoin(accommodationUnits, or(eq(accommodationUnits.id, bookingOccupants.unitId), eq(accommodationUnits.id, rooms.unitId)))
    .where(and(...rowConditions))
    .orderBy(accommodationCategories.checkInDate, desc(bookings.createdAt), bookingOccupants.name)
    .limit(pageSize).offset((page - 1) * pageSize);

  const bookingIds = [...new Set(rows.map((row) => row.bookingId))];
  const timestamps = await getBookingOperationTimestamps(bookingIds);

  const counts = Object.fromEntries(checkInStatuses.map((value) => [value, Number(summaryRows.find((row) => row.status === value)?.count ?? 0)])) as Record<CheckInStatus, number>;
  return {
    events: eventRows,
    lodges: lodgeRows,
    rows: rows.map((row) => ({
      ...row,
      roomLabel: row.roomName ? `${row.roomName}${row.bedspaceLetter ? ` · Bedspace ${row.bedspaceLetter}` : ""}` : row.unitName ?? "Not allocated",
      timestamps: timestamps.get(row.bookingId) ?? { checkedInAt: null, checkedOutAt: null },
    })),
    summary: { expected: counts.ALLOCATED, checkedIn: counts.CHECKED_IN, checkedOut: counts.CHECKED_OUT, guests: Object.values(counts).reduce((sum, value) => sum + value, 0) },
    total: Number(totalRows[0]?.count ?? 0),
    page,
    pageSize,
    filters: { event: eventId ?? "", lodge: lodgeId ?? "", status: status ?? "", from: from ?? "", to: to ?? "", q: search ?? "" },
  };
}
