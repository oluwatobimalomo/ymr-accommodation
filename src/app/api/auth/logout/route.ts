import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/auth/origin";
import { destroyCurrentSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  await destroyCurrentSession();
  return NextResponse.redirect(new URL("/admin/login", request.url), 303);
}
