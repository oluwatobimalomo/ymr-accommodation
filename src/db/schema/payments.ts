import { bigint, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { bookings } from "./booking";
import { transactionStatus } from "./enums";

/**
 * One row per Paystack transaction attempt against a booking. `reference`
 * is the same value as bookings.reference — we pass our own booking
 * reference to Paystack at initialize time so the two are always the same
 * string, and Paystack's transaction id (`paystackTransactionId`) is stored
 * separately once known.
 */
export const paymentTransactions = pgTable("payment_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "restrict" }),
  reference: text("reference").notNull(),
  paystackTransactionId: bigint("paystack_transaction_id", { mode: "number" }),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  status: transactionStatus("status").notNull().default("PENDING"),
  gatewayResponse: text("gateway_response").notNull().default(""),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Idempotency guard for webhook delivery: Paystack can and does retry
 * webhook delivery, so the same event may arrive more than once. Inserting
 * the event's unique key here first, before doing any fulfillment work,
 * means a duplicate delivery hits a unique-constraint violation and is
 * safely ignored rather than double-processed.
 */
export const paymentEvents = pgTable("payment_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull().default("paystack"),
  eventKey: text("event_key").notNull().unique(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
