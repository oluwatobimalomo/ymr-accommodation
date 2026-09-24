import { randomInt } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { bookingOrders, bookings, events } from "@/db/schema";

function lodgeCode(name: string): string {
  const words = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().match(/[A-Z]+/g) ?? [];
  const code = words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? "YM").slice(0, 2);
  return code.padEnd(2, "X");
}

function randomReferenceCode(): string {
  const digits = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const letters = String.fromCharCode(65 + randomInt(0, 26), 65 + randomInt(0, 26));
  return `${digits}${letters}`;
}

/**
 * New booking references keep the event year, use the first two words of
 * the lodge name, then six cryptographically random digits and two letters.
 * Existing references remain unchanged. The event's running booking count
 * is still incremented for internal reporting.
 */
export async function nextBookingReference(tx: DbOrTx, eventId: string, lodgeName: string): Promise<string> {
  const [event] = await tx
    .update(events)
    .set({ bookingSeq: sql`${events.bookingSeq} + 1` })
    .where(eq(events.id, eventId))
    .returning({ prefix: events.bookingRefPrefix });
  if (!event) throw new Error("That event could not be found.");

  const eventCode = event.prefix.split("-")[0] || event.prefix;
  const propertyCode = lodgeCode(lodgeName);
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `${eventCode}-${propertyCode}-${randomReferenceCode()}`;
    const [existing] = await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.reference, candidate)).limit(1);
    const [existingOrder] = await tx.select({ id: bookingOrders.id }).from(bookingOrders).where(eq(bookingOrders.reference, candidate)).limit(1);
    if (!existing && !existingOrder) return candidate;
  }
  throw new Error("Could not generate a unique booking reference. Please try again.");
}
