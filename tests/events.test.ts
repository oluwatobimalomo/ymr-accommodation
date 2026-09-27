import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auditLogs, events } from "@/db/schema";
import { computeGrants, type Actor } from "@/lib/authz/authorize";
import { ROLE_DEFINITIONS } from "@/lib/authz/roles";

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
vi.mock("@/db/client", () => ({ getDb: () => testDb }));

const { createEvent, updateEvent } = await import("@/lib/inventory/events");
const roleActor = (role: "super_admin" | "support_agent"): Actor => {
  const definition = ROLE_DEFINITIONS.find((item) => item.key === role)!;
  return { userId: "00000000-0000-0000-0000-000000000001", email: "admin@example.test", name: "Admin", roleKeys: [role], ...computeGrants([definition]), lodgeIds: new Set() };
};
const admin = roleActor("super_admin");

beforeAll(async () => {
  client = new PGlite();
  testDb = drizzle(client);
  await migrate(testDb, { migrationsFolder: "./drizzle" });
});
afterAll(() => client.close());

const input = (slug: string) => ({ name: "YMR 2027 — City Takers", slug, year: 2027, status: "DRAFT" as const, bookingOpensAt: null, bookingClosesAt: null, checkInDate: null, checkOutDate: null, bookingRefPrefix: "YMR27-ACM", holdMinutes: 15 });

describe("event management", () => {
  it("creates a draft event and writes an audit record", async () => {
    const slug = `ymr-2027-${Date.now()}`;
    const created = await createEvent(admin, input(slug));
    expect(created.status).toBe("DRAFT");
    const [audit] = await testDb.select().from(auditLogs).where(eq(auditLogs.entityId, created.id));
    expect(audit?.action).toBe("event.created");
  });

  it("updates and archives without deleting the event history", async () => {
    const created = await createEvent(admin, input(`archive-event-${Date.now()}`));
    const updated = await updateEvent(admin, created.id, { ...input(created.slug), status: "ARCHIVED" });
    expect(updated.status).toBe("ARCHIVED");
    expect(await testDb.select().from(events).where(eq(events.id, created.id))).toHaveLength(1);
    const audits = await testDb.select().from(auditLogs).where(eq(auditLogs.entityId, created.id));
    expect(audits.map((row) => row.action)).toEqual(["event.created", "event.archived"]);
  });

  it("rejects actors without event-management permission", async () => {
    await expect(createEvent(roleActor("support_agent"), input(`denied-event-${Date.now()}`))).rejects.toThrow(/permission/);
  });

  it("rejects an invalid booking date range", async () => {
    const invalid = { ...input(`invalid-event-${Date.now()}`), bookingOpensAt: new Date("2027-01-02T00:00:00Z"), bookingClosesAt: new Date("2027-01-01T00:00:00Z") };
    await expect(createEvent(admin, invalid)).rejects.toThrow(/close time/);
  });
});
