import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { events, lodges, supportTicketMessages, supportTickets } from "@/db/schema";
import { computeGrants } from "@/lib/authz/authorize";
import { ROLE_DEFINITIONS } from "@/lib/authz/roles";

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
vi.mock("@/db/client", () => ({ getDb: () => testDb }));

  const { createTicket, listTickets, getTicket, replyToTicket, setTicketStatus } = await import("@/lib/support/tickets");

beforeAll(async () => {
  client = new PGlite();
  testDb = drizzle(client);
  await migrate(testDb, { migrationsFolder: "./drizzle" });
});
afterAll(() => client.close());

function actorFor(roleKey: "support_agent" | "accommodation_officer") {
  const def = ROLE_DEFINITIONS.find((r) => r.key === roleKey)!;
  return {
    userId: "00000000-0000-0000-0000-0000000000dd",
    email: "s@s.test",
    name: "Support Agent",
    roleKeys: [roleKey],
    ...computeGrants([def]),
    lodgeIds: new Set<string>(),
  };
}

describe("support tickets", () => {
  it("a customer can create a ticket without authentication, and it starts OPEN with the customer's message logged", async () => {
    const ticket = await createTicket({
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      customerPhone: "+2348000000000",
      category: "PAYMENT",
      subject: "Payment not reflecting",
      description: "I paid but my booking still shows pending.",
    });
    expect(ticket.status).toBe("OPEN");
    expect(ticket.reference).toMatch(/^TKT-/);

    const messages = await testDb.select().from(supportTicketMessages).where(eq(supportTicketMessages.ticketId, ticket.id));
    expect(messages).toHaveLength(1);
    expect(messages[0]!.isStaff).toBe(false);
  });

  it("rejects an empty description", async () => {
    await expect(
      createTicket({ customerName: "X", customerEmail: "x@x.com", customerPhone: "+2348000000000", category: "GENERAL", subject: "Hi", description: "" }),
    ).rejects.toThrow(/describe/);
  });

  it("a support agent can list, view, reply to, and change the status of a ticket", async () => {
    const ticket = await createTicket({
      customerName: "Bob",
      customerEmail: "bob@example.com",
      customerPhone: "+2348000000000",
      category: "GENERAL",
      subject: "Question",
      description: "General question.",
    });
    const agent = actorFor("support_agent");

    const list = await listTickets(agent);
    expect(list.some((t) => t.id === ticket.id)).toBe(true);

    await replyToTicket(agent, ticket.id, "Thanks, looking into it.");
    const detail = await getTicket(agent, ticket.id);
    expect(detail!.messages).toHaveLength(2);
    expect(detail!.messages[1]!.isStaff).toBe(true);
    expect(detail!.messages[1]!.authorLabel).toBe("Support Agent");

    await setTicketStatus(agent, ticket.id, "RESOLVED");
    const [row] = await testDb.select().from(supportTickets).where(eq(supportTickets.id, ticket.id));
    expect(row!.status).toBe("RESOLVED");
  });

  it("denies a role without support.manage from replying or changing status", async () => {
    const ticket = await createTicket({
      customerName: "C",
      customerEmail: "c@c.com",
      customerPhone: "+2348000000000",
      category: "GENERAL",
      subject: "S",
      description: "D",
    });
    const officer = actorFor("accommodation_officer"); // scoped role with no assigned lodge in this test
    await expect(replyToTicket(officer, ticket.id, "reply")).rejects.toThrow(/permission/);
  });

  it("limits Lodge Coordinator support access to assigned lodges", async () => {
    const [event] = await testDb.insert(events).values({ name: "Support test", slug: "support-test", year: 2026, bookingRefPrefix: "TST" }).returning();
    const [assigned] = await testDb.insert(lodges).values({ eventId: event!.id, name: "Assigned lodge", slug: "assigned-lodge" }).returning();
    const [unassigned] = await testDb.insert(lodges).values({ eventId: event!.id, name: "Other lodge", slug: "other-lodge" }).returning();
    const ticketForAssigned = await createTicket({ lodgeId: assigned!.id, customerName: "A", customerEmail: "a@a.test", customerPhone: "1", category: "ACCOMMODATION", subject: "Assigned", description: "Assigned lodge request" });
    const ticketForOther = await createTicket({ lodgeId: unassigned!.id, customerName: "B", customerEmail: "b@b.test", customerPhone: "2", category: "ACCOMMODATION", subject: "Other", description: "Other lodge request" });
    const coordinator = { ...actorFor("accommodation_officer"), lodgeIds: new Set([assigned!.id]) };

    const tickets = await listTickets(coordinator);
    expect(tickets.map((ticket) => ticket.id)).toContain(ticketForAssigned.id);
    expect(tickets.map((ticket) => ticket.id)).not.toContain(ticketForOther.id);
    expect((await getTicket(coordinator, ticketForAssigned.id))?.ticket.id).toBe(ticketForAssigned.id);
    await expect(getTicket(coordinator, ticketForOther.id)).rejects.toThrow(/permission/);
    await expect(replyToTicket(coordinator, ticketForOther.id, "out of scope")).rejects.toThrow(/permission/);
  });
});
