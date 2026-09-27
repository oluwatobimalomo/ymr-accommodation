import { NextResponse } from "next/server";
import { z } from "zod";
import { attemptLogin } from "@/lib/auth/login";
import { clientIp, isSameOrigin } from "@/lib/auth/origin";
import { createSession } from "@/lib/auth/session";

const Body = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) });

function back(request: Request, error: string, loginPath: "/admin/login" | "/staff/login") {
  return NextResponse.redirect(new URL(`${loginPath}?error=${error}`, request.url), 303);
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  const form = await request.formData();
  const loginPath = form.get("loginPath") === "/staff/login" ? "/staff/login" : "/admin/login";
  const parsed = Body.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return back(request, "invalid", loginPath);

  const meta = { ip: clientIp(request), userAgent: request.headers.get("user-agent") };
  const result = await attemptLogin(parsed.data.email, parsed.data.password, meta);
  if (!result.ok) return back(request, result.reason, loginPath);

  await createSession(result.userId, meta);
  return NextResponse.redirect(new URL("/admin", request.url), 303);
}
