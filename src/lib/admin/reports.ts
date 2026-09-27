import { and, count, desc, eq, gte, inArray, lt, sql, sum } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accommodationCategories, bookings, events, lodges } from "@/db/schema";
import type { Actor } from "@/lib/authz/authorize";

export interface BookingReportFilters { from?: string; to?: string; eventId?: string; status?: string; page?: string; all?: boolean; }
function validDate(value?: string) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : undefined; }

export async function getBookingReport(actor: Actor, filters: BookingReportFilters = {}) {
  const db = getDb();
  const from = validDate(filters.from), to = validDate(filters.to);
  const conditions = [];
  if (from) conditions.push(gte(bookings.createdAt, new Date(`${from}T00:00:00.000Z`)));
  if (to) { const until = new Date(`${to}T00:00:00.000Z`); until.setUTCDate(until.getUTCDate() + 1); conditions.push(lt(bookings.createdAt, until)); }
  if (filters.eventId && /^[0-9a-f-]{36}$/i.test(filters.eventId)) conditions.push(eq(bookings.eventId, filters.eventId));
  if (["PENDING", "PAID", "FAILED", "REFUNDED", "CANCELLED"].includes(filters.status ?? "")) conditions.push(eq(bookings.paymentStatus, filters.status as never));
  if (!actor.globalPermissions.has("reports.read")) {
    const allowed = [...actor.lodgeIds];
    if (!allowed.length) return { events: [], rows: [], page: 1, pageSize: 25, totalRows: 0, daily: [], summary: { bookings: 0, paid: 0, pending: 0, cancelled: 0, paidAmountMinor: 0, guests: 0 } };
    conditions.push(inArray(lodges.id, allowed));
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const pageSize = filters.all ? 10000 : 25;
  const page = filters.all ? 1 : Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1);
  const base = db.select({ id: bookings.id, reference: bookings.reference, createdAt: bookings.createdAt, eventId: bookings.eventId, eventName: events.name, lodgeId: lodges.id, lodgeName: lodges.name, categoryName: accommodationCategories.name, bookerName: bookings.bookerName, bookerPhone: bookings.bookerPhone, bookerEmail: bookings.bookerEmail, amountMinor: bookings.amountMinor, currency: bookings.currency, paymentStatus: bookings.paymentStatus, accommodationStatus: bookings.accommodationStatus, allocationStatus: bookings.allocationStatus, occupantCount: bookings.occupantCount })
    .from(bookings).innerJoin(events, eq(events.id, bookings.eventId)).innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId)).innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId));
  const [eventRows, rows, [aggregate], daily] = await Promise.all([
    db.select({ id: events.id, name: events.name }).from(events).orderBy(desc(events.year)),
    base.where(where).orderBy(desc(bookings.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ bookings: count(), paid: sql<number>`count(*) filter (where ${bookings.paymentStatus} = 'PAID')`.mapWith(Number), pending: sql<number>`count(*) filter (where ${bookings.paymentStatus} = 'PENDING')`.mapWith(Number), cancelled: sql<number>`count(*) filter (where ${bookings.accommodationStatus} = 'CANCELLED' or ${bookings.paymentStatus} = 'CANCELLED')`.mapWith(Number), paidAmountMinor: sum(sql`case when ${bookings.paymentStatus} = 'PAID' then ${bookings.amountMinor} else 0 end`).mapWith(Number), guests: sum(bookings.occupantCount).mapWith(Number) }).from(bookings).innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId)).innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId)).where(where),
    db.select({ date: sql<string>`to_char(date_trunc('day', ${bookings.createdAt}), 'YYYY-MM-DD')`, amountMinor: sum(sql`case when ${bookings.paymentStatus} = 'PAID' then ${bookings.amountMinor} else 0 end`).mapWith(Number), count: count() }).from(bookings).innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId)).innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId)).where(where).groupBy(sql`date_trunc('day', ${bookings.createdAt})`).orderBy(sql`date_trunc('day', ${bookings.createdAt}) desc`).limit(30),
  ]);
  const totalRows = Number(aggregate?.bookings ?? 0);
  return { events: eventRows, rows, page, pageSize, totalRows, daily: daily.reverse(), summary: { bookings: totalRows, paid: Number(aggregate?.paid ?? 0), pending: Number(aggregate?.pending ?? 0), cancelled: Number(aggregate?.cancelled ?? 0), paidAmountMinor: Number(aggregate?.paidAmountMinor ?? 0), guests: Number(aggregate?.guests ?? 0) } };
}

export function csvCell(value: string | number | Date | null | undefined) {
  let text = value instanceof Date ? value.toISOString() : String(value ?? "");
  if (/^[\s]*[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
