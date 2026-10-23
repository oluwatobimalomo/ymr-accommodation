import { and, sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { events } from "./events";
import { bookingOrders } from "./booking-orders";
import { bookings } from "./booking";
import { accommodationCategories } from "./inventory";
import { couponDiscountType, couponRedemptionStatus, couponStatus } from "./enums";

export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  discountType: couponDiscountType("discount_type").notNull().default("PERCENTAGE"),
  discountPercent: integer("discount_percent"),
  fixedDiscountMinor: integer("fixed_discount_minor"),
  maxDiscountMinor: integer("max_discount_minor"),
  minSubtotalMinor: integer("min_subtotal_minor").notNull().default(0),
  maxRedemptions: integer("max_redemptions").notNull(),
  maxPerAttendee: integer("max_per_attendee").notNull().default(1),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: couponStatus("status").notNull().default("ACTIVE"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("coupons_code_uq").on(t.code),
  index("coupons_event_status_idx").on(t.eventId, t.status),
  check("coupons_discount_value_check", sql`(${t.discountType} = 'PERCENTAGE' and ${t.discountPercent} between 1 and 90 and ${t.fixedDiscountMinor} is null) or (${t.discountType} = 'FIXED' and ${t.fixedDiscountMinor} > 0 and ${t.discountPercent} is null)`),
  check("coupons_max_discount_check", sql`${t.maxDiscountMinor} is null or ${t.maxDiscountMinor} > 0`),
  check("coupons_minimum_check", sql`${t.minSubtotalMinor} >= 0`),
  check("coupons_limits_check", sql`${t.maxRedemptions} > 0 and ${t.maxPerAttendee} > 0`),
  check("coupons_window_check", sql`${t.expiresAt} > ${t.startsAt}`),
]);

export const couponCategories = pgTable("coupon_categories", {
  couponId: uuid("coupon_id").notNull().references(() => coupons.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => accommodationCategories.id, { onDelete: "restrict" }),
}, (t) => [
  uniqueIndex("coupon_categories_pk").on(t.couponId, t.categoryId),
  index("coupon_categories_category_idx").on(t.categoryId),
]);

export const couponRedemptions = pgTable("coupon_redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  couponId: uuid("coupon_id").notNull().references(() => coupons.id, { onDelete: "restrict" }),
  bookingOrderId: uuid("booking_order_id").references(() => bookingOrders.id, { onDelete: "restrict" }),
  bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "restrict" }),
  emailNormalized: text("email_normalized").notNull(),
  phoneNormalized: text("phone_normalized").notNull(),
  discountMinor: integer("discount_minor").notNull(),
  status: couponRedemptionStatus("status").notNull().default("RESERVED"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("coupon_redemptions_order_uq").on(t.bookingOrderId).where(sql`${t.bookingOrderId} is not null`),
  uniqueIndex("coupon_redemptions_booking_uq").on(t.bookingId).where(sql`${t.bookingId} is not null`),
  index("coupon_redemptions_coupon_status_expiry_idx").on(t.couponId, t.status, t.expiresAt),
  index("coupon_redemptions_attendee_idx").on(t.couponId, t.emailNormalized),
  index("coupon_redemptions_phone_idx").on(t.couponId, t.phoneNormalized),
  check("coupon_redemptions_one_target_check", sql`(${t.bookingOrderId} is null) <> (${t.bookingId} is null)`),
  check("coupon_redemptions_discount_check", sql`${t.discountMinor} > 0`),
]);
