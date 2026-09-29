import { isIP } from "node:net";

/**
 * CSRF defence for cookie-authenticated POSTs, on top of SameSite=Lax:
 * the Origin header must match the configured app origin.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  // Outside production (local dev, previews), compare against the request's
  // own origin so this works on localhost regardless of what APP_ORIGIN is
  // set to. In production, require the exact configured origin.
  const expected = process.env.NODE_ENV === "production" ? process.env.APP_ORIGIN : undefined;
  if (expected) return origin === expected;
  return origin === new URL(request.url).origin;
}

export function clientIp(request: Request): string | null {
  // Vercel overwrites x-forwarded-for with the connecting client address.
  // On other hosts this header is client-controlled unless a trusted proxy is configured.
  if (process.env.VERCEL !== "1") return null;
  const value = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return value && value.length <= 64 && isIP(value) ? value : null;
}
