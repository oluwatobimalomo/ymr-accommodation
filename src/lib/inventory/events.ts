import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { authorize, type Actor } from "@/lib/authz/authorize";

export type EventStatus = "DRAFT" | "OPEN" | "CLOSED" | "ARCHIVED";

export interface EventInput {
  name: string;
  slug: string;
  year: number;
  status: EventStatus;
  bookingOpensAt: Date | null;
  bookingClosesAt: Date | null;
  checkInDate: Date | null;
  checkOutDate: Date | null;
  bookingRefPrefix: string;
  holdMinutes: number;
}

function validateEvent(input: EventInput) {
  if (input.name.trim().length < 2 || input.name.trim().length > 120) throw new Error("Enter an event name between 2 and 120 characters.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) throw new Error("Event slug must use lowercase letters, numbers and hyphens.");
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2200) throw new Error("Enter a valid event year.");
  if (!["DRAFT", "OPEN", "CLOSED", "ARCHIVED"].includes(input.status)) throw new Error("Choose a valid event status.");
  if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(input.bookingRefPrefix) || input.bookingRefPrefix.length > 24) throw new Error("Booking reference prefix must use uppercase letters, numbers and hyphens.");
  if (!Number.isInteger(input.holdMinutes) || input.holdMinutes < 5 || input.holdMinutes > 120) throw new Error("Hold duration must be between 5 and 120 minutes.");
  if (input.bookingOpensAt && input.bookingClosesAt && input.bookingOpensAt >= input.bookingClosesAt) throw new Error("Booking close time must be after booking open time.");
  if (input.checkInDate && input.checkOutDate && input.checkInDate >= input.checkOutDate) throw new Error("Check-out must be after check-in.");
}

/** Events remain as historical records; archive them instead of deleting them. */
export async function listEvents() {
  return getDb().select().from(events).orderBy(asc(events.year), asc(events.name));
}

export async function createEvent(actor: Actor, input: EventInput) {
  authorize(actor, "events.manage");
  validateEvent(input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(events).values({
      ...input,
      name: input.name.trim(),
      currency: "NGN",
    }).returning();
    if (!created) throw new Error("Could not create the event.");
    await recordAudit(tx, { actor, action: "event.created", entityType: "event", entityId: created.id, after: created });
    return created;
  });
}

export async function updateEvent(actor: Actor, eventId: string, input: EventInput) {
  authorize(actor, "events.manage");
  validateEvent(input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!before) throw new Error("That event could not be found.");
    const [after] = await tx.update(events).set({
      ...input,
      name: input.name.trim(),
      updatedAt: new Date(),
    }).where(eq(events.id, eventId)).returning();
    if (!after) throw new Error("Could not update the event.");
    await recordAudit(tx, { actor, action: input.status === "ARCHIVED" && before.status !== "ARCHIVED" ? "event.archived" : "event.updated", entityType: "event", entityId: eventId, before, after });
    return after;
  });
}
