import { and, asc, count, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accommodationCategories, couponCategories, couponRedemptions, coupons, events, lodges } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { authorize, type Actor } from "@/lib/authz/authorize";

type DbTx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export function normalizeCouponCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) return `234${digits.slice(1)}`;
  return digits;
}

export function readCouponDate(value: string, label: string) {
  const input = value.trim();
  if (!input) throw new Error(`${label} is required.`);
  const date = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input) ? `${input}:00+01:00` : input);
  if (Number.isNaN(date.getTime())) throw new Error(`Enter a valid ${label.toLowerCase()}.`);
  return date;
}

export async function listCoupons() {
  const db = getDb();
  const rows = await db.select({
    coupon: coupons,
    eventName: events.name,
    redemptionCount: sql<number>`count(${couponRedemptions.id}) filter (where ${couponRedemptions.status} = 'REDEEMED')::int`,
  }).from(coupons).innerJoin(events, eq(events.id, coupons.eventId))
    .leftJoin(couponRedemptions, eq(couponRedemptions.couponId, coupons.id))
    .groupBy(coupons.id, events.name).orderBy(desc(coupons.createdAt));
  const scopes = await db.select({ couponId: couponCategories.couponId, lodgeName: lodges.name, categoryName: accommodationCategories.name })
    .from(couponCategories).innerJoin(accommodationCategories, eq(accommodationCategories.id, couponCategories.categoryId))
    .innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId));
  const byCoupon = new Map<string, string[]>();
  for (const scope of scopes) byCoupon.set(scope.couponId, [...(byCoupon.get(scope.couponId) ?? []), `${scope.lodgeName} · ${scope.categoryName}`]);
  return rows.map((row) => ({ ...row, categoryNames: byCoupon.get(row.coupon.id) ?? [] }));
}

export async function listCouponEvents() {
  return getDb().select({ id: events.id, name: events.name, currency: events.currency }).from(events).orderBy(asc(events.year));
}

export async function listCouponCategories() {
  return getDb().select({ id: accommodationCategories.id, eventId: lodges.eventId, lodgeName: lodges.name, name: accommodationCategories.name })
    .from(accommodationCategories).innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId))
    .where(eq(accommodationCategories.status, "ACTIVE")).orderBy(asc(lodges.name), asc(accommodationCategories.name));
}

export async function createCoupon(actor: Actor, input: {
  eventId: string; code: string; discountType: "PERCENTAGE" | "FIXED"; discountValue: number; maxDiscountNaira?: number; minSubtotalNaira: number; categoryIds: string[];
  maxRedemptions: number; maxPerAttendee: number; startsAt: Date; expiresAt: Date;
}) {
  authorize(actor, "coupon.manage");
  const code = normalizeCouponCode(input.code);
  if (!/^[A-Z0-9]{4,32}$/.test(code)) throw new Error("Use 4–32 uppercase letters or numbers for the code.");
  if (input.discountType === "PERCENTAGE" && (!Number.isInteger(input.discountValue) || input.discountValue < 1 || input.discountValue > 90)) throw new Error("Percentage discounts must be between 1% and 90%.");
  if (input.discountType === "FIXED" && (!Number.isFinite(input.discountValue) || input.discountValue <= 0 || input.discountValue > 21000000)) throw new Error("Enter a valid fixed discount amount.");
  if (!Number.isInteger(input.maxRedemptions) || input.maxRedemptions < 1 || input.maxRedemptions > 10000) throw new Error("Set a total use limit between 1 and 10,000.");
  if (!Number.isInteger(input.maxPerAttendee) || input.maxPerAttendee < 1 || input.maxPerAttendee > 10) throw new Error("Set a per-attendee limit between 1 and 10.");
  if (!Number.isFinite(input.minSubtotalNaira) || input.minSubtotalNaira < 0 || input.minSubtotalNaira > 21000000) throw new Error("Enter a valid minimum booking amount.");
  if (input.maxDiscountNaira !== undefined && (!Number.isFinite(input.maxDiscountNaira) || input.maxDiscountNaira <= 0 || input.maxDiscountNaira > 21000000)) throw new Error("Enter a valid maximum discount.");
  if (input.startsAt >= input.expiresAt) throw new Error("The expiry must be after the start time.");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [event] = await tx.select().from(events).where(eq(events.id, input.eventId)).limit(1);
    if (!event) throw new Error("Choose a valid event.");
    const selectedIds = [...new Set(input.categoryIds)];
    if (selectedIds.length) {
      const valid = await tx.select({ id: accommodationCategories.id }).from(accommodationCategories)
        .innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId))
        .where(and(inArray(accommodationCategories.id, selectedIds), eq(lodges.eventId, event.id), eq(accommodationCategories.status, "ACTIVE")));
      if (valid.length !== selectedIds.length) throw new Error("Choose apartments from the selected event.");
    }
    const [existing] = await tx.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, code)).limit(1);
    if (existing) throw new Error("That discount code is already in use. Choose another code.");
    const [created] = await tx.insert(coupons).values({
      eventId: event.id, code, discountType: input.discountType,
      discountPercent: input.discountType === "PERCENTAGE" ? input.discountValue : null,
      fixedDiscountMinor: input.discountType === "FIXED" ? Math.round(input.discountValue * 100) : null,
      maxDiscountMinor: input.maxDiscountNaira === undefined ? null : Math.round(input.maxDiscountNaira * 100),
      minSubtotalMinor: Math.round(input.minSubtotalNaira * 100), maxRedemptions: input.maxRedemptions,
      maxPerAttendee: input.maxPerAttendee, startsAt: input.startsAt, expiresAt: input.expiresAt,
      createdBy: actor.userId,
    }).returning();
    if (!created) throw new Error("Could not create the discount code.");
    if (selectedIds.length) await tx.insert(couponCategories).values(selectedIds.map((categoryId) => ({ couponId: created.id, categoryId })));
    await recordAudit(tx, { actor, action: "coupon.created", entityType: "coupon", entityId: created.id, after: { ...created, createdBy: actor.userId } });
    return created;
  });
}

export async function setCouponStatus(actor: Actor, id: string, status: "ACTIVE" | "PAUSED") {
  authorize(actor, "coupon.manage");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(coupons).where(eq(coupons.id, id)).for("update").limit(1);
    if (!before) throw new Error("That discount code could not be found.");
    const [after] = await tx.update(coupons).set({ status, updatedAt: new Date() }).where(eq(coupons.id, id)).returning();
    await recordAudit(tx, { actor, action: status === "PAUSED" ? "coupon.paused" : "coupon.reactivated", entityType: "coupon", entityId: id, before: { status: before.status }, after: { status } });
    return after;
  });
}

/** Locks a coupon row so capacity and per-attendee limits serialize across concurrent checkouts. */
export async function quoteCoupon(tx: DbTx, input: {
  code: string; eventId: string; items: Array<{ categoryId: string; subtotalMinor: number }>; email: string; phone: string;
}) {
  const code = normalizeCouponCode(input.code);
  if (!code) throw new Error("Enter a discount code.");
  if (code.length > 32 || !/^[A-Z0-9]+$/.test(code)) throw new Error("That discount code is invalid or no longer active.");
  const [coupon] = await tx.select().from(coupons)
    .where(and(eq(coupons.code, code), eq(coupons.eventId, input.eventId))).for("update").limit(1);
  const now = new Date();
  if (!coupon || coupon.status !== "ACTIVE" || coupon.startsAt > now || coupon.expiresAt <= now) throw new Error("This discount code is invalid or no longer active.");
  const scoped = await tx.select({ categoryId: couponCategories.categoryId }).from(couponCategories).where(eq(couponCategories.couponId, coupon.id));
  const scopedIds = new Set(scoped.map((row) => row.categoryId));
  const eligibleItems = input.items.filter((item) => scopedIds.size === 0 || scopedIds.has(item.categoryId));
  const eligibleSubtotalMinor = eligibleItems.reduce((sum, item) => sum + item.subtotalMinor, 0);
  if (eligibleSubtotalMinor <= 0) throw new Error("This discount code does not apply to the apartments in your selection.");
  if (eligibleSubtotalMinor < coupon.minSubtotalMinor) throw new Error("This discount code requires a higher eligible booking total.");
  const activeReservation = or(eq(couponRedemptions.status, "REDEEMED"), and(eq(couponRedemptions.status, "RESERVED"), gt(couponRedemptions.expiresAt, now)));
  const [total] = await tx.select({ value: count() }).from(couponRedemptions).where(and(eq(couponRedemptions.couponId, coupon.id), activeReservation));
  if (total!.value >= coupon.maxRedemptions) throw new Error("This discount code has reached its use limit.");
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  if (!email.includes("@") || phone.length < 7) throw new Error("Enter a valid attendee email and phone number to use a discount code.");
  const [attendee] = await tx.select({ value: count() }).from(couponRedemptions).where(and(
    eq(couponRedemptions.couponId, coupon.id), activeReservation,
    or(eq(couponRedemptions.emailNormalized, email), eq(couponRedemptions.phoneNormalized, phone)),
  ));
  if (attendee!.value >= coupon.maxPerAttendee) throw new Error("This discount code has already been used for this attendee.");
  const percentage = coupon.discountType === "PERCENTAGE" ? Math.floor(eligibleSubtotalMinor * (coupon.discountPercent ?? 0) / 100) : coupon.fixedDiscountMinor ?? 0;
  const capped = coupon.maxDiscountMinor === null ? percentage : Math.min(percentage, coupon.maxDiscountMinor);
  const discountMinor = Math.min(capped, eligibleSubtotalMinor);
  if (discountMinor <= 0) throw new Error("This discount code cannot be applied to this booking.");
  return { coupon, code: coupon.code, discountMinor, eligibleSubtotalMinor, eligibleCategoryIds: [...new Set(eligibleItems.map((item) => item.categoryId))], email, phone };
}

export async function reserveCouponRedemption(tx: DbTx, input: {
  couponId: string; bookingOrderId?: string; bookingId?: string; email: string; phone: string; discountMinor: number; expiresAt: Date;
}) {
  await tx.insert(couponRedemptions).values({
    couponId: input.couponId,
    bookingOrderId: input.bookingOrderId ?? null,
    bookingId: input.bookingId ?? null,
    emailNormalized: normalizeEmail(input.email), phoneNormalized: normalizePhone(input.phone),
    discountMinor: input.discountMinor, expiresAt: input.expiresAt,
  });
}

export async function redeemOrderCoupon(tx: DbTx, bookingOrderId: string) {
  await tx.update(couponRedemptions).set({ status: "REDEEMED", redeemedAt: new Date() })
    .where(and(eq(couponRedemptions.bookingOrderId, bookingOrderId), eq(couponRedemptions.status, "RESERVED")));
}

export async function redeemBookingCoupon(tx: DbTx, bookingId: string) {
  await tx.update(couponRedemptions).set({ status: "REDEEMED", redeemedAt: new Date() })
    .where(and(eq(couponRedemptions.bookingId, bookingId), eq(couponRedemptions.status, "RESERVED")));
}

export async function recordOrderCouponRedemption(tx: DbTx, input: {
  couponId: string; bookingOrderId: string; email: string; phone: string; discountMinor: number; expiresAt: Date;
}) {
  return reserveCouponRedemption(tx, input);
}

export async function recordBookingCouponRedemption(tx: DbTx, input: {
  couponId: string; bookingId: string; email: string; phone: string; discountMinor: number; expiresAt: Date;
}) {
  return reserveCouponRedemption(tx, input);
}

