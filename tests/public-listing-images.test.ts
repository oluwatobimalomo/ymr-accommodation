import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { events } from "@/db/schema";

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
vi.mock("@/db/client", () => ({ getDb: () => testDb }));

const { listActiveCategoriesForLodge } = await import("@/lib/booking/queries");
const { createLodge } = await import("@/lib/inventory/lodges");
const { createApartment } = await import("@/lib/inventory/apartments");
const { computeGrants } = await import("@/lib/authz/authorize");
const { ROLE_DEFINITIONS } = await import("@/lib/authz/roles");

let eventId: string;
const admin = (() => {
  const def = ROLE_DEFINITIONS.find((r) => r.key === "accommodation_admin")!;
  return {
    userId: "00000000-0000-0000-0000-000000000011",
    email: "a@a.test",
    name: "A",
    roleKeys: ["accommodation_admin"],
    ...computeGrants([def]),
    lodgeIds: new Set<string>(),
  };
})();

beforeAll(async () => {
  client = new PGlite();
  testDb = drizzle(client);
  await migrate(testDb, { migrationsFolder: "./drizzle" });
  const [event] = await testDb
    .insert(events)
    .values({ name: "T", slug: "public-listing-test", year: 2026, bookingRefPrefix: "T-ACM" })
    .returning();
  eventId = event!.id;
});
afterAll(() => client.close());

describe("listActiveCategoriesForLodge", () => {
  it("surfaces each category's real apartment photo instead of nothing/placeholder", async () => {
    const lodge = await createLodge(admin, { eventId, name: "L", slug: "public-listing-lodge" });
    await createApartment(admin, {
      lodgeId: lodge.id,
      name: "Female Dormitory",
      mode: "SHARED",
      priceNaira: 5000,
      genderRestriction: "FEMALE",
      bedspaceCount: 4,
      images: ["data:image/png;base64,AAAA"],
    });
    await createApartment(admin, {
      lodgeId: lodge.id,
      name: "Male Dormitory",
      mode: "SHARED",
      priceNaira: 5000,
      genderRestriction: "MALE",
      bedspaceCount: 4,
      // no image uploaded for this one
    });

    const categories = await listActiveCategoriesForLodge(lodge.id);
    const female = categories.find((c) => c.name === "Female Dormitory");
    const male = categories.find((c) => c.name === "Male Dormitory");

    expect(female!.image).toBe("data:image/png;base64,AAAA");
    expect(male!.image).toBeUndefined(); // no fake shared placeholder value
    expect(female!.image).not.toBe(male!.image); // the original bug: both showed the same thing
  });
});
