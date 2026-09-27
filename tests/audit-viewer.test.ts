import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { auditLogs } from "@/db/schema";

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
vi.mock("@/db/client", () => ({ getDb: () => testDb }));
const { listAuditEntries } = await import("@/lib/admin/audit");

beforeAll(async () => {
  client = new PGlite();
  testDb = drizzle(client);
  await migrate(testDb, { migrationsFolder: "./drizzle" });
  await testDb.insert(auditLogs).values([
    { occurredAt: new Date("2026-09-20T12:00:00Z"), actorLabel: "admin@example.test", action: "inventory.price_changed", entityType: "apartment", entityId: "apt-1", before: { price: 100 }, after: { price: 200 } },
    { occurredAt: new Date("2026-09-22T12:00:00Z"), actorLabel: "system", action: "booking.hold_expired", entityType: "booking", entityId: "booking-1" },
  ]);
});
afterAll(() => client.close());

describe("audit log viewer query", () => {
  it("filters by action and date and returns only safe display fields", async () => {
    const result = await listAuditEntries({ action: "inventory.price_changed", from: "2026-09-20", to: "2026-09-20" });
    expect(result.total).toBe(1);
    expect(result.rows[0]).toMatchObject({ actorLabel: "admin@example.test", entityId: "apt-1" });
    expect(result.rows[0]).not.toHaveProperty("before");
    expect(result.rows[0]).not.toHaveProperty("after");
  });

  it("searches audit metadata and paginates in descending event order", async () => {
    const result = await listAuditEntries({ q: "booking-1", page: "1" });
    expect(result.total).toBe(1);
    expect(result.rows[0]?.action).toBe("booking.hold_expired");
    expect(result.page).toBe(1);
  });
});
