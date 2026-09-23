import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLogs, events, users } from "@/db/schema";

/** Runs the real migration files against an in-process Postgres. */
let client: PGlite;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });
});
afterAll(async () => {
  await client.close();
});

describe("migrations", () => {
  it("apply cleanly and create the foundation tables", async () => {
    const res = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema='public'",
    );
    const names = res.rows.map((r) => r.table_name);
    for (const t of ["events", "users", "roles", "permissions", "role_permissions", "user_roles", "sessions", "audit_logs"]) {
      expect(names).toContain(t);
    }
  });

  it("enforces case-insensitive unique staff emails", async () => {
    await db.insert(users).values({ email: "Admin@Example.test", name: "A", passwordHash: "x" });
    await expect(
      db.insert(users).values({ email: "admin@example.TEST", name: "B", passwordHash: "x" }),
    ).rejects.toThrow();
  });

  it("creates events with the default hold duration and currency", async () => {
    const [e] = await db
      .insert(events)
      .values({ name: "Test", slug: "t", year: 2026, bookingRefPrefix: "YMR26-ACM" })
      .returning();
    expect(e?.holdMinutes).toBe(15);
    expect(e?.currency).toBe("NGN");
    expect(e?.bookingSeq).toBe(0);
  });
});

describe("audit_logs is append-only", () => {
  let id: number;
  beforeAll(async () => {
    const [row] = await db
      .insert(auditLogs)
      .values({ actorLabel: "system", action: "test.created", entityType: "test" })
      .returning();
    id = row!.id;
  });

  it("allows inserts", () => expect(id).toBeGreaterThan(0));

  it("rejects UPDATE", async () => {
    await expect(db.update(auditLogs).set({ action: "tampered" }).where(eq(auditLogs.id, id))).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/append-only/) },
    });
  });
  it("rejects DELETE", async () => {
    await expect(db.delete(auditLogs).where(eq(auditLogs.id, id))).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/append-only/) },
    });
  });
  it("rejects TRUNCATE", async () => {
    await expect(client.exec("truncate table audit_logs")).rejects.toThrow(/append-only/);
  });
});
