import { cookies } from "next/headers";
import { eq, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sessions } from "@/db/schema";
import type { Actor } from "@/lib/authz/authorize";
import { loadActor } from "./actor";
import { generateSessionToken, hashSessionToken, SESSION_COOKIE, SESSION_TTL_MS } from "./tokens";

export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  const db = getDb();
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: hashSessionToken(token),
    userId,
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 400) ?? null,
  });
  // Opportunistic cleanup keeps the table small without a dedicated job.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Returns the signed-in staff actor, or null. Call from server components and route handlers. */
export async function getCurrentActor(): Promise<Actor | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = getDb();
  const id = hashSessionToken(token);
  const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  return loadActor(session.userId);
}

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await getDb().delete(sessions).where(eq(sessions.id, hashSessionToken(token)));
  jar.delete(SESSION_COOKIE);
}
