import { and, asc, gte, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { paymentTransactions } from "@/db/schema";
import { listTransactions, type PaystackListedTransaction } from "@/lib/payments/paystack";

const MAX_LOCAL_ROWS = 2000;

function validDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) ? value : undefined;
}

export type ReconciliationStatus = "MATCHED" | "MISMATCH" | "LOCAL_ONLY" | "PAYSTACK_ONLY" | "NOT_CHECKED";
export interface ReconciliationRow {
  reference: string;
  localId: string | null;
  paystackId: string | null;
  localStatus: string | null;
  paystackStatus: string | null;
  localAmount: number | null;
  paystackAmount: number | null;
  localCurrency: string | null;
  paystackCurrency: string | null;
  localDate: Date | null;
  paystackDate: string | null;
  result: ReconciliationStatus;
}

function normalizedGatewayStatus(status: string) {
  if (status === "success") return "SUCCESS";
  if (["failed", "abandoned", "reversed"].includes(status)) return "FAILED";
  if (["ongoing", "pending"].includes(status)) return "PENDING";
  return status.toUpperCase();
}

function reconcilePair(local: LocalTransaction, remote: PaystackListedTransaction): ReconciliationRow {
  const matches = local.amountMinor === remote.amountMinor
    && local.currency.toUpperCase() === remote.currency.toUpperCase()
    && local.status === normalizedGatewayStatus(remote.status)
    && (!local.paystackTransactionId || String(local.paystackTransactionId) === remote.id);
  return {
    reference: remote.reference,
    localId: local.id,
    paystackId: remote.id,
    localStatus: local.status,
    paystackStatus: remote.status,
    localAmount: local.amountMinor,
    paystackAmount: remote.amountMinor,
    localCurrency: local.currency,
    paystackCurrency: remote.currency,
    localDate: local.createdAt,
    paystackDate: remote.paidAt ?? remote.createdAt,
    result: matches ? "MATCHED" : "MISMATCH",
  };
}

type LocalTransaction = {
  id: string;
  reference: string;
  paystackTransactionId: number | null;
  amountMinor: number;
  currency: string;
  status: string;
  createdAt: Date;
};

export async function reconcilePayments(input: { from?: string; to?: string }) {
  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFromDate = new Date(today);
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 29);
  const from = validDate(input.from) ?? defaultFromDate.toISOString().slice(0, 10);
  const to = validDate(input.to) ?? defaultTo;
  const fromTime = new Date(`${from}T00:00:00.000Z`);
  const until = new Date(`${to}T00:00:00.000Z`);
  until.setUTCDate(until.getUTCDate() + 1);
  if (fromTime >= until || until.getTime() - fromTime.getTime() > 90 * 24 * 60 * 60 * 1000) {
    throw new Error("Choose a valid date range of 90 days or less.");
  }

  const db = getDb();
  const [localRows, provider] = await Promise.all([
    db.select({ id: paymentTransactions.id, reference: paymentTransactions.reference, paystackTransactionId: paymentTransactions.paystackTransactionId, amountMinor: paymentTransactions.amountMinor, currency: paymentTransactions.currency, status: paymentTransactions.status, createdAt: paymentTransactions.createdAt })
      .from(paymentTransactions).where(and(gte(paymentTransactions.createdAt, fromTime), lt(paymentTransactions.createdAt, until)))
      .orderBy(asc(paymentTransactions.createdAt)).limit(MAX_LOCAL_ROWS + 1),
    listTransactions({ from: fromTime.toISOString(), to: new Date(until.getTime() - 1).toISOString() }),
  ]);
  if (localRows.length > MAX_LOCAL_ROWS) throw new Error("This date range contains too many local transactions. Narrow the date range and try again.");

  const localById = new Map(localRows.filter((row) => row.paystackTransactionId !== null).map((row) => [String(row.paystackTransactionId), row]));
  const localByReference = new Map<string, LocalTransaction[]>();
  for (const row of localRows) localByReference.set(row.reference, [...(localByReference.get(row.reference) ?? []), row]);
  const matchedLocalIds = new Set<string>();
  const rows: ReconciliationRow[] = [];

  for (const remote of provider.transactions) {
    const exactIdMatch = localById.get(remote.id);
    const local = exactIdMatch && !matchedLocalIds.has(exactIdMatch.id)
      ? exactIdMatch
      : localByReference.get(remote.reference)?.find((candidate) => !matchedLocalIds.has(candidate.id));
    if (!local) {
      rows.push({ reference: remote.reference, localId: null, paystackId: remote.id, localStatus: null, paystackStatus: remote.status, localAmount: null, paystackAmount: remote.amountMinor, localCurrency: null, paystackCurrency: remote.currency, localDate: null, paystackDate: remote.paidAt ?? remote.createdAt, result: "PAYSTACK_ONLY" });
      continue;
    }
    matchedLocalIds.add(local.id);
    rows.push(reconcilePair(local, remote));
  }

  for (const local of localRows) {
    if (matchedLocalIds.has(local.id)) continue;
    rows.push({ reference: local.reference, localId: local.id, paystackId: local.paystackTransactionId === null ? null : String(local.paystackTransactionId), localStatus: local.status, paystackStatus: null, localAmount: local.amountMinor, paystackAmount: null, localCurrency: local.currency, paystackCurrency: null, localDate: local.createdAt, paystackDate: null, result: provider.truncated ? "NOT_CHECKED" : "LOCAL_ONLY" });
  }

  const counts = { matched: 0, mismatch: 0, localOnly: 0, paystackOnly: 0, notChecked: 0 };
  for (const row of rows) {
    if (row.result === "MATCHED") counts.matched += 1;
    else if (row.result === "MISMATCH") counts.mismatch += 1;
    else if (row.result === "LOCAL_ONLY") counts.localOnly += 1;
    else if (row.result === "PAYSTACK_ONLY") counts.paystackOnly += 1;
    else counts.notChecked += 1;
  }
  return { from, to, rows, counts, truncated: provider.truncated, paystackPageCount: provider.pageCount };
}
