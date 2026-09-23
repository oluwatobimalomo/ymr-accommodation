import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { bookings } from "./booking";
import { ticketCategory, ticketStatus } from "./enums";

export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull().default(""),
  category: ticketCategory("category").notNull(),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  status: ticketStatus("status").notNull().default("OPEN"),
  assignedTo: uuid("assigned_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only activity/message history for a ticket - staff replies and customer follow-ups. */
export const supportTicketMessages = pgTable("support_ticket_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => supportTickets.id, { onDelete: "cascade" }),
  authorLabel: text("author_label").notNull(), // "Customer" or the staff member's name
  isStaff: boolean("is_staff").notNull().default(false),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
