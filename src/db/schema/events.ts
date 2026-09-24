import { char, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { eventStatus } from "./enums";

/**
 * One row per YMR edition. Every booking will reference an event, so past
 * editions stay intact when a new one is created.
 *
 * booking_seq is the per-event count retained for reporting. New customer
 * references are lodge-based and random; the counter is not exposed.
 */
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  year: integer("year").notNull(),
  status: eventStatus("status").notNull().default("DRAFT"),
  bookingOpensAt: timestamp("booking_opens_at", { withTimezone: true }),
  bookingClosesAt: timestamp("booking_closes_at", { withTimezone: true }),
  checkInDate: timestamp("check_in_date", { withTimezone: true }),
  checkOutDate: timestamp("check_out_date", { withTimezone: true }),
  currency: char("currency", { length: 3 }).notNull().default("NGN"),
  bookingRefPrefix: text("booking_ref_prefix").notNull(), // e.g. "YMR26-ACM"
  bookingSeq: integer("booking_seq").notNull().default(0),
  holdMinutes: integer("hold_minutes").notNull().default(15),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
