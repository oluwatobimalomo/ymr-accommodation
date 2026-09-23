import type { Permission } from "./permissions";

export interface Actor {
  userId: string;
  email: string;
  name: string;
  roleKeys: readonly string[];
  /** Permissions that apply everywhere. */
  globalPermissions: ReadonlySet<Permission>;
  /** Permissions that only apply to the lodges in `lodgeIds`. */
  scopedPermissions: ReadonlySet<Permission>;
  lodgeIds: ReadonlySet<string>;
}

export interface ResourceScope {
  lodgeId?: string | null;
}

export class ForbiddenError extends Error {
  readonly permission: Permission;
  constructor(permission: Permission) {
    super("You do not have permission to do this.");
    this.name = "ForbiddenError";
    this.permission = permission;
  }
}

/**
 * Fail-closed:
 *  - a global grant always allows;
 *  - a lodge-scoped grant allows only when the resource names a lodge the actor is assigned to;
 *  - a scoped grant with no lodge in the resource is DENIED (never assumed "everywhere").
 */
export function can(actor: Actor, permission: Permission, resource?: ResourceScope): boolean {
  if (actor.globalPermissions.has(permission)) return true;
  if (actor.scopedPermissions.has(permission)) {
    const lodgeId = resource?.lodgeId;
    return !!lodgeId && actor.lodgeIds.has(lodgeId);
  }
  return false;
}

export function authorize(actor: Actor, permission: Permission, resource?: ResourceScope): void {
  if (!can(actor, permission, resource)) throw new ForbiddenError(permission);
}

interface GrantSource {
  lodgeScoped: boolean;
  permissions: readonly Permission[];
}

/**
 * A permission is global if ANY of the actor's unscoped roles grants it;
 * otherwise it is scoped. Combining a scoped and an unscoped role therefore
 * never narrows access the unscoped role already gave.
 */
export function computeGrants(roles: readonly GrantSource[]) {
  const globalPermissions = new Set<Permission>();
  const scopedPermissions = new Set<Permission>();
  for (const role of roles) {
    for (const p of role.permissions) {
      (role.lodgeScoped ? scopedPermissions : globalPermissions).add(p);
    }
  }
  for (const p of globalPermissions) scopedPermissions.delete(p);
  return { globalPermissions, scopedPermissions };
}
