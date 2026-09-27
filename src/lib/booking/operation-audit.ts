import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";

export type BookingOperationTimestamps = { checkedInAt: Date | null; checkedOutAt: Date | null };

/** Fetches the latest check-in/check-out audit events for bookings. */
export async function getBookingOperationTimestamps(bookingIds: string[]) {
  const timestamps = new Map<string, BookingOperationTimestamps>();
  if (!bookingIds.length) return timestamps;

  const logs = await getDb().select({
    bookingId: auditLogs.entityId,
    action: auditLogs.action,
    occurredAt: auditLogs.occurredAt,
  }).from(auditLogs)
    .where(and(
      eq(auditLogs.entityType, "booking"),
      inArray(auditLogs.entityId, bookingIds),
      inArray(auditLogs.action, ["booking.checked_in", "booking.checkin_overridden", "booking.checked_out"]),
    ))
    .orderBy(desc(auditLogs.occurredAt));

  for (const log of logs) {
    if (!log.bookingId) continue;
    const current = timestamps.get(log.bookingId) ?? { checkedInAt: null, checkedOutAt: null };
    if (!current.checkedInAt && (log.action === "booking.checked_in" || log.action === "booking.checkin_overridden")) current.checkedInAt = log.occurredAt;
    if (!current.checkedOutAt && log.action === "booking.checked_out") current.checkedOutAt = log.occurredAt;
    timestamps.set(log.bookingId, current);
  }
  return timestamps;
}
