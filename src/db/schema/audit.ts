import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Append-only. A database trigger (see drizzle/*_audit_append_only.sql) rejects
 * UPDATE, DELETE and TRUNCATE, so history cannot be silently rewritten by the app.
 * actor_id is intentionally NOT a foreign key: the log must outlive user records.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid("actor_id"),
    actorLabel: text("actor_label").notNull(), // email or "system"
    action: text("action").notNull(), // e.g. "auth.login", "inventory.price_changed"
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [
    index("audit_entity_idx").on(t.entityType, t.entityId),
    index("audit_actor_idx").on(t.actorId),
    index("audit_time_idx").on(t.occurredAt),
  ],
);
