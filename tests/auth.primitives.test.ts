import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/tokens";
import { themeCss } from "@/theme/tokens";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(h, "wrong password entirely")).toBe(false);
  });
  it("returns false (not throws) for a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });
});

describe("session tokens", () => {
  it("generates unique high-entropy tokens", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
  });
  it("stores only a hash that differs from the token", () => {
    const t = generateSessionToken();
    const h = hashSessionToken(t);
    expect(h).not.toContain(t);
    expect(h).toHaveLength(64);
    expect(hashSessionToken(t)).toEqual(h);
  });
});

describe("theme", () => {
  it("emits CSS variables for every token group the stylesheet uses", () => {
    const css = themeCss();
    for (const v of ["--color-brand", "--color-brand-strong", "--color-on-brand", "--color-ink-muted", "--font-body", "--radius-md", "--space-4", "--layout-tap-target"]) {
      expect(css).toContain(v + ":");
    }
  });
});
