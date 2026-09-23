import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { dummyHash, verifyPassword } from "./password";

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

export type LoginResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "locked" };

/**
 * One generic failure message for unknown email, wrong password and disabled
 * accounts. Locked accounts are reported separately so staff know to wait.
 */
export async function attemptLogin(
  email: string,
  password: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<LoginResult> {
  const db = getDb();
  const normalized = email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`)
    .limit(1);

  if (!user) {
    await verifyPassword(await dummyHash(), password);
    return { ok: false, reason: "invalid" };
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return { ok: false, reason: "locked" };
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid || user.status !== "ACTIVE") {
    const failures = user.failedLoginCount + 1;
    const lock = failures >= MAX_FAILURES;
    await db
      .update(users)
      .set({
        failedLoginCount: lock ? 0 : failures,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MS) : null,
      })
      .where(eq(users.id, user.id));
    await recordAudit(db, {
      actor: null,
      action: lock ? "auth.locked" : "auth.login_failed",
      entityType: "user",
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { ok: false, reason: lock ? "locked" : "invalid" };
  }

  await db
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, user.id));
  await recordAudit(db, {
    actor: { userId: user.id, email: user.email },
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return { ok: true, userId: user.id };
}
