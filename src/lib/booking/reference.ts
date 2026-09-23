import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { bookings, events } from "@/db/schema";

// Excludes visually-ambiguous characters (0/O, 1/I/L) so a reference read
// aloud at check-in or typed by hand is unlikely to be mistyped.
const REFERENCE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomReferenceCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += REFERENCE_CHARS[bytes[i]! % REFERENCE_CHARS.length];
  return out;
}

/**
 * Generates an unpredictable booking reference, e.g. YMR26-ACM-7K9XQP24.
 *
 * This is deliberately NOT sequential. An earlier version incremented a
 * counter (YMR26-ACM-00001, 00002, ...), which meant anyone could guess or
 * enumerate every booking in the system just by trying consecutive numbers
 * in the URL - a real way to view or attempt to claim someone else's
 * booking. The random 8-character suffix here (drawn from a 32-character
 * alphabet, ~40 bits of entropy) makes that infeasible, while staying
 * short enough to read aloud or type at check-in.
 *
 * The event's `bookingSeq` counter is still incremented for internal
 * reporting (a simple running count of bookings per event) but no longer
 * appears in the reference itself.
 *
 * Collisions are astronomically unlikely at this entropy, but the code is
 * still checked against existing references and retried a few times as a
 * hard guarantee rather than trusting probability alone.
 */
export async function nextBookingReference(tx: DbOrTx, eventId: string): Promise<string> {
  const [event] = await tx
    .update(events)
    .set({ bookingSeq: sql`${events.bookingSeq} + 1` })
    .where(eq(events.id, eventId))
    .returning({ prefix: events.bookingRefPrefix });
  if (!event) throw new Error("That event could not be found.");

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${event.prefix}-${randomReferenceCode()}`;
    const [existing] = await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.reference, candidate)).limit(1);
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique booking reference. Please try again.");
}
