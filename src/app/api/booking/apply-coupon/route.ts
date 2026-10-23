import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { accommodationCategories, events, lodges } from "@/db/schema";
import { enforcePublicRateLimits } from "@/lib/auth/public-rate-limit";
import { isSameOrigin } from "@/lib/auth/origin";
import { quoteCoupon } from "@/lib/coupons/coupons";
import { safeErrorMessage } from "@/lib/safe-error";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request could not be verified." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  try {
    const body = await request.json() as Record<string, unknown>;
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const items = Array.isArray(body.items) ? body.items.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      const categoryId = typeof item.categoryId === "string" ? item.categoryId : "";
      const quantity = Number(item.quantity);
      return categoryId && Number.isInteger(quantity) && quantity > 0 && quantity <= 12 ? [{ categoryId, quantity }] : [];
    }) : [];
    if (!code || !email || !phone || items.length === 0 || items.reduce((sum, item) => sum + item.quantity, 0) > 12) {
      return NextResponse.json({ error: "Enter your contact details, add an apartment and enter a discount code." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const limits = await enforcePublicRateLimits(request, [
      { scope: "coupon-apply-ip", maxRequests: 30, windowMs: 15 * 60_000 },
      { scope: "coupon-apply-code", identity: code, bindIdentityToIp: true, maxRequests: 12, windowMs: 15 * 60_000 },
    ]);
    if (!limits.allowed) return NextResponse.json({ error: "Too many attempts. Please wait before trying again." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(limits.retryAfterSeconds) } });

    const uniqueIds = [...new Set(items.map((item) => item.categoryId))];
    const db = getDb();
    const categories = await db.select({ id: accommodationCategories.id, price: accommodationCategories.defaultPriceMinor, status: accommodationCategories.status, eventId: lodges.eventId, lodgeStatus: lodges.status, eventStatus: events.status, currency: events.currency })
      .from(accommodationCategories).innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId)).innerJoin(events, eq(events.id, lodges.eventId))
      .where(inArray(accommodationCategories.id, uniqueIds));
    if (categories.length !== uniqueIds.length || categories.some((category) => category.status !== "ACTIVE" || category.lodgeStatus !== "ACTIVE" || category.eventStatus !== "OPEN")) {
      return NextResponse.json({ error: "One or more apartments in your bag are no longer available." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const eventId = categories[0]!.eventId;
    if (categories.some((category) => category.eventId !== eventId || category.currency !== categories[0]!.currency)) {
      return NextResponse.json({ error: "All apartments in a checkout must belong to the same event." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const priceByCategory = new Map(categories.map((category) => [category.id, category.price]));
    const quote = await db.transaction((tx) => quoteCoupon(tx, {
      code, eventId, email, phone,
      items: items.map((item) => ({ categoryId: item.categoryId, subtotalMinor: priceByCategory.get(item.categoryId)! * item.quantity })),
    }));
    const subtotalMinor = items.reduce((sum, item) => sum + priceByCategory.get(item.categoryId)! * item.quantity, 0);
    if (subtotalMinor - quote.discountMinor <= 0) throw new Error("The discount cannot cover the entire booking total. Choose a smaller fixed discount.");
    return NextResponse.json({ code: quote.code, subtotalMinor, discountMinor: quote.discountMinor, amountMinor: subtotalMinor - quote.discountMinor }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
