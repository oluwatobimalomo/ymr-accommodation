import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { getStaffAccessNotification } from "@/lib/admin/staff";
import { countOpenTickets, getLatestTicketNotification } from "@/lib/support/tickets";

export async function GET() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Sign in required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const [latest, openCount, staffAccess] = await Promise.all([
      getLatestTicketNotification(actor),
      countOpenTickets(actor),
      can(actor, "users.manage") ? getStaffAccessNotification(actor) : Promise.resolve(null),
    ]);
    return NextResponse.json({ latest, openCount, staffAccess }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ error: "Support alerts unavailable" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
