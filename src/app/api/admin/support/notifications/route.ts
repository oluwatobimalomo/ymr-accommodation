import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth/session";
import { countOpenTickets, getLatestTicketNotification } from "@/lib/support/tickets";

export async function GET() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Sign in required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const [latest, openCount] = await Promise.all([getLatestTicketNotification(actor), countOpenTickets()]);
    return NextResponse.json({ latest, openCount }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ error: "Support alerts unavailable" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
