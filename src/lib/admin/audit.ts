import { and, count, desc, gte, ilike, lt, or, type SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";

export interface AuditFilters {
  q?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: string;
}

const PAGE_SIZE = 30;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value?: string) {
  return value && DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    ? value
    : undefined;
}

/** Read-only audit list. Deliberately selects no before/after payload, IP or user-agent. */
export async function listAuditEntries(filters: AuditFilters = {}) {
  const db = getDb();
  const conditions: SQL[] = [];
  const q = filters.q?.trim().slice(0, 120);
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(or(
      ilike(auditLogs.actorLabel, pattern),
      ilike(auditLogs.action, pattern),
      ilike(auditLogs.entityType, pattern),
      ilike(auditLogs.entityId, pattern),
      ilike(auditLogs.reason, pattern),
    )!);
  }
  const action = filters.action?.trim().slice(0, 100);
  if (action) conditions.push(ilike(auditLogs.action, action));
  const from = validDate(filters.from);
  const to = validDate(filters.to);
  if (from) conditions.push(gte(auditLogs.occurredAt, new Date(`${from}T00:00:00.000Z`)));
  if (to) {
    const until = new Date(`${to}T00:00:00.000Z`);
    until.setUTCDate(until.getUTCDate() + 1);
    conditions.push(lt(auditLogs.occurredAt, until));
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const parsedPage = Number.parseInt(filters.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) ? Math.max(1, Math.min(parsedPage, 1_000_000)) : 1;
  const [rows, [total]] = await Promise.all([
    db.select({
      id: auditLogs.id,
      occurredAt: auditLogs.occurredAt,
      actorLabel: auditLogs.actorLabel,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      reason: auditLogs.reason,
    }).from(auditLogs).where(where).orderBy(desc(auditLogs.occurredAt), desc(auditLogs.id)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ count: count() }).from(auditLogs).where(where),
  ]);
  return { rows, page, pageSize: PAGE_SIZE, total: Number(total?.count ?? 0) };
}
