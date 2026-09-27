import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { events, lodges, roles, staffAccessRequests, userLodgeAssignments, userRoles, users } from "@/db/schema";
import { computeGrants } from "@/lib/authz/authorize";
import { ROLE_DEFINITIONS } from "@/lib/authz/roles";

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
vi.mock("@/db/client", () => ({ getDb: () => testDb }));

const adminId = "00000000-0000-0000-0000-0000000000a1";
let lodgeId: string;
const adminRole = ROLE_DEFINITIONS.find((role) => role.key === "super_admin")!;
const admin = { userId: adminId, email: "admin@example.test", name: "Admin", roleKeys: ["super_admin"], ...computeGrants([adminRole]), lodgeIds: new Set<string>() };

beforeAll(async () => {
  client = new PGlite();
  testDb = drizzle(client);
  await migrate(testDb, { migrationsFolder: "./drizzle" });
  await testDb.insert(users).values({ id: adminId, email: admin.email, name: admin.name, passwordHash: "not-used" });
  for (const roleKey of ["accommodation_officer", "accommodation_overseer"]) {
    const role = ROLE_DEFINITIONS.find((definition) => definition.key === roleKey)!;
    await testDb.insert(roles).values({ key: role.key, name: role.name, description: role.description, lodgeScoped: role.lodgeScoped }).onConflictDoNothing({ target: roles.key });
  }
  const [event] = await testDb.insert(events).values({ name: "Staff test", slug: "staff-test", year: 2026, bookingRefPrefix: "STAFF" }).returning();
  const [lodge] = await testDb.insert(lodges).values({ eventId: event!.id, name: "Test Lodge", slug: "test-lodge" }).returning();
  lodgeId = lodge!.id;
});
afterAll(() => client.close());

const { approveStaffAccessRequest, createStaffAccessRequest, rejectStaffAccessRequest } = await import("@/lib/admin/staff");

describe("self-service staff access approval", () => {
  it("keeps a new request disabled and role-less until approval, then scopes the coordinator to approved lodges", async () => {
    await createStaffAccessRequest({ name: "Lodge Coordinator", email: "coordinator@example.test", password: "A-strong-password-123", roleKey: "accommodation_officer" });
    const [user] = await testDb.select().from(users).where(eq(users.email, "coordinator@example.test"));
    const [request] = await testDb.select().from(staffAccessRequests).where(eq(staffAccessRequests.userId, user!.id));
    expect(user?.status).toBe("DISABLED");
    expect(await testDb.select().from(userRoles).where(eq(userRoles.userId, user!.id))).toHaveLength(0);

    await approveStaffAccessRequest(admin, { requestId: request!.id, roleKey: "accommodation_officer", lodgeIds: [lodgeId] });
    expect((await testDb.select().from(users).where(eq(users.id, user!.id)))[0]?.status).toBe("ACTIVE");
    expect((await testDb.select().from(userLodgeAssignments).where(eq(userLodgeAssignments.userId, user!.id))).map((row) => row.lodgeId)).toEqual([lodgeId]);
    expect((await testDb.select().from(staffAccessRequests).where(eq(staffAccessRequests.id, request!.id)))[0]?.status).toBe("APPROVED");
  });

  it("approves an Overseer without lodge assignments and rejects requests without granting access", async () => {
    await createStaffAccessRequest({ name: "Overseer", email: "overseer@example.test", password: "A-strong-password-123", roleKey: "accommodation_overseer" });
    const [overseer] = await testDb.select().from(users).where(eq(users.email, "overseer@example.test"));
    const [overseerRequest] = await testDb.select().from(staffAccessRequests).where(eq(staffAccessRequests.userId, overseer!.id));
    await approveStaffAccessRequest(admin, { requestId: overseerRequest!.id, roleKey: "accommodation_overseer", lodgeIds: [] });
    expect((await testDb.select().from(users).where(eq(users.id, overseer!.id)))[0]?.status).toBe("ACTIVE");
    expect(await testDb.select().from(userLodgeAssignments).where(eq(userLodgeAssignments.userId, overseer!.id))).toHaveLength(0);

    await createStaffAccessRequest({ name: "Declined", email: "declined@example.test", password: "A-strong-password-123", roleKey: "accommodation_officer" });
    const [declined] = await testDb.select().from(users).where(eq(users.email, "declined@example.test"));
    const [declinedRequest] = await testDb.select().from(staffAccessRequests).where(eq(staffAccessRequests.userId, declined!.id));
    await rejectStaffAccessRequest(admin, declinedRequest!.id);
    expect((await testDb.select().from(users).where(eq(users.id, declined!.id)))[0]?.status).toBe("DISABLED");
    expect((await testDb.select().from(staffAccessRequests).where(eq(staffAccessRequests.id, declinedRequest!.id)))[0]?.status).toBe("REJECTED");
  });
});
