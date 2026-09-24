import { and, desc, eq, getTableColumns, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accommodationCategories, bookings, lodges, supportTicketMessages, supportTickets } from "@/db/schema";
import { authorize, type Actor } from "@/lib/authz/authorize";

async function nextTicketReference(): Promise<string> {
  // Simple, readable ticket reference. Collisions are astronomically
  // unlikely (timestamp + random suffix) and the table's unique constraint
  // on reference is the actual backstop.
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TKT-${Date.now().toString(36).toUpperCase()}-${suffix}`;
}

export interface CreateTicketInput {
  bookingId?: string;
  lodgeId?: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  contactPreference?: "CALL" | "WHATSAPP";
  category: "PAYMENT" | "BOOKING" | "ACCOMMODATION" | "ALLOCATION" | "CHECK_IN" | "KEY" | "REFUND" | "GENERAL";
  subject: string;
  description: string;
}

/** Anyone can open a ticket - this is the public-facing entry point, no auth required. */
export async function createTicket(input: CreateTicketInput) {
  if (!input.customerName.trim()) throw new Error("Your name is required.");
  if (!input.customerEmail.trim()) throw new Error("Your email is required.");
  if (!input.subject.trim()) throw new Error("A subject is required.");
  if (!input.description.trim()) throw new Error("Please describe the issue.");
  if (!input.customerPhone?.trim()) throw new Error("Please provide a phone number so the lodge coordinator can contact you.");
  const contactPreference = input.contactPreference ?? "WHATSAPP";
  if (contactPreference !== "CALL" && contactPreference !== "WHATSAPP") throw new Error("Choose a valid contact preference.");

  const db = getDb();
  return db.transaction(async (tx) => {
    const reference = await nextTicketReference();
    const [ticket] = await tx
      .insert(supportTickets)
      .values({
        reference,
        bookingId: input.bookingId ?? null,
        lodgeId: input.lodgeId ?? null,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone ?? "",
        contactPreference,
        category: input.category,
        subject: input.subject,
        description: input.description,
      })
      .returning();
    if (!ticket) throw new Error("Could not create the ticket.");

    await tx.insert(supportTicketMessages).values({
      ticketId: ticket.id,
      authorLabel: input.customerName,
      isStaff: false,
      body: input.description,
    });
    return ticket;
  });
}

export interface TicketFilters {
  status?: string;
  category?: string;
  preference?: string;
  lodgeId?: string;
  from?: string;
  to?: string;
}

export async function listTickets(actor: Actor, filters: TicketFilters = {}) {
  authorize(actor, "support.read");
  const db = getDb();
  const where = [];
  if (["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "ESCALATED", "RESOLVED", "CLOSED"].includes(filters.status ?? "")) where.push(eq(supportTickets.status, filters.status as never));
  if (["PAYMENT", "BOOKING", "ACCOMMODATION", "ALLOCATION", "CHECK_IN", "KEY", "REFUND", "GENERAL"].includes(filters.category ?? "")) where.push(eq(supportTickets.category, filters.category as never));
  if (["CALL", "WHATSAPP"].includes(filters.preference ?? "")) where.push(eq(supportTickets.contactPreference, filters.preference!));
  if (filters.from && !Number.isNaN(Date.parse(filters.from))) where.push(gte(supportTickets.createdAt, new Date(`${filters.from}T00:00:00`)));
  if (filters.to && !Number.isNaN(Date.parse(filters.to))) where.push(lte(supportTickets.createdAt, new Date(`${filters.to}T23:59:59.999`)));
  if (filters.lodgeId) where.push(eq(lodges.id, filters.lodgeId));
  return db
    .select({ ...getTableColumns(supportTickets), lodgeName: lodges.name, lodgeContactName: lodges.contactName, lodgeContactPhone: lodges.contactPhone })
    .from(supportTickets)
    .leftJoin(bookings, eq(bookings.id, supportTickets.bookingId))
    .leftJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId))
    .leftJoin(lodges, eq(lodges.id, sql`coalesce(${supportTickets.lodgeId}, ${accommodationCategories.lodgeId})`))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(supportTickets.createdAt))
    .limit(100);
}

export async function getTicket(actor: Actor, ticketId: string) {
  authorize(actor, "support.read");
  const db = getDb();
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
  if (!ticket) return null;
  const lodgeRows = ticket.lodgeId
    ? await db.select({ name: lodges.name, contactName: lodges.contactName, contactPhone: lodges.contactPhone }).from(lodges).where(eq(lodges.id, ticket.lodgeId)).limit(1)
    : ticket.bookingId
      ? await db.select({ name: lodges.name, contactName: lodges.contactName, contactPhone: lodges.contactPhone }).from(bookings).innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId)).innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId)).where(eq(bookings.id, ticket.bookingId)).limit(1)
      : [];
  const lodge = lodgeRows[0];
  const messages = await db
    .select()
    .from(supportTicketMessages)
    .where(eq(supportTicketMessages.ticketId, ticketId))
    .orderBy(supportTicketMessages.createdAt);
  return { ticket, messages, lodge: lodge ?? null };
}

export async function replyToTicket(actor: Actor, ticketId: string, body: string) {
  authorize(actor, "support.manage");
  if (!body.trim()) throw new Error("A reply cannot be empty.");
  const db = getDb();
  await db.insert(supportTicketMessages).values({ ticketId, authorLabel: actor.name, isStaff: true, body });
  await db.update(supportTickets).set({ updatedAt: new Date() }).where(eq(supportTickets.id, ticketId));
}

export async function setTicketStatus(
  actor: Actor,
  ticketId: string,
  status: "OPEN" | "IN_PROGRESS" | "WAITING_FOR_CUSTOMER" | "ESCALATED" | "RESOLVED" | "CLOSED",
  contactSummary = "",
) {
  authorize(actor, "support.manage");
  if (!["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "ESCALATED", "RESOLVED", "CLOSED"].includes(status)) throw new Error("Choose a valid support status.");
  if (["RESOLVED", "CLOSED"].includes(status) && !contactSummary.trim()) {
    throw new Error("Add a summary of your call or WhatsApp exchange before resolving or closing this ticket.");
  }
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.update(supportTickets).set({ status, updatedAt: new Date() }).where(eq(supportTickets.id, ticketId));
    if (contactSummary.trim()) {
      await tx.insert(supportTicketMessages).values({
        ticketId,
        authorLabel: actor.name,
        isStaff: true,
        body: contactSummary.trim(),
      });
    }
  });
}

export async function getLatestTicketNotification(actor: Actor) {
  authorize(actor, "support.read");
  const [latest] = await getDb()
    .select({ id: supportTickets.id, reference: supportTickets.reference, createdAt: supportTickets.createdAt })
    .from(supportTickets)
    .orderBy(desc(supportTickets.createdAt))
    .limit(1);
  return latest ?? null;
}

export async function countOpenTickets(): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(supportTickets)
    .where(sql`${supportTickets.status} not in ('RESOLVED', 'CLOSED')`);
  return row!.count;
}
