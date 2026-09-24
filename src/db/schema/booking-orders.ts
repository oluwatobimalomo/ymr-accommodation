import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { events } from "./events";
import { paymentStatus } from "./enums";

/** Shared checkout record for one payment covering several accommodation bookings. */
export const bookingOrders = pgTable("booking_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "restrict" }),
  reference: text("reference").notNull().unique(),
  bookerName: text("booker_name").notNull(),
  bookerPhone: text("booker_phone").notNull(),
  bookerEmail: text("booker_email").notNull(),
  giftRecipientName: text("gift_recipient_name"),
  giftRecipientPhone: text("gift_recipient_phone"),
  giftRecipientEmail: text("gift_recipient_email"),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  paymentStatus: paymentStatus("payment_status").notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
