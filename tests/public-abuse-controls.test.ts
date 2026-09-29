import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accommodationCategories, bookingOrders, bookings, events, lodges, publicRequestLimits, supportTickets, users } from "@/db/schema";
import { clientIp } from "@/lib/auth/origin";

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: () => mockDb }));
vi.mock("@/lib/booking/queries", () => ({ getBookingByReference: mocks.lookup }));

let client: PGlite;
let mockDb: ReturnType<typeof drizzle>;
const originalVercel = process.env.VERCEL;
const { POST: lookupPost } = await import("@/app/api/booking/lookup/route");
const { POST: staffPost } = await import("@/app/api/staff/request-access/route");
const { POST: supportPost } = await import("@/app/api/support/create/route");

beforeAll(async () => {
  process.env.VERCEL = "1";
  client = new PGlite();
  mockDb = drizzle(client);
  await migrate(mockDb, { migrationsFolder: "./drizzle" });
  const [event] = await mockDb.insert(events).values({ name: "Lookup test", slug: "lookup-test", year: 2026, bookingRefPrefix: "LOOKUP" }).returning();
  const [lodge] = await mockDb.insert(lodges).values({ eventId: event!.id, name: "Lookup Lodge", slug: "lookup-lodge" }).returning();
  const [category] = await mockDb.insert(accommodationCategories).values({ lodgeId: lodge!.id, name: "Room 1", mode: "PRIVATE", pricingModel: "PER_UNIT", defaultPriceMinor: 900000 }).returning();
  await mockDb.insert(bookings).values({ eventId: event!.id, categoryId: category!.id, reference: "REF-1", bookerName: "Jane Doe", bookerPhone: "+2348000000000", bookerEmail: "jane@example.test", occupantCount: 1, amountMinor: 900000, currency: "NGN" });
});
afterAll(async () => {
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
  await client.close();
});
beforeEach(() => mocks.lookup.mockReset());

describe("trusted request identity", () => {
  it("does not trust forwarded headers outside Vercel and accepts a valid Vercel client address", () => {
    const previous = process.env.VERCEL;
    delete process.env.VERCEL;
    expect(clientIp(new Request("http://localhost", { headers: { "x-forwarded-for": "203.0.113.99" } }))).toBeNull();
    process.env.VERCEL = "1";
    expect(clientIp(new Request("http://localhost", { headers: { "x-forwarded-for": "203.0.113.99" } }))).toBe("203.0.113.99");
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  });
});

function jsonRequest(path: string, body: unknown, ip: string) {
  return new Request(`http://localhost${path}`, {
    method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body),
  });
}

function formRequest(path: string, fields: Record<string, string>, ip: string) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request(`http://localhost${path}`, { method: "POST", headers: { origin: "http://localhost", "x-forwarded-for": ip }, body: form });
}

const lookupResult = {
  booking: { reference: "REF-1", bookerPhone: "+2348000000000", bookerName: "Jane Doe", bookerEmail: "jane@example.test", amountMinor: 900000, paymentStatus: "PAID", accommodationStatus: "ALLOCATED", createdAt: new Date("2026-01-01T00:00:00Z") },
  giftRecipient: null,
  isGift: false,
  lodgeName: "Test Lodge",
  coordinatorName: "Coordinator",
  coordinatorPhone: "+2348111111111",
  categoryName: "Room A",
  checkInDate: "2026-12-01",
  checkOutDate: "2026-12-03",
  occupants: [{ name: "Jane Doe" }],
  bookerEmail: "jane@example.test",
  items: [],
};

describe("public booking lookup abuse controls", () => {
  it("allows a legitimate reference and phone, and gives the same 404 for invalid combinations", async () => {
    mocks.lookup.mockResolvedValueOnce(lookupResult).mockResolvedValueOnce(null).mockResolvedValueOnce(lookupResult);
    const valid = await lookupPost(jsonRequest("/api/booking/lookup", { ticketId: "REF-1", phone: "+2348000000000" }, "198.51.100.1"));
    expect(valid.status).toBe(200);
    expect((await valid.json()).guestName).toBe("Jane Doe");
    const missing = await lookupPost(jsonRequest("/api/booking/lookup", { ticketId: "NOPE", phone: "1" }, "198.51.100.2"));
    const wrongPhone = await lookupPost(jsonRequest("/api/booking/lookup", { ticketId: "REF-1", phone: "wrong" }, "198.51.100.3"));
    expect(missing.status).toBe(404);
    expect(wrongPhone.status).toBe(404);
    expect(await missing.json()).toEqual(await wrongPhone.json());
  });

  it("throttles repeated attempts across different references and phone guesses", async () => {
    mocks.lookup.mockResolvedValue(null);
    const responses = [];
    for (let i = 0; i < 31; i++) responses.push(await lookupPost(jsonRequest("/api/booking/lookup", { ticketId: `REF-${i}`, phone: `+234800000${i}` }, "198.51.100.10")));
    expect(responses[29]!.status).toBe(404);
    expect(responses[30]!.status).toBe(429);
    expect((await responses[30]!.json()).error).not.toMatch(/booking|reference|phone/i);
  });

  it("limits different phone guesses against one reference and blocks after the configured threshold", async () => {
    mocks.lookup.mockResolvedValue(null);
    const responses = [];
    for (let i = 0; i < 11; i++) responses.push(await lookupPost(jsonRequest("/api/booking/lookup", { ticketId: "SHARED-REF", phone: `+234800001${i}` }, "198.51.100.20")));
    expect(responses.slice(0, 10).every((response) => response.status === 404)).toBe(true);
    expect(responses[10]!.status).toBe(429);
    mocks.lookup.mockResolvedValueOnce(lookupResult);
    const separateReference = await lookupPost(jsonRequest("/api/booking/lookup", { ticketId: "REF-1", phone: "+2348000000000" }, "198.51.100.40"));
    expect(separateReference.status, await separateReference.clone().text()).toBe(200);
  });
});

describe("public staff registration abuse controls", () => {
  const staffFields = (email: string) => ({ name: "Test Staff", email, password: "A-strong-password-123", roleKey: "accommodation_overseer" });

  it("keeps successful and duplicate email submissions indistinguishable", async () => {
    const first = await staffPost(formRequest("/api/staff/request-access", staffFields("staff@example.test"), "198.51.100.50"));
    const duplicate = await staffPost(formRequest("/api/staff/request-access", staffFields("STAFF@example.test"), "198.51.100.50"));
    expect(first.headers.get("location")).toContain("submitted=1");
    expect(duplicate.headers.get("location")).toContain("submitted=1");
    expect(await mockDb.select().from(users).where(eq(users.email, "staff@example.test"))).toHaveLength(1);
  });

  it("rejects invalid data and rate-limits repeated email attempts", async () => {
    const invalid = await staffPost(formRequest("/api/staff/request-access", { ...staffFields("bad"), password: "short" }, "198.51.100.51"));
    expect(invalid.headers.get("location")).toContain("error=invalid");
    for (let i = 0; i < 3; i++) await staffPost(formRequest("/api/staff/request-access", staffFields("repeated@example.test"), "198.51.100.60"));
    const blocked = await staffPost(formRequest("/api/staff/request-access", staffFields("repeated@example.test"), "198.51.100.60"));
    expect(blocked.headers.get("location")).toContain("error=rate-limited");
  });
});

describe("public support booking ownership", () => {
  let bookingRef: string;
  let bookingId: string;
  let lodgeId: string;
  let eventId: string;
  let categoryId: string;

  beforeAll(async () => {
    const [event] = await mockDb.insert(events).values({ name: "Support security", slug: "support-security", year: 2026, bookingRefPrefix: "SEC" }).returning();
    eventId = event!.id;
    const [lodge] = await mockDb.insert(lodges).values({ eventId: event!.id, name: "Private Lodge", slug: "private-lodge" }).returning();
    lodgeId = lodge!.id;
    const [category] = await mockDb.insert(accommodationCategories).values({ lodgeId, name: "Room 1", mode: "PRIVATE", pricingModel: "PER_UNIT", defaultPriceMinor: 900000 }).returning();
    categoryId = category!.id;
    const [booking] = await mockDb.insert(bookings).values({ eventId: event!.id, categoryId: category!.id, reference: "SEC-OWNED-1", bookerName: "Jane Doe", bookerPhone: "+2348000000000", bookerEmail: "jane@example.test", occupantCount: 1, amountMinor: 900000, currency: "NGN" }).returning();
    bookingRef = booking!.reference;
    bookingId = booking!.id;
  });

  function supportFields(overrides: Partial<Record<string, string>> = {}) {
    return { bookingReference: bookingRef, customerName: "Jane Doe", customerEmail: "jane@example.test", customerPhone: "+2348000000000", category: "BOOKING", subject: "Help", description: "Please help.", ...overrides };
  }

  it("accepts the matching booking owner but refuses another person's contact details with the same generic result as an invalid reference", async () => {
    const good = await supportPost(formRequest("/api/support/create", supportFields(), "198.51.100.80"));
    expect(good.headers.get("location")).toContain("/support?reference=TKT-");
    const stored = await mockDb.select().from(supportTickets).where(eq(supportTickets.bookingId, bookingId));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.lodgeId).toBe(lodgeId);

    const wrongIdentity = await supportPost(formRequest("/api/support/create", supportFields({ customerName: "Someone Else", customerEmail: "other@example.test", customerPhone: "+2348999999999" }), "198.51.100.81"));
    const missingRef = await supportPost(formRequest("/api/support/create", supportFields({ bookingReference: "NOT-A-BOOKING" }), "198.51.100.82"));
    expect(decodeURIComponent(wrongIdentity.headers.get("location")!)).toContain("verify those booking details");
    expect(decodeURIComponent(missingRef.headers.get("location")!)).toContain("verify those booking details");
    expect(await mockDb.select().from(supportTickets).where(eq(supportTickets.bookingId, bookingId))).toHaveLength(1);
  });

  it("supports general requests without a booking reference and limits repeated submissions", async () => {
    const general = await supportPost(formRequest("/api/support/create", supportFields({ bookingReference: "" }), "198.51.100.90"));
    expect(general.headers.get("location")).toContain("/support?reference=TKT-");
    const repeated = [];
    for (let i = 0; i < 11; i++) repeated.push(await supportPost(formRequest("/api/support/create", supportFields({ bookingReference: "", customerEmail: `general-${i}@example.test` }), "198.51.100.91")));
    expect(repeated[9]!.headers.get("location")).toContain("/support?reference=TKT-");
    expect(decodeURIComponent(repeated[10]!.headers.get("location")!)).toContain("Too many requests");
    expect(await mockDb.select().from(publicRequestLimits)).not.toHaveLength(0);
  });

  it("verifies support requests submitted with a multi-booking order reference", async () => {
    const [order] = await mockDb.insert(bookingOrders).values({ eventId, reference: "SEC-ORDER-1", bookerName: "Jane Doe", bookerPhone: "+2348000000000", bookerEmail: "jane@example.test", amountMinor: 900000, currency: "NGN" }).returning();
    const [booking] = await mockDb.insert(bookings).values({ eventId, checkoutOrderId: order!.id, categoryId, reference: "SEC-ORDER-BOOKING-1", bookerName: "Jane Doe", bookerPhone: "+2348000000000", bookerEmail: "jane@example.test", occupantCount: 1, amountMinor: 900000, currency: "NGN" }).returning();
    const response = await supportPost(formRequest("/api/support/create", supportFields({ bookingReference: order!.reference }), "198.51.100.92"));
    expect(response.headers.get("location")).toContain("/support?reference=TKT-");
    const [ticket] = await mockDb.select().from(supportTickets).where(eq(supportTickets.bookingId, booking!.id));
    expect(ticket?.lodgeId).toBe(lodgeId);

    const [giftOrder] = await mockDb.insert(bookingOrders).values({ eventId, reference: "SEC-GIFT-ORDER", bookerName: "Booker", bookerPhone: "+2348111111111", bookerEmail: "booker@example.test", giftRecipientName: "Jane Doe", giftRecipientPhone: "+2348000000000", giftRecipientEmail: "jane@example.test", amountMinor: 900000, currency: "NGN" }).returning();
    const [giftBooking] = await mockDb.insert(bookings).values({ eventId, checkoutOrderId: giftOrder!.id, categoryId, reference: "SEC-GIFT-BOOKING", bookerName: "Booker", bookerPhone: "+2348111111111", bookerEmail: "booker@example.test", occupantCount: 1, amountMinor: 900000, currency: "NGN" }).returning();
    const giftRequest = await supportPost(formRequest("/api/support/create", supportFields({ bookingReference: giftBooking!.reference }), "198.51.100.93"));
    expect(giftRequest.headers.get("location")).toContain("/support?reference=TKT-");
    const [giftTicket] = await mockDb.select().from(supportTickets).where(eq(supportTickets.bookingId, giftBooking!.id));
    expect(giftTicket?.customerEmail).toBe("jane@example.test");
  });
});
