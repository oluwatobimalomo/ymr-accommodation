import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { rolePermissions, roles, userRoles, users } from "@/db/schema";
import { computeGrants, type Actor } from "@/lib/authz/authorize";
import { ALL_PERMISSIONS, type Permission } from "@/lib/authz/permissions";

const KNOWN = new Set<string>(ALL_PERMISSIONS);

export async function loadActor(userId: string): Promise<Actor | null> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status !== "ACTIVE") return null;

  const userRoleRows = await db
    .select({ id: roles.id, key: roles.key, lodgeScoped: roles.lodgeScoped })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));

  const roleIds = userRoleRows.map((r) => r.id);
  const grantRows = roleIds.length
    ? await db
        .select({ roleId: rolePermissions.roleId, key: rolePermissions.permissionKey })
        .from(rolePermissions)
        .where(inArray(rolePermissions.roleId, roleIds))
    : [];

  const grants = computeGrants(
    userRoleRows.map((r) => ({
      lodgeScoped: r.lodgeScoped,
      // Unknown keys in the DB are ignored rather than trusted.
      permissions: grantRows
        .filter((g) => g.roleId === r.id && KNOWN.has(g.key))
        .map((g) => g.key as Permission),
    })),
  );

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    roleKeys: userRoleRows.map((r) => r.key),
    ...grants,
    // Phase 2 adds user_lodge_assignments. Until then scoped roles match no lodge (fail closed).
    lodgeIds: new Set<string>(),
  };
}
