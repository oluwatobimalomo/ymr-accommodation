import { createHash } from "node:crypto";
import { lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { publicRequestLimits } from "@/db/schema";
import { clientIp } from "@/lib/auth/origin";

export interface PublicLimitPolicy {
  /** Stable label for the endpoint/bucket; do not put personal data here. */
  scope: string;
  identity?: string;
  /** Prevent one caller from exhausting another person's identity bucket. Requires a trusted client IP. */
  bindIdentityToIp?: boolean;
  maxRequests: number;
  windowMs: number;
}

function digest(value: string) {
  return createHash("sha256").update(`${process.env.RATE_LIMIT_KEY ?? process.env.DATABASE_URL ?? "ymr-public-rate-limit-v1"}:${value}`).digest("hex");
}

async function consume(key: string, maxRequests: number, windowMs: number, now: Date) {
  const staleBefore = new Date(now.getTime() - windowMs);
  const [bucket] = await getDb().insert(publicRequestLimits).values({
    key: digest(key), windowStartedAt: now, requestCount: 1, expiresAt: new Date(now.getTime() + windowMs),
  }).onConflictDoUpdate({
    target: publicRequestLimits.key,
    set: {
      windowStartedAt: sql`CASE WHEN ${publicRequestLimits.windowStartedAt} <= ${staleBefore} THEN ${now} ELSE ${publicRequestLimits.windowStartedAt} END`,
      requestCount: sql`CASE WHEN ${publicRequestLimits.windowStartedAt} <= ${staleBefore} THEN 1 ELSE ${publicRequestLimits.requestCount} + 1 END`,
      expiresAt: sql`CASE WHEN ${publicRequestLimits.windowStartedAt} <= ${staleBefore} THEN ${new Date(now.getTime() + windowMs)} ELSE ${publicRequestLimits.expiresAt} END`,
    },
  }).returning({ count: publicRequestLimits.requestCount, startedAt: publicRequestLimits.windowStartedAt });
  if (Math.random() < 0.01) {
    await getDb().delete(publicRequestLimits).where(lte(publicRequestLimits.expiresAt, now));
  }
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket!.startedAt.getTime() + windowMs - now.getTime()) / 1000));
  return { allowed: bucket!.count <= maxRequests, retryAfterSeconds };
}

/**
 * Atomic database-backed fixed windows shared across app instances.
 * IP policies and IP-bound identity policies use only a trusted platform IP.
 * Pure identity policies can also be used when caller-specific buckets are appropriate.
 */
export async function enforcePublicRateLimits(request: Request, policies: PublicLimitPolicy[]) {
  const ip = clientIp(request);
  const now = new Date();
  for (const policy of policies) {
    const identity = policy.identity?.trim().toLowerCase();
    if (policy.identity !== undefined && !identity) continue;
    if (policy.identity === undefined && !ip) continue;
    if (policy.bindIdentityToIp && !ip) continue;
    const bucketId = policy.identity === undefined
      ? `ip:${ip}`
      : policy.bindIdentityToIp
        ? `identity:${ip}:${identity}`
        : `identity:${identity}`;
    const result = await consume(`${policy.scope}:${bucketId}`, policy.maxRequests, policy.windowMs, now);
    if (!result.allowed) return result;
  }
  return { allowed: true as const, retryAfterSeconds: 0 };
}

export function normalizeRateLimitPhone(value: string) {
  return value.replace(/\D/g, "");
}
