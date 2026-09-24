import { pgEnum } from "drizzle-orm/pg-core";

export const eventStatus = pgEnum("event_status", ["DRAFT", "OPEN", "CLOSED", "ARCHIVED"]);
export const userStatus = pgEnum("user_status", ["ACTIVE", "DISABLED"]);

export const accommodationMode = pgEnum("accommodation_mode", ["PRIVATE", "SHARED"]);
export const genderRestriction = pgEnum("gender_restriction", ["ANY", "MALE", "FEMALE"]);
export const pricingModel = pgEnum("pricing_model", ["PER_UNIT", "PER_PERSON"]);
export const lodgeStatus = pgEnum("lodge_status", ["ACTIVE", "INACTIVE"]);
export const categoryStatus = pgEnum("category_status", ["ACTIVE", "INACTIVE"]);
export const unitStatus = pgEnum("unit_status", ["ACTIVE", "INACTIVE", "MAINTENANCE"]);
export const roomStatus = pgEnum("room_status", ["ACTIVE", "INACTIVE", "MAINTENANCE"]);
/**
 * Administrative states only. HELD and OCCUPIED are NOT stored here — they
 * are derived (Phase 3/4) from active inventory_holds / allocations rows, so
 * they can never drift out of sync with the actual hold/allocation data.
 */
export const bedspaceStatus = pgEnum("bedspace_status", ["AVAILABLE", "BLOCKED", "MAINTENANCE", "RETIRED"]);

export const paymentStatus = pgEnum("payment_status", ["PENDING", "PAID", "FAILED", "REFUNDED", "CANCELLED"]);
export const accommodationStatus = pgEnum("accommodation_status", [
  "UNALLOCATED",
  "ALLOCATED",
  "CHECKED_IN",
  "CHECKED_OUT",
  "CANCELLED",
]);
export const allocationStatus = pgEnum("allocation_status", [
  "NOT_ALLOCATED",
  "PARTIALLY_ALLOCATED",
  "FULLY_ALLOCATED",
]);
export const occupantGender = pgEnum("occupant_gender", ["MALE", "FEMALE", "UNSPECIFIED"]);
export const keyCustodyStatus = pgEnum("key_custody_status", ["ISSUED", "RETURNED", "MISSING"]);

export const ticketCategory = pgEnum("ticket_category", [
  "PAYMENT",
  "BOOKING",
  "ACCOMMODATION",
  "ALLOCATION",
  "CHECK_IN",
  "KEY",
  "REFUND",
  "GENERAL",
]);
export const ticketStatus = pgEnum("ticket_status", [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_CUSTOMER",
  "ESCALATED",
  "RESOLVED",
  "CLOSED",
]);

export const transactionStatus = pgEnum("transaction_status", ["PENDING", "SUCCESS", "FAILED", "AMOUNT_MISMATCH"]);
