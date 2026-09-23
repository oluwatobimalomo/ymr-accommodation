import {
  boolean,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { events } from "./events";
import {
  accommodationMode,
  bedspaceStatus,
  categoryStatus,
  genderRestriction,
  lodgeStatus,
  pricingModel,
  roomStatus,
  unitStatus,
} from "./enums";

/**
 * Never hard-deleted (bookings/history may reference them). Use `status` instead.
 * `images` is an ordered array of storage keys/URLs; the first entry is the main image.
 */
export const lodges = pgTable("lodges", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  address: text("address").notNull().default(""),
  /** Distance from the Old Auditorium, in kilometres. Nullable: not every lodge has this set yet. */
  proximityKm: numeric("proximity_km", { precision: 6, scale: 2 }),
  // Named "contact" in the database for historical reasons; the UI presents
  // this as "Lodge coordinator" (name + phone) per the simplified lodge form.
  contactName: text("contact_name").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  images: text("images").array().notNull().default([]),
  status: lodgeStatus("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Categories are data, not a hard-coded list — a lodge can have any number,
 * named however operations wants ("Private", "Male Shared", "VIP Shared", ...).
 */
export const accommodationCategories = pgTable("accommodation_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  lodgeId: uuid("lodge_id")
    .notNull()
    .references(() => lodges.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  mode: accommodationMode("mode").notNull(),
  genderRestriction: genderRestriction("gender_restriction").notNull().default("ANY"),
  pricingModel: pricingModel("pricing_model").notNull(),
  /** Minor units (kobo). Currency is inherited from the parent event. */
  defaultPriceMinor: integer("default_price_minor").notNull(),
  description: text("description").notNull().default(""),
  /** Whether the customer picks a specific room, or the system auto-allocates one. */
  customerSelectsRoom: boolean("customer_selects_room").notNull().default(true),
  /** Whether the customer picks a specific bedspace within the room. */
  customerSelectsBedspace: boolean("customer_selects_bedspace").notNull().default(true),
  /** Whether "Book Entire Room" may be offered for SHARED rooms in this category. */
  allowEntireRoomBooking: boolean("allow_entire_room_booking").notNull().default(false),
  status: categoryStatus("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A physical structure (chalet, block, apartment). `capacity` is authoritative
 * only for PRIVATE units with no child rooms; for units that have rooms, a
 * trigger keeps it in sync with SUM(rooms.capacity) so it can never drift
 * (see drizzle/0003_inventory_capacity_sync.sql).
 */
export const accommodationUnits = pgTable("accommodation_units", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => accommodationCategories.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  code: text("code").notNull(),
  description: text("description").notNull().default(""),
  capacity: integer("capacity").notNull().default(0),
  images: text("images").array().notNull().default([]),
  status: unitStatus("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `capacity` is authoritative input for private units with no bedspace
 * breakdown; for SHARED rooms it is kept in sync with COUNT(bedspaces) by
 * the same trigger that maintains accommodation_units.capacity.
 * `genderRestriction` must agree with the parent category when the category
 * itself is MALE or FEMALE restricted (enforced by trigger, not just here).
 */
export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => accommodationUnits.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  code: text("code").notNull(),
  capacity: integer("capacity").notNull().default(0),
  genderRestriction: genderRestriction("gender_restriction").notNull().default("ANY"),
  status: roomStatus("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The individually bookable unit of shared inventory. `letter` is unique
 * within its room (A, B, C...). Never hard-deleted once a booking could
 * reference it — retire instead (status RETIRED).
 */
export const bedspaces = pgTable("bedspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "restrict" }),
  letter: text("letter").notNull(),
  status: bedspaceStatus("status").notNull().default("AVAILABLE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Configurable, not hard-coded — new facilities can be added without a code change. */
export const facilities = pgTable("facilities", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  icon: text("icon").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const unitFacilities = pgTable(
  "unit_facilities",
  {
    unitId: uuid("unit_id")
      .notNull()
      .references(() => accommodationUnits.id, { onDelete: "cascade" }),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.unitId, t.facilityId] })],
);
