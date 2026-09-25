import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processPendingEmails } from "@/lib/email/outbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || provided.length !== secret.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    return NextResponse.json(await processPendingEmails(4), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Email outbox job failed:", error);
    return NextResponse.json({ error: "Email outbox processing failed." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
