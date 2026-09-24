import { char, integer, pgTable, text, timestamp, uniqueIndex, uuid, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { accommodationCategories, accommodationUnits, bedspaces, rooms } from "./inventory";
import { events } from "./events";
import { bookingOrders } from "./booking-orders";
import { accommodationStatus, allocationStatus, occupantGender, paymentStatus } from "./enums";

/**
 * A temporary claim on one piece of inventory while the customer completes
 * payment. Exactly one of bedspaceId / roomId / unitId is set, matching
 * whichever level the category sells at. Existence of a non-expired row IS
 * the "held" state (mirroring how `sessions` works in Phase 1) — there is no
 * separate boolean to drift out of sync. The service layer sweeps expired
 * rows before checking availability, and every insert happens inside a
 * transaction that locks the target row first (see src/lib/booking/holds.ts).
 */
export const inventoryHolds = pgTable("inventory_holds", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
  bedspaceId: uuid("bedspace_id").references(() => bedspaces.id, { onDelete: "cascade" }),
  roomId: uuid("room_id").references(() => rooms.id, { onDelete: "cascade" }),
  unitId: uuid("unit_id").references(() => accommodationUnits.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Payment, accommodation and allocation status are three separate columns
 * on purpose (brief section 16) — e.g. PAID + UNALLOCATED is a valid, common
 * state right after a successful payment, before staff assign a room.
 */
export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "restrict" }),
  checkoutOrderId: uuid("checkout_order_id").references(() => bookingOrders.id, { onDelete: "restrict" }),
  reference: text("reference").notNull().unique(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => accommodationCategories.id, { onDelete: "restrict" }),
  bookerName: text("booker_name").notNull(),
  bookerPhone: text("booker_phone").notNull(),
  bookerEmail: text("booker_email").notNull(),
  occupantCount: integer("occupant_count").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  paymentStatus: paymentStatus("payment_status").notNull().default("PENDING"),
  accommodationStatus: accommodationStatus("accommodation_status").notNull().default("UNALLOCATED"),
  allocationStatus: allocationStatus("allocation_status").notNull().default("NOT_ALLOCATED"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Every occupant is its own row, independent of the primary booker (brief
 * section 17) — required for gender validation, check-in and key custody.
 * Exactly one of bedspaceId / roomId / unitId is set once allocated; it can
 * start null for a category where the system auto-allocates later.
 */
export const bookingOccupants = pgTable("booking_occupants", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  gender: occupantGender("gender").notNull(),
  bedspaceId: uuid("bedspace_id").references(() => bedspaces.id, { onDelete: "restrict" }),
  roomId: uuid("room_id").references(() => rooms.id, { onDelete: "restrict" }),
  unitId: uuid("unit_id").references(() => accommodationUnits.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Durable claim for private whole-unit inventory. Multiple occupants from a
 * single booking may share the unit, but only one unreleased booking may own
 * the unit at a time. Temporary inventory_holds still govern checkout expiry.
 */
export const privateUnitAllocations = pgTable(
  "private_unit_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id").notNull().references(() => accommodationUnits.id, { onDelete: "restrict" }),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "restrict" }),
    allocatedAt: timestamp("allocated_at", { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releaseReason: text("release_reason"),
  },
  (t) => [
    uniqueIndex("private_unit_allocations_active_unit_uq").on(t.unitId).where(sql`${t.releasedAt} is null`),
    uniqueIndex("private_unit_allocations_booking_unit_uq").on(t.bookingId, t.unitId),
    index("private_unit_allocations_booking_idx").on(t.bookingId),
  ],
);
