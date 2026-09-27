import { NextResponse } from "next/server";
import { z } from "zod";
import { createStaffAccessRequest } from "@/lib/admin/staff";
import { clientIp, isSameOrigin } from "@/lib/auth/origin";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { safeErrorMessage } from "@/lib/safe-error";

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
  try {
    await createStaffAccessRequest(parsed.data);
    return NextResponse.redirect(new URL("/staff?submitted=1", request.url), 303);
  } catch (error) {
    const message = safeErrorMessage(error);
    console.warn("Staff access request rejected", { ip: clientIp(request), message });
    const url = new URL("/staff", request.url);
    url.searchParams.set("error", message);
    return NextResponse.redirect(url, 303);
  }
}
