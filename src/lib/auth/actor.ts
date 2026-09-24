import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { rolePermissions, roles, userRoles, users } from "@/db/schema";
import { computeGrants, type Actor } from "@/lib/authz/authorize";
import { ALL_PERMISSIONS, type Permission } from "@/lib/authz/permissions";

const KNOWN = new Set<string>(ALL_PERMISSIONS);

export async function loadActor(userId: string): Promise<Actor | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      status: users.status,
      roleId: roles.id,
      roleKey: roles.key,
      lodgeScoped: roles.lodgeScoped,
      permissionKey: rolePermissions.permissionKey,
    })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .where(eq(users.id, userId));
  const user = rows[0];
  if (!user || user.status !== "ACTIVE") return null;

  const roleMap = new Map<string, { key: string; lodgeScoped: boolean; permissions: Permission[] }>();
  for (const row of rows) {
    if (!row.roleId || !row.roleKey) continue;
    let role = roleMap.get(row.roleId);
    if (!role) {
      role = { key: row.roleKey, lodgeScoped: row.lodgeScoped ?? false, permissions: [] };
      roleMap.set(row.roleId, role);
    }
    if (row.permissionKey && KNOWN.has(row.permissionKey)) role.permissions.push(row.permissionKey as Permission);
  }
  const userRoleRows = [...roleMap.values()];

  const grants = computeGrants(
    userRoleRows.map((r) => ({
      lodgeScoped: r.lodgeScoped,
      permissions: r.permissions,
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
