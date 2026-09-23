import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "ymr_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h absolute lifetime for staff

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only the hash is stored, so a database leak cannot be replayed as a live session. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
