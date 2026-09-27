import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { lodges, roles, sessions, staffAccessRequests, userLodgeAssignments, userRoles, users } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { authorize, type Actor } from "@/lib/authz/authorize";
import { ROLE_DEFINITIONS, type RoleKey } from "@/lib/authz/roles";

const assignableRoles = ROLE_DEFINITIONS.filter((role) => role.key !== "super_admin");
const validRoleKeys = new Set(assignableRoles.map((role) => role.key));

function normalizeStaffInput(input: { name: string; email: string; roleKey: string; lodgeIds: string[] }, requireLodges = true) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const role = assignableRoles.find((item) => item.key === input.roleKey);
  const lodgeIds = [...new Set(input.lodgeIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (name.length < 2 || name.length > 120) throw new Error("Enter a staff name between 2 and 120 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Enter a valid staff email address.");
  if (!role || !validRoleKeys.has(input.roleKey as RoleKey)) throw new Error("Choose a valid staff role.");
  if (requireLodges && role.lodgeScoped && lodgeIds.length === 0) throw new Error("Assign a Lodge Coordinator to at least one lodge.");
  return { name, email, role, lodgeIds: role.lodgeScoped ? lodgeIds : [] };
}

export async function getStaffDirectory(actor: Actor) {
  authorize(actor, "users.manage");
  const db = getDb();
  const [staff, lodgeRows, requests] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email, status: users.status, roleKey: roles.key })
      .from(users).innerJoin(userRoles, eq(userRoles.userId, users.id)).innerJoin(roles, eq(roles.id, userRoles.roleId)).orderBy(users.name),
    db.select({ id: lodges.id, name: lodges.name, status: lodges.status }).from(lodges).orderBy(lodges.name),
    db.select({ id: staffAccessRequests.id, userId: users.id, name: users.name, email: users.email, requestedRole: staffAccessRequests.requestedRole, createdAt: staffAccessRequests.createdAt })
      .from(staffAccessRequests).innerJoin(users, eq(users.id, staffAccessRequests.userId)).where(eq(staffAccessRequests.status, "PENDING")).orderBy(staffAccessRequests.createdAt),
  ]);
  const assignments = await db.select().from(userLodgeAssignments);
  return {
    staff: staff.map((user) => ({ ...user, lodgeIds: assignments.filter((assignment) => assignment.userId === user.id).map((assignment) => assignment.lodgeId) })),
    requests,
    lodges: lodgeRows,
    roles: assignableRoles,
  };
}

/** Public self-registration: save a password, but grant no role or session before admin approval. */
export async function createStaffAccessRequest(input: { name: string; email: string; password: string; roleKey: string }) {
  if (input.roleKey !== "accommodation_officer" && input.roleKey !== "accommodation_overseer") throw new Error("Choose a valid staff role.");
  const profile = normalizeStaffInput({ ...input, lodgeIds: [] }, false);
  if (input.password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  const db = getDb();
  return db.transaction(async (tx) => {
    const duplicate = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${profile.email}`).limit(1);
    if (duplicate.length) throw new Error("An account or access request already uses that email address. Contact an administrator if you need help.");
    const passwordHash = await hashPassword(input.password);
    const [user] = await tx.insert(users).values({ name: profile.name, email: profile.email, passwordHash, status: "DISABLED" }).returning();
    if (!user) throw new Error("We could not save your access request. Please try again.");
    await tx.insert(staffAccessRequests).values({ userId: user.id, requestedRole: profile.role.key });
    await recordAudit(tx, { actor: null, action: "staff.access_requested", entityType: "user", entityId: user.id, after: { requestedRole: profile.role.key } });
    return user.id;
  });
}

export async function approveStaffAccessRequest(actor: Actor, input: { requestId: string; roleKey: string; lodgeIds: string[] }) {
  authorize(actor, "users.manage");
  authorize(actor, "roles.manage");
  if (!/^[0-9a-f-]{36}$/i.test(input.requestId)) throw new Error("Choose a valid access request.");
  if (input.roleKey !== "accommodation_officer" && input.roleKey !== "accommodation_overseer") throw new Error("Choose a valid staff role.");
  const roleDef = assignableRoles.find((role) => role.key === input.roleKey)!;
  const lodgeIds = [...new Set(input.lodgeIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (roleDef.lodgeScoped && lodgeIds.length === 0) throw new Error("Assign at least one lodge before approving a Lodge Coordinator.");
  if (!roleDef.lodgeScoped && lodgeIds.length) throw new Error("Accommodation Overseers automatically cover all lodges; clear lodge selections.");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [request] = await tx.select().from(staffAccessRequests).where(and(eq(staffAccessRequests.id, input.requestId), eq(staffAccessRequests.status, "PENDING"))).for("update").limit(1);
    if (!request) throw new Error("That request is no longer pending.");
    if (lodgeIds.length) {
      const validLodges = await tx.select({ id: lodges.id }).from(lodges).where(inArray(lodges.id, lodgeIds));
      if (validLodges.length !== lodgeIds.length) throw new Error("One or more selected lodges are invalid.");
    }
    const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.key, roleDef.key)).limit(1);
    if (!role) throw new Error("The staff role is not installed. Run the database seed to sync system roles.");
    await tx.update(users).set({ status: "ACTIVE", updatedAt: new Date() }).where(eq(users.id, request.userId));
    await tx.insert(userRoles).values({ userId: request.userId, roleId: role.id });
    if (lodgeIds.length) await tx.insert(userLodgeAssignments).values(lodgeIds.map((lodgeId) => ({ userId: request.userId, lodgeId, assignedBy: actor.userId })));
    await tx.update(staffAccessRequests).set({ status: "APPROVED", reviewedBy: actor.userId, reviewedAt: new Date() }).where(eq(staffAccessRequests.id, request.id));
    await recordAudit(tx, { actor, action: "staff.access_approved", entityType: "user", entityId: request.userId, after: { role: roleDef.key, lodgeIds } });
  });
}

export async function rejectStaffAccessRequest(actor: Actor, requestId: string) {
  authorize(actor, "users.manage");
  authorize(actor, "roles.manage");
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("Choose a valid access request.");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [request] = await tx.select().from(staffAccessRequests).where(and(eq(staffAccessRequests.id, requestId), eq(staffAccessRequests.status, "PENDING"))).for("update").limit(1);
    if (!request) throw new Error("That request is no longer pending.");
    await tx.update(staffAccessRequests).set({ status: "REJECTED", reviewedBy: actor.userId, reviewedAt: new Date() }).where(eq(staffAccessRequests.id, request.id));
    await recordAudit(tx, { actor, action: "staff.access_rejected", entityType: "user", entityId: request.userId });
  });
}

export async function createStaffUser(actor: Actor, input: { name: string; email: string; password: string; roleKey: string; lodgeIds: string[] }) {
  authorize(actor, "users.manage");
  authorize(actor, "roles.manage");
  const staff = normalizeStaffInput(input);
  if (input.password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  const db = getDb();
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const duplicate = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${staff.email}`).limit(1);
    if (duplicate.length) throw new Error("A staff account already uses that email address.");
    if (staff.lodgeIds.length) {
      const validLodges = await tx.select({ id: lodges.id }).from(lodges).where(inArray(lodges.id, staff.lodgeIds));
      if (validLodges.length !== staff.lodgeIds.length) throw new Error("One or more selected lodges are invalid.");
    }
    const [user] = await tx.insert(users).values({ name: staff.name, email: staff.email, passwordHash }).returning();
    const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.key, staff.role.key)).limit(1);
    if (!user || !role) throw new Error("The staff role is not installed. Run the database seed to sync system roles.");
    await tx.insert(userRoles).values({ userId: user.id, roleId: role.id });
    if (staff.lodgeIds.length) await tx.insert(userLodgeAssignments).values(staff.lodgeIds.map((lodgeId) => ({ userId: user.id, lodgeId, assignedBy: actor.userId })));
    await recordAudit(tx, { actor, action: "staff.created", entityType: "user", entityId: user.id, after: { name: user.name, email: user.email, role: staff.role.key, lodgeIds: staff.lodgeIds } });
    return user;
  });
}

export async function updateStaffUser(actor: Actor, input: { userId: string; name: string; roleKey: string; lodgeIds: string[]; status: string }) {
  authorize(actor, "users.manage");
  authorize(actor, "roles.manage");
  if (!/^[0-9a-f-]{36}$/i.test(input.userId)) throw new Error("Choose a valid staff account.");
  if (input.userId === actor.userId) throw new Error("Use another Super Admin account to change your own access.");
  if (input.status !== "ACTIVE" && input.status !== "DISABLED") throw new Error("Choose a valid account status.");
  const staff = normalizeStaffInput({ name: input.name, email: "staff@example.test", roleKey: input.roleKey, lodgeIds: input.lodgeIds });
  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(users).where(eq(users.id, input.userId)).for("update").limit(1);
    if (!before) throw new Error("That staff account could not be found.");
    if ((await tx.select({ id: userRoles.userId }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(and(eq(userRoles.userId, input.userId), eq(roles.key, "super_admin"))).limit(1)).length) {
      throw new Error("Super Admin accounts cannot be changed from the staff access page.");
    }
    if (staff.lodgeIds.length) {
      const validLodges = await tx.select({ id: lodges.id }).from(lodges).where(inArray(lodges.id, staff.lodgeIds));
      if (validLodges.length !== staff.lodgeIds.length) throw new Error("One or more selected lodges are invalid.");
    }
    const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.key, staff.role.key)).limit(1);
    if (!role) throw new Error("The staff role is not installed. Run the database seed to sync system roles.");
    const [after] = await tx.update(users).set({ name: staff.name, status: input.status as "ACTIVE" | "DISABLED", updatedAt: new Date() }).where(eq(users.id, input.userId)).returning();
    await tx.delete(userRoles).where(eq(userRoles.userId, input.userId));
    await tx.insert(userRoles).values({ userId: input.userId, roleId: role.id });
    await tx.delete(userLodgeAssignments).where(eq(userLodgeAssignments.userId, input.userId));
    if (staff.lodgeIds.length) await tx.insert(userLodgeAssignments).values(staff.lodgeIds.map((lodgeId) => ({ userId: input.userId, lodgeId, assignedBy: actor.userId })));
    await tx.delete(sessions).where(eq(sessions.userId, input.userId));
    await recordAudit(tx, { actor, action: "staff.access_updated", entityType: "user", entityId: input.userId, before: { name: before.name, status: before.status }, after: { name: after!.name, status: after!.status, role: staff.role.key, lodgeIds: staff.lodgeIds } });
    return after;
  });
}
