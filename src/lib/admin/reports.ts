import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accommodationCategories, bookingOccupants, bookings, events, lodges } from "@/db/schema";
import type { Actor } from "@/lib/authz/authorize";
import { can } from "@/lib/authz/authorize";

export interface BookingReportFilters { from?: string; to?: string; eventId?: string; }

function validDate(value?: string) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : undefined; }

export async function getBookingReport(actor: Actor, filters: BookingReportFilters = {}) {
  const db = getDb();
  const from = validDate(filters.from);
  const to = validDate(filters.to);
  const conditions = [];
  if (from) conditions.push(gte(bookings.createdAt, new Date(`${from}T00:00:00.000Z`)));
  if (to) { const until = new Date(`${to}T00:00:00.000Z`); until.setUTCDate(until.getUTCDate() + 1); conditions.push(lt(bookings.createdAt, until)); }
  if (filters.eventId && /^[0-9a-f-]{36}$/i.test(filters.eventId)) conditions.push(eq(bookings.eventId, filters.eventId));
  const [eventRows, rawRows] = await Promise.all([
    db.select({ id: events.id, name: events.name }).from(events).orderBy(desc(events.year)),
    db.select({ id: bookings.id, reference: bookings.reference, createdAt: bookings.createdAt, eventId: bookings.eventId, eventName: events.name, lodgeId: lodges.id, lodgeName: lodges.name, categoryName: accommodationCategories.name, bookerName: bookings.bookerName, bookerPhone: bookings.bookerPhone, bookerEmail: bookings.bookerEmail, amountMinor: bookings.amountMinor, currency: bookings.currency, paymentStatus: bookings.paymentStatus, accommodationStatus: bookings.accommodationStatus, allocationStatus: bookings.allocationStatus })
      .from(bookings).innerJoin(events, eq(events.id, bookings.eventId)).innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId)).innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId))
      .where(conditions.length ? and(...conditions) : undefined).orderBy(desc(bookings.createdAt)),
  ]);
  const rows = rawRows.filter((row) => actor.globalPermissions.has("reports.read") || can(actor, "reports.read", { lodgeId: row.lodgeId }));
  const occupants = rows.length ? await db.select({ bookingId: bookingOccupants.bookingId }).from(bookingOccupants).where(inArray(bookingOccupants.bookingId, rows.map((row) => row.id))) : [];
  const guestCounts = new Map<string, number>();
  for (const occupant of occupants) guestCounts.set(occupant.bookingId, (guestCounts.get(occupant.bookingId) ?? 0) + 1);
  const enriched = rows.map((row) => ({ ...row, occupantCount: guestCounts.get(row.id) ?? 0 }));
  return {
    events: eventRows,
    rows: enriched,
    summary: {
      bookings: enriched.length,
      paid: enriched.filter((row) => row.paymentStatus === "PAID").length,
      pending: enriched.filter((row) => row.paymentStatus === "PENDING").length,
      cancelled: enriched.filter((row) => row.accommodationStatus === "CANCELLED" || row.paymentStatus === "CANCELLED").length,
      paidAmountMinor: enriched.filter((row) => row.paymentStatus === "PAID").reduce((sum, row) => sum + row.amountMinor, 0),
      guests: enriched.reduce((sum, row) => sum + row.occupantCount, 0),
    },
  };
}

export function csvCell(value: string | number | Date | null | undefined) {
  let text = value instanceof Date ? value.toISOString() : String(value ?? "");
  if (/^[\s]*[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
