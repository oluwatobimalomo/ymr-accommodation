import { auditLogs } from "@/db/schema";
import type { DbOrTx } from "@/db/client";
import type { Actor } from "@/lib/authz/authorize";

export interface AuditEntry {
  actor: Pick<Actor, "userId" | "email"> | null; // null = system
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Pass the caller's transaction so the audit row commits or rolls back
 * together with the change it describes.
 */
export async function recordAudit(db: DbOrTx, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: entry.actor?.userId ?? null,
    actorLabel: entry.actor?.email ?? "system",
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent?.slice(0, 400) ?? null,
  });
}
