import { describe, expect, it } from "vitest";
import { authorize, can, computeGrants, ForbiddenError, type Actor } from "@/lib/authz/authorize";
import { ALL_PERMISSIONS, type Permission } from "@/lib/authz/permissions";
import { ROLE_DEFINITIONS, type RoleKey } from "@/lib/authz/roles";

/**
 * Explicit expectation for EVERY permission and EVERY role.
 * Adding a permission or role without updating this table fails the coverage tests below.
 * "O" = allowed (officer: only for an assigned lodge), "-" = denied.
 */
const S = "super_admin", A = "accommodation_admin", O = "accommodation_officer", G = "support_agent";
const MATRIX: Record<Permission, Record<RoleKey, "Y" | "-">> = {
  "inventory.read":       { [S]: "Y", [A]: "Y", [O]: "Y", [G]: "Y" },
  "inventory.write":      { [S]: "Y", [A]: "Y", [O]: "-", [G]: "-" },
  "inventory.block":      { [S]: "Y", [A]: "Y", [O]: "-", [G]: "-" },
  "pricing.write":        { [S]: "Y", [A]: "Y", [O]: "-", [G]: "-" },
  "capacity.write":       { [S]: "Y", [A]: "Y", [O]: "-", [G]: "-" },
  "booking.read":         { [S]: "Y", [A]: "Y", [O]: "Y", [G]: "Y" },
  "booking.cancel":       { [S]: "Y", [A]: "Y", [O]: "-", [G]: "-" },
  "booking.allocate":     { [S]: "Y", [A]: "Y", [O]: "-", [G]: "-" },
  "booking.reallocate":   { [S]: "Y", [A]: "Y", [O]: "-", [G]: "-" },
  "payment.read":         { [S]: "Y", [A]: "Y", [O]: "-", [G]: "Y" },
  "payment.reconcile":    { [S]: "Y", [A]: "Y", [O]: "-", [G]: "-" },
  "payment.refund_record":{ [S]: "Y", [A]: "Y", [O]: "-", [G]: "-" },
  "payment.override":     { [S]: "Y", [A]: "-", [O]: "-", [G]: "-" },
  "checkin.perform":      { [S]: "Y", [A]: "Y", [O]: "Y", [G]: "-" },
  "checkin.override":     { [S]: "Y", [A]: "Y", [O]: "-", [G]: "-" },
  "checkout.perform":     { [S]: "Y", [A]: "Y", [O]: "Y", [G]: "-" },
  "keys.read":            { [S]: "Y", [A]: "Y", [O]: "Y", [G]: "-" },
  "keys.issue":           { [S]: "Y", [A]: "Y", [O]: "Y", [G]: "-" },
  "keys.return":          { [S]: "Y", [A]: "Y", [O]: "Y", [G]: "-" },
  "keys.manage":          { [S]: "Y", [A]: "Y", [O]: "-", [G]: "-" },
  "support.create":       { [S]: "Y", [A]: "Y", [O]: "Y", [G]: "Y" },
  "support.read":         { [S]: "Y", [A]: "Y", [O]: "-", [G]: "Y" },
  "support.manage":       { [S]: "Y", [A]: "Y", [O]: "-", [G]: "Y" },
  "reports.read":         { [S]: "Y", [A]: "Y", [O]: "-", [G]: "-" },
  "reports.export":       { [S]: "Y", [A]: "Y", [O]: "-", [G]: "-" },
  "users.manage":         { [S]: "Y", [A]: "-", [O]: "-", [G]: "-" },
  "roles.manage":         { [S]: "Y", [A]: "-", [O]: "-", [G]: "-" },
  "settings.manage":      { [S]: "Y", [A]: "-", [O]: "-", [G]: "-" },
  "events.manage":        { [S]: "Y", [A]: "-", [O]: "-", [G]: "-" },
  "audit.read":           { [S]: "Y", [A]: "Y", [O]: "-", [G]: "-" },
};

const LODGE = "lodge-assigned";
const OTHER_LODGE = "lodge-other";

function actorFor(roleKey: RoleKey): Actor {
  const def = ROLE_DEFINITIONS.find((r) => r.key === roleKey)!;
  return {
    userId: "u1",
    email: "test@example.test",
    name: "Test",
    roleKeys: [roleKey],
    ...computeGrants([def]),
    lodgeIds: new Set([LODGE]),
  };
}

describe("matrix coverage (fails CI when incomplete)", () => {
  it("has a row for every permission and no stale rows", () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...ALL_PERMISSIONS].sort());
  });
  it("has a column for every defined role", () => {
    for (const p of ALL_PERMISSIONS) {
      expect(Object.keys(MATRIX[p]).sort()).toEqual(ROLE_DEFINITIONS.map((r) => r.key).sort());
    }
  });
});

describe("every role against every permission", () => {
  for (const def of ROLE_DEFINITIONS) {
    describe(def.name, () => {
      const actor = actorFor(def.key);
      for (const p of ALL_PERMISSIONS) {
        const expected = MATRIX[p][def.key] === "Y";
        it(`${expected ? "may" : "may NOT"} ${p}`, () => {
          // Lodge-scoped roles are tested against an assigned lodge, which is the most permissive case.
          expect(can(actor, p, { lodgeId: LODGE })).toBe(expected);
          if (!expected) expect(() => authorize(actor, p, { lodgeId: LODGE })).toThrow(ForbiddenError);
        });
      }
    });
  }
});

describe("lodge scoping (officer)", () => {
  const officer = actorFor("accommodation_officer");
  it("is denied for a lodge they are not assigned to", () => {
    expect(can(officer, "checkin.perform", { lodgeId: OTHER_LODGE })).toBe(false);
    expect(can(officer, "keys.issue", { lodgeId: OTHER_LODGE })).toBe(false);
  });
  it("fails closed when the resource has no lodge", () => {
    expect(can(officer, "checkin.perform")).toBe(false);
    expect(can(officer, "checkin.perform", { lodgeId: null })).toBe(false);
  });
  it("is denied everywhere when assigned to no lodges", () => {
    const unassigned: Actor = { ...officer, lodgeIds: new Set() };
    expect(can(unassigned, "checkin.perform", { lodgeId: LODGE })).toBe(false);
  });
  it("global roles are not restricted by lodge", () => {
    expect(can(actorFor("accommodation_admin"), "checkin.perform", { lodgeId: OTHER_LODGE })).toBe(true);
    expect(can(actorFor("accommodation_admin"), "checkin.perform")).toBe(true);
  });
  it("combining a scoped and an unscoped role never narrows the unscoped grant", () => {
    const admin = ROLE_DEFINITIONS.find((r) => r.key === "accommodation_admin")!;
    const officerDef = ROLE_DEFINITIONS.find((r) => r.key === "accommodation_officer")!;
    const grants = computeGrants([officerDef, admin]);
    expect(grants.globalPermissions.has("checkin.perform")).toBe(true);
    expect(grants.scopedPermissions.has("checkin.perform")).toBe(false);
  });
});

describe("role definitions", () => {
  it("never grant an unknown permission", () => {
    const known = new Set<string>(ALL_PERMISSIONS);
    for (const r of ROLE_DEFINITIONS) for (const p of r.permissions) expect(known.has(p)).toBe(true);
  });
  it("only the officer role is lodge-scoped", () => {
    expect(ROLE_DEFINITIONS.filter((r) => r.lodgeScoped).map((r) => r.key)).toEqual(["accommodation_officer"]);
  });
});
