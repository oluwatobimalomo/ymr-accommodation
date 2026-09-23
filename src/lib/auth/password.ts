import { hash, verify } from "@node-rs/argon2";

// argon2id parameters (OWASP-aligned baseline). Tune against Vercel function memory.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Verified against when the email is unknown, so timing does not reveal which emails exist. */
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword("not-a-real-password-placeholder");
  return dummy;
}

export const MIN_PASSWORD_LENGTH = 12;
