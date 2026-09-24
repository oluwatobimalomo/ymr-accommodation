import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { bookingOccupants, bookings } from "./booking";
import { users } from "./auth";
import { keyCustodyStatus } from "./enums";
import { lodges } from "./inventory";

/** Key handovers remain as history after return or a missing-key report. */
export const keyCustody = pgTable(
  "key_custody",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "restrict" }),
    lodgeId: uuid("lodge_id").notNull().references(() => lodges.id, { onDelete: "restrict" }),
    occupantId: uuid("occupant_id").notNull().references(() => bookingOccupants.id, { onDelete: "restrict" }),
    keyLabel: text("key_label").notNull(),
    status: keyCustodyStatus("status").notNull().default("ISSUED"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    issuedBy: uuid("issued_by").references(() => users.id, { onDelete: "set null" }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    returnedBy: uuid("returned_by").references(() => users.id, { onDelete: "set null" }),
    missingAt: timestamp("missing_at", { withTimezone: true }),
    missingBy: uuid("missing_by").references(() => users.id, { onDelete: "set null" }),
    note: text("note").notNull().default(""),
  },
  (t) => [
    index("key_custody_booking_idx").on(t.bookingId, t.issuedAt),
    index("key_custody_occupant_idx").on(t.occupantId, t.issuedAt),
    uniqueIndex("key_custody_open_label_uq").on(t.lodgeId, sql`lower(${t.keyLabel})`).where(sql`${t.status} = 'ISSUED'`),
    uniqueIndex("key_custody_open_occupant_uq").on(t.occupantId).where(sql`${t.status} = 'ISSUED'`),
  ],
);
