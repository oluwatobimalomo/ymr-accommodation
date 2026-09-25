import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth/session";
import { getBookingReport, csvCell } from "@/lib/admin/reports";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!actor.globalPermissions.has("reports.export") && !actor.scopedPermissions.has("reports.export")) return NextResponse.json({ error: "You do not have permission to export reports." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const report = await getBookingReport(actor, { from: params.get("from") ?? undefined, to: params.get("to") ?? undefined, eventId: params.get("event") ?? undefined });
  const columns = ["Booking reference", "Created at", "Event", "Lodge", "Apartment", "Booker name", "Booker phone", "Booker email", "Guests", "Payment status", "Accommodation status", "Allocation status", "Amount minor units", "Currency"];
  const lines = [columns, ...report.rows.map((row) => [row.reference, row.createdAt, row.eventName, row.lodgeName, row.categoryName, row.bookerName, row.bookerPhone, row.bookerEmail, row.occupantCount, row.paymentStatus, row.accommodationStatus, row.allocationStatus, row.amountMinor, row.currency])].map((line) => line.map(csvCell).join(","));
  return new NextResponse(`\uFEFF${lines.join("\r\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=ymr-bookings-report.csv", "Cache-Control": "no-store" } });
}
