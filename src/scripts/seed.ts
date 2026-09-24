import "./load-env";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, facilities, lodges, permissions, rolePermissions, roles, userRoles, users } from "@/db/schema";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { computeGrants, type Actor } from "@/lib/authz/authorize";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { ROLE_DEFINITIONS } from "@/lib/authz/roles";
import { createBedspace } from "@/lib/inventory/bedspaces";
import { createCategory } from "@/lib/inventory/categories";
import { createLodge } from "@/lib/inventory/lodges";
import { createRoom } from "@/lib/inventory/rooms";
import { createUnit, setUnitFacilities } from "@/lib/inventory/units";

async function main() {
  const db = getDb();

  // Permissions (idempotent)
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await db.insert(permissions).values({ key, description }).onConflictDoUpdate({
      target: permissions.key,
      set: { description },
    });
  }

  // Roles and their permission sets (idempotent; re-running re-syncs system roles)
  for (const def of ROLE_DEFINITIONS) {
    const [role] = await db
      .insert(roles)
      .values({ key: def.key, name: def.name, description: def.description, lodgeScoped: def.lodgeScoped })
      .onConflictDoUpdate({
        target: roles.key,
        set: { name: def.name, description: def.description, lodgeScoped: def.lodgeScoped },
      })
      .returning();
    if (!role) throw new Error(`Could not upsert role ${def.key}`);
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
    await db
      .insert(rolePermissions)
      .values(def.permissions.map((permissionKey) => ({ roleId: role.id, permissionKey })));
  }

  // Event. Dates are left empty (set them in Admin > Events once that exists).
  // Status is force-set to OPEN on every seed run: there's no admin events UI
  // yet to change it, and DRAFT would silently block every booking attempt.
  const [seededEvent] = await db
    .insert(events)
    .values({
      name: "Young Ministers Retreat 2026",
      slug: "ymr-2026",
      year: 2026,
      status: "OPEN",
      currency: "NGN",
      bookingRefPrefix: "YMR26-ACM",
    })
    .onConflictDoUpdate({ target: events.slug, set: { status: "OPEN" } })
    .returning();
  const eventId = seededEvent!.id;

  // First Super Admin
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  let seedAdminUserId: string | null = null;
  if (email && password) {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`SEED_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!existing) {
      const [user] = await db
        .insert(users)
        .values({ email, name: "Super Admin", passwordHash: await hashPassword(password) })
        .returning();
      const [role] = await db.select().from(roles).where(eq(roles.key, "super_admin")).limit(1);
      if (user && role) await db.insert(userRoles).values({ userId: user.id, roleId: role.id });
      seedAdminUserId = user!.id;
      console.log(`Created Super Admin ${email}`);
    } else {
      seedAdminUserId = existing.id;
      console.log(`Super Admin ${email} already exists; left unchanged.`);
    }
  }
  // Standard facility list (section 7 of the brief). Configurable — more can
  // be added later from Admin > Facilities without a code change.
  const standardFacilities = [
    "Bed",
    "Fan",
    "Air Conditioner",
    "Television",
    "Refrigerator",
    "Reading Table/Chair",
    "Upholstery",
    "Water Heater",
  ];
  for (const [i, name] of standardFacilities.entries()) {
    await db.insert(facilities).values({ name, sortOrder: i }).onConflictDoNothing({ target: facilities.name });
  }

  // Demo/fake accommodation data (brief section 51) so the admin and public
  // pages have something real to look at before actual lodges are entered.
  // Clearly fake names, guarded by slug so re-running seed never duplicates it.
  const seedActor: Actor = seedAdminUserId
    ? {
        userId: seedAdminUserId,
        email: email ?? "seed@ymr.local",
        name: "Seed Script",
        roleKeys: ["super_admin"],
        ...computeGrants([ROLE_DEFINITIONS.find((r) => r.key === "super_admin")!]),
        lodgeIds: new Set<string>(),
      }
    : {
        userId: "00000000-0000-0000-0000-000000000000",
        email: "seed@ymr.local",
        name: "Seed Script",
        roleKeys: ["super_admin"],
        ...computeGrants([ROLE_DEFINITIONS.find((r) => r.key === "super_admin")!]),
        lodgeIds: new Set<string>(),
      };

  const allFacilities = await db.select().from(facilities);
  const fan = allFacilities.find((f) => f.name === "Fan");
  const ac = allFacilities.find((f) => f.name === "Air Conditioner");

  async function lodgeExists(slug: string): Promise<boolean> {
    const [row] = await db.select().from(lodges).where(eq(lodges.slug, slug)).limit(1);
    return !!row;
  }

  if (!(await lodgeExists("white-house-lotto"))) {
    const lodge = await createLodge(seedActor, {
      eventId,
      name: "White House Lotto",
      slug: "white-house-lotto",
      description: "Demo lodge — shared bedspace accommodation with male and female sections.",
      address: "Tree of Righteous, Lotto (demo address)",
    });

    const maleCategory = await createCategory(seedActor, {
      lodgeId: lodge.id,
      name: "Male Shared",
      mode: "SHARED",
      genderRestriction: "MALE",
      pricingModel: "PER_PERSON",
      defaultPriceMinor: 5_000_00,
      description: "Shared bedspace in a male-only building.",
    });
    const buildingA = await createUnit(seedActor, { categoryId: maleCategory.id, name: "Building A", code: "A" });
    if (fan) await setUnitFacilities(seedActor, buildingA.id, [fan.id]);
    for (let r = 1; r <= 3; r++) {
      const room = await createRoom(seedActor, {
        unitId: buildingA.id,
        name: `Room ${r}`,
        code: `R${r}`,
        genderRestriction: "MALE",
      });
      for (const letter of ["A", "B", "C", "D"]) await createBedspace(seedActor, room.id, letter);
    }

    const femaleCategory = await createCategory(seedActor, {
      lodgeId: lodge.id,
      name: "Female Shared",
      mode: "SHARED",
      genderRestriction: "FEMALE",
      pricingModel: "PER_PERSON",
      defaultPriceMinor: 5_000_00,
      description: "Shared bedspace in a female-only building.",
    });
    const buildingB = await createUnit(seedActor, { categoryId: femaleCategory.id, name: "Building B", code: "B" });
    if (fan) await setUnitFacilities(seedActor, buildingB.id, [fan.id]);
    for (let r = 1; r <= 2; r++) {
      const room = await createRoom(seedActor, {
        unitId: buildingB.id,
        name: `Room ${r}`,
        code: `R${r}`,
        genderRestriction: "FEMALE",
      });
      for (const letter of ["A", "B", "C", "D"]) await createBedspace(seedActor, room.id, letter);
    }
    console.log("Seeded demo lodge: White House Lotto (Male/Female Shared)");
  }

  if (!(await lodgeExists("shiloh-apartments"))) {
    const lodge = await createLodge(seedActor, {
      eventId,
      name: "Shiloh Apartments",
      slug: "shiloh-apartments",
      description: "Demo lodge — private, self-contained chalets.",
      address: "Shiloh Estate (demo address)",
    });
    const privateCategory = await createCategory(seedActor, {
      lodgeId: lodge.id,
      name: "Private",
      mode: "PRIVATE",
      pricingModel: "PER_UNIT",
      defaultPriceMinor: 15_000_00,
      description: "A self-contained chalet, booked as a whole.",
    });
    for (const [name, capacity] of [
      ["Chalet A", 4],
      ["Chalet B", 4],
      ["Chalet C", 2],
    ] as const) {
      const unit = await createUnit(seedActor, {
        categoryId: privateCategory.id,
        name,
        code: name.replace("Chalet ", "CH"),
        capacity,
      });
      if (ac) await setUnitFacilities(seedActor, unit.id, [ac.id]);
    }
    console.log("Seeded demo lodge: Shiloh Apartments (Private)");
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
