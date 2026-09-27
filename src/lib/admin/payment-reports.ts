import { and, count, desc, eq, gte, lt, sql, sum } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accommodationCategories, bookings, lodges, paymentTransactions } from "@/db/schema";

const PAGE_SIZE = 25;
const PAYMENT_STATES = ["PENDING", "SUCCESS", "FAILED", "AMOUNT_MISMATCH"] as const;
export type PaymentReportStatus = typeof PAYMENT_STATES[number];

function validDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) ? value : undefined;
}

export async function getPaymentReport(filters: { from?: string; to?: string; status?: string; page?: string } = {}) {
  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFromDate = new Date(today);
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 29);
  const from = validDate(filters.from) ?? defaultFromDate.toISOString().slice(0, 10);
  const to = validDate(filters.to) ?? defaultTo;
  if (from > to) throw new Error("The start date must be on or before the end date.");
  const conditions = [];
  if (from) conditions.push(gte(paymentTransactions.createdAt, new Date(`${from}T00:00:00.000Z`)));
  if (to) {
    const until = new Date(`${to}T00:00:00.000Z`);
    until.setUTCDate(until.getUTCDate() + 1);
    conditions.push(lt(paymentTransactions.createdAt, until));
  }
  const status = PAYMENT_STATES.includes(filters.status as PaymentReportStatus) ? filters.status as PaymentReportStatus : undefined;
  if (status) conditions.push(eq(paymentTransactions.status, status));
  const where = conditions.length ? and(...conditions) : undefined;
  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1);
  const db = getDb();
  const [rows, [aggregate], receivedByCurrency] = await Promise.all([
    db.select({ id: paymentTransactions.id, reference: paymentTransactions.reference, paystackTransactionId: paymentTransactions.paystackTransactionId, amountMinor: paymentTransactions.amountMinor, currency: paymentTransactions.currency, status: paymentTransactions.status, paidAt: paymentTransactions.paidAt, createdAt: paymentTransactions.createdAt, gatewayResponse: paymentTransactions.gatewayResponse, lodgeName: lodges.name, categoryName: accommodationCategories.name })
      .from(paymentTransactions).innerJoin(bookings, eq(bookings.id, paymentTransactions.bookingId)).innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId)).innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId))
      .where(where).orderBy(desc(paymentTransactions.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ total: count(), successful: sql<number>`count(*) filter (where ${paymentTransactions.status} = 'SUCCESS')`.mapWith(Number), pending: sql<number>`count(*) filter (where ${paymentTransactions.status} = 'PENDING')`.mapWith(Number), failed: sql<number>`count(*) filter (where ${paymentTransactions.status} = 'FAILED')`.mapWith(Number), mismatches: sql<number>`count(*) filter (where ${paymentTransactions.status} = 'AMOUNT_MISMATCH')`.mapWith(Number) })
      .from(paymentTransactions).innerJoin(bookings, eq(bookings.id, paymentTransactions.bookingId)).innerJoin(accommodationCategories, eq(accommodationCategories.id, bookings.categoryId)).innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId)).where(where),
    db.select({ currency: paymentTransactions.currency, amountMinor: sum(sql`case when ${paymentTransactions.status} in ('SUCCESS', 'AMOUNT_MISMATCH') then ${paymentTransactions.amountMinor} else 0 end`).mapWith(Number) })
      .from(paymentTransactions).where(where).groupBy(paymentTransactions.currency),
  ]);
  const total = Number(aggregate?.total ?? 0);
  return {
    from, to, status, rows, page, pageSize: PAGE_SIZE, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    summary: { receivedByCurrency, successful: Number(aggregate?.successful ?? 0), pending: Number(aggregate?.pending ?? 0), failed: Number(aggregate?.failed ?? 0), mismatches: Number(aggregate?.mismatches ?? 0) },
  };
}
