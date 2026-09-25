import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export interface EmailAttachment { filename: string; content: string; content_type: string; content_id: string }

export const emailOutbox = pgTable("email_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  dedupeKey: text("dedupe_key").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject").notNull(),
  textBody: text("text_body").notNull(),
  htmlBody: text("html_body").notNull(),
  attachments: jsonb("attachments").$type<EmailAttachment[]>().notNull().default([]),
  status: text("status").notNull().default("PENDING"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("email_outbox_dedupe_key_uq").on(t.dedupeKey),
  index("email_outbox_pending_idx").on(t.status, t.nextAttemptAt),
]);
