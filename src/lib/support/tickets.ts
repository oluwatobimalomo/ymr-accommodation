import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { supportTicketMessages, supportTickets } from "@/db/schema";
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
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
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

  const db = getDb();
  return db.transaction(async (tx) => {
    const reference = await nextTicketReference();
    const [ticket] = await tx
      .insert(supportTickets)
      .values({
        reference,
        bookingId: input.bookingId ?? null,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone ?? "",
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

export async function listTickets(actor: Actor, statusFilter?: string) {
  authorize(actor, "support.read");
  const db = getDb();
  const rows = statusFilter
    ? await db.select().from(supportTickets).where(eq(supportTickets.status, statusFilter as never)).orderBy(desc(supportTickets.createdAt))
    : await db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt));
  return rows;
}

export async function getTicket(actor: Actor, ticketId: string) {
  authorize(actor, "support.read");
  const db = getDb();
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
  if (!ticket) return null;
  const messages = await db
    .select()
    .from(supportTicketMessages)
    .where(eq(supportTicketMessages.ticketId, ticketId))
    .orderBy(supportTicketMessages.createdAt);
  return { ticket, messages };
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
) {
  authorize(actor, "support.manage");
  const db = getDb();
  await db.update(supportTickets).set({ status, updatedAt: new Date() }).where(eq(supportTickets.id, ticketId));
}

export async function countOpenTickets(): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(supportTickets)
    .where(sql`${supportTickets.status} not in ('RESOLVED', 'CLOSED')`);
  return row!.count;
}
