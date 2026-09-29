import { NextResponse } from "next/server";
import { z } from "zod";
import { createStaffAccessRequest } from "@/lib/admin/staff";
import { clientIp, isSameOrigin } from "@/lib/auth/origin";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { enforcePublicRateLimits } from "@/lib/auth/public-rate-limit";

const RequestBody = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  roleKey: z.enum(["accommodation_officer", "accommodation_overseer"]),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const form = await request.formData();
  const parsed = RequestBody.safeParse({ name: form.get("name"), email: form.get("email"), password: form.get("password"), roleKey: form.get("roleKey") });
  if (!parsed.success) return NextResponse.redirect(new URL("/staff?error=invalid", request.url), 303);
  const normalizedEmail = parsed.data.email.toLowerCase();
  try {
    const limits = await enforcePublicRateLimits(request, [
      { scope: "staff-registration-ip", maxRequests: 10, windowMs: 60 * 60_000 },
      { scope: "staff-registration-email", identity: normalizedEmail, bindIdentityToIp: true, maxRequests: 3, windowMs: 60 * 60_000 },
    ]);
    if (!limits.allowed) return NextResponse.redirect(new URL("/staff?error=rate-limited", request.url), 303);
    await createStaffAccessRequest(parsed.data);
    return NextResponse.redirect(new URL("/staff?submitted=1", request.url), 303);
  } catch (error) {
    const code = (error as { code?: string }).code;
    // The same public result for new and already-registered addresses avoids account enumeration.
    if (code === "23505") return NextResponse.redirect(new URL("/staff?submitted=1", request.url), 303);
    console.warn("Staff access request could not be saved", { ip: clientIp(request), code: code ?? "unknown" });
    return NextResponse.redirect(new URL("/staff?error=unavailable", request.url), 303);
  }
}
