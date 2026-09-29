import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accommodationUnits, bookingOrders, bookings, events } from "@/db/schema";

const paystackMocks = vi.hoisted(() => ({ initializeTransaction: vi.fn() }));

vi.mock("@/db/client", () => ({ getDb: () => testDb }));
vi.mock("@/lib/payments/paystack", () => ({ initializeTransaction: paystackMocks.initializeTransaction }));

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
let eventId: string;
let fixtureNumber = 0;

const { createBooking, createBookingOrder } = await import("@/lib/booking/create-booking");
const { createLodge } = await import("@/lib/inventory/lodges");
const { createCategory } = await import("@/lib/inventory/categories");
const { createUnit } = await import("@/lib/inventory/units");
const { createRoom } = await import("@/lib/inventory/rooms");
const { createBedspace } = await import("@/lib/inventory/bedspaces");
const { computeGrants } = await import("@/lib/authz/authorize");
const { ROLE_DEFINITIONS } = await import("@/lib/authz/roles");
const { POST: createCart } = await import("@/app/api/booking/create-cart/route");

const admin = (() => {
  const definition = ROLE_DEFINITIONS.find((role) => role.key === "accommodation_admin")!;
  return {
    userId: "00000000-0000-0000-0000-0000000000fa",
    email: "pricing@example.test",
    name: "Pricing Test",
    roleKeys: ["accommodation_admin"],
    ...computeGrants([definition]),
    lodgeIds: new Set<string>(),
  };
})();

beforeAll(async () => {
  client = new PGlite();
  testDb = drizzle(client);
  await migrate(testDb, { migrationsFolder: "./drizzle" });
  const [event] = await testDb.insert(events).values({
    name: "Pricing Test Event",
    slug: "pricing-test-event",
    year: 2026,
    bookingRefPrefix: "PRICE-ACM",
    status: "OPEN",
  }).returning();
  eventId = event!.id;
});

afterAll(() => client.close());
beforeEach(() => {
  paystackMocks.initializeTransaction.mockReset();
  paystackMocks.initializeTransaction.mockResolvedValue({
    authorizationUrl: "https://paystack.test/checkout",
    accessCode: "test-access-code",
    reference: "test-reference",
  });
});

async function makeCategory(mode: "PRIVATE" | "SHARED", pricingModel: "PER_UNIT" | "PER_PERSON", priceMinor: number) {
  const suffix = String(++fixtureNumber);
  const lodge = await createLodge(admin, { eventId, name: `Pricing Lodge ${suffix}`, slug: `pricing-lodge-${suffix}` });
  const category = await createCategory(admin, {
    lodgeId: lodge.id,
    name: `${mode} ${pricingModel}`,
    mode,
    genderRestriction: mode === "SHARED" ? "MALE" : "ANY",
    pricingModel,
    defaultPriceMinor: priceMinor,
  });
  const unit = await createUnit(admin, {
    categoryId: category.id,
    name: `Unit ${suffix}`,
    code: `U${suffix}A`,
    capacity: mode === "PRIVATE" ? 4 : 0,
  });

  if (mode === "SHARED") {
    const room = await createRoom(admin, { unitId: unit.id, name: "Room 1", code: "R1", genderRestriction: "MALE" });
    const first = await createBedspace(admin, room.id, "A");
    const second = await createBedspace(admin, room.id, "B");
    return { category, unit, bedspaceIds: [first.id, second.id] };
  }

  await createUnit(admin, { categoryId: category.id, name: `Unit ${suffix} B`, code: `U${suffix}B`, capacity: 4 });
  return { category, unit, bedspaceIds: [] as string[] };
}

function guest(name: string, bedspaceId?: string) {
  return { name, gender: "MALE" as const, bedspaceId };
}

function orderInput(items: Array<{ categoryId: string; occupants: ReturnType<typeof guest>[]; unitId?: string }>) {
  return {
    bookerName: "Booker",
    bookerPhone: "08000000000",
    bookerEmail: "booker@example.test",
    items,
  };
}

async function storedOrderAmount(reference: string) {
  const [row] = await testDb.select().from(bookingOrders).where(eq(bookingOrders.reference, reference));
  return row!.amountMinor;
}

describe("booking order pricing", () => {
  it("charges PER_PERSON once per occupant and stores the exact one-guest total", async () => {
    const { category, bedspaceIds } = await makeCategory("SHARED", "PER_PERSON", 725_00);
    const result = await createBookingOrder(orderInput([
      { categoryId: category.id, occupants: [guest("Guest A", bedspaceIds[0])] },
    ]));

    expect(result.amountMinor).toBe(725_00);
    expect(await storedOrderAmount(result.reference)).toBe(725_00);
    expect(result.bookings).toHaveLength(1);
    const [row] = await testDb.select().from(bookings).where(eq(bookings.id, result.bookings[0]!.bookingId));
    expect(row!.amountMinor).toBe(725_00);
  });

  it("charges PER_PERSON for every occupant in one shared booking", async () => {
    const { category, bedspaceIds } = await makeCategory("SHARED", "PER_PERSON", 725_00);
    const result = await createBookingOrder(orderInput([
      { categoryId: category.id, occupants: [guest("Guest A", bedspaceIds[0]), guest("Guest B", bedspaceIds[1])] },
    ]));

    expect(result.amountMinor).toBe(1_450_00);
    expect(await storedOrderAmount(result.reference)).toBe(1_450_00);
    const [row] = await testDb.select().from(bookings).where(eq(bookings.id, result.bookings[0]!.bookingId));
    expect(row!.amountMinor).toBe(1_450_00);
    expect(row!.occupantCount).toBe(2);
  });

  it("charges PER_UNIT once when several guests share one shared-accommodation booking", async () => {
    const { category, bedspaceIds } = await makeCategory("SHARED", "PER_UNIT", 900_00);
    const result = await createBookingOrder(orderInput([
      { categoryId: category.id, occupants: [guest("Guest A", bedspaceIds[0]), guest("Guest B", bedspaceIds[1])] },
    ]));

    expect(result.amountMinor).toBe(900_00);
    expect(await storedOrderAmount(result.reference)).toBe(900_00);
    const [row] = await testDb.select().from(bookings).where(eq(bookings.id, result.bookings[0]!.bookingId));
    expect(row!.amountMinor).toBe(900_00);
    expect(row!.occupantCount).toBe(2);
  });

  it("charges PER_UNIT once for a one-occupant private cart unit", async () => {
    const { category } = await makeCategory("PRIVATE", "PER_UNIT", 1_500_00);
    const [unit] = await testDb.select().from(accommodationUnits).where(eq(accommodationUnits.categoryId, category.id));
    const result = await createBookingOrder(orderInput([
      { categoryId: category.id, occupants: [guest("Guest A")], unitId: unit!.id },
    ]));

    expect(result.amountMinor).toBe(1_500_00);
    expect(await storedOrderAmount(result.reference)).toBe(1_500_00);
    const [row] = await testDb.select().from(bookings).where(eq(bookings.id, result.bookings[0]!.bookingId));
    expect(row!.amountMinor).toBe(1_500_00);
  });

  it("charges a private unit once for multiple occupants on one direct booking", async () => {
    const { category, unit } = await makeCategory("PRIVATE", "PER_UNIT", 1_500_00);
    const result = await createBooking({
      categoryId: category.id,
      bookerName: "Booker",
      bookerPhone: "08000000000",
      bookerEmail: "booker@example.test",
      unitId: unit.id,
      occupants: [guest("Guest A"), guest("Guest B")],
    });

    expect(result.amountMinor).toBe(1_500_00);
    const [row] = await testDb.select().from(bookings).where(eq(bookings.id, result.bookingId));
    expect(row!.amountMinor).toBe(1_500_00);
    expect(row!.occupantCount).toBe(2);
  });

  it("charges each private unit separately when multiple units are in one cart", async () => {
    const { category } = await makeCategory("PRIVATE", "PER_UNIT", 1_500_00);
    const units = await testDb.select().from(accommodationUnits).where(eq(accommodationUnits.categoryId, category.id));
    const result = await createBookingOrder(orderInput([
      { categoryId: category.id, occupants: [guest("Guest A")] },
      { categoryId: category.id, occupants: [guest("Guest B")] },
    ]));

    expect(units).toHaveLength(2);
    expect(result.amountMinor).toBe(3_000_00);
    expect(result.bookings).toHaveLength(2);
    expect(await storedOrderAmount(result.reference)).toBe(3_000_00);
    // Each generated booking stores one unit's amount; the checkout order stores their sum.
    expect(result.bookings.map((booking) => booking.amountMinor)).toEqual([1_500_00, 1_500_00]);
    const [order] = await testDb.select().from(bookingOrders).where(eq(bookingOrders.reference, result.reference));
    const persistedBookings = await testDb.select().from(bookings).where(eq(bookings.checkoutOrderId, order!.id));
    expect(persistedBookings.map((booking) => booking.amountMinor).sort((a, b) => a - b)).toEqual([1_500_00, 1_500_00]);
  });

  it("adds mixed per-person and per-unit listings using each listing's pricing rule", async () => {
    const shared = await makeCategory("SHARED", "PER_PERSON", 725_00);
    const privateCategory = await makeCategory("PRIVATE", "PER_UNIT", 1_500_00);
    const result = await createBookingOrder(orderInput([
      { categoryId: shared.category.id, occupants: [guest("Guest A", shared.bedspaceIds[0]), guest("Guest B", shared.bedspaceIds[1])] },
      { categoryId: privateCategory.category.id, occupants: [guest("Guest C")] },
    ]));

    expect(result.amountMinor).toBe(2_950_00);
    expect(await storedOrderAmount(result.reference)).toBe(2_950_00);
    expect(result.bookings.map((booking) => booking.amountMinor)).toEqual([1_450_00, 1_500_00]);
    const [order] = await testDb.select().from(bookingOrders).where(eq(bookingOrders.reference, result.reference));
    const persistedBookings = await testDb.select().from(bookings).where(eq(bookings.checkoutOrderId, order!.id));
    expect(persistedBookings.map((booking) => booking.amountMinor).sort((a, b) => a - b)).toEqual([1_450_00, 1_500_00]);
  });

  it("sends the calculated mixed-cart amount to Paystack initialization", async () => {
    const shared = await makeCategory("SHARED", "PER_PERSON", 725_00);
    const privateCategory = await makeCategory("PRIVATE", "PER_UNIT", 1_500_00);
    const previousSecret = process.env.PAYSTACK_SECRET_KEY;
    process.env.PAYSTACK_SECRET_KEY = "test-secret";

    try {
      const response = await createCart(new Request("http://localhost/api/booking/create-cart", {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({
          bookerName: "Booker",
          bookerPhone: "08000000000",
          bookerEmail: "booker@example.test",
          items: [
            { categoryId: shared.category.id, occupants: [guest("Guest A", shared.bedspaceIds[0]), guest("Guest B", shared.bedspaceIds[1])] },
            { categoryId: privateCategory.category.id, occupants: [guest("Guest C")] },
          ],
        }),
      }));

      expect(response.status).toBe(200);
      expect(paystackMocks.initializeTransaction).toHaveBeenCalledOnce();
      expect(paystackMocks.initializeTransaction.mock.calls[0]![0]).toMatchObject({ amountMinor: 2_950_00, currency: "NGN" });
    } finally {
      if (previousSecret === undefined) delete process.env.PAYSTACK_SECRET_KEY;
      else process.env.PAYSTACK_SECRET_KEY = previousSecret;
    }
  });
});
