import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth/session";
import { getBookingsDashboard } from "@/lib/booking/admin-queries";
import { csvCell } from "@/lib/admin/reports";

export const dynamic = "force-dynamic";

const columns = {
  reference: ["Reference", (r: Record<string, any>) => r.reference],
  createdAt: ["Order date", (r: Record<string, any>) => r.createdAt],
  name: ["Customer name", (r: Record<string, any>) => r.bookerName],
  phone: ["Phone number", (r: Record<string, any>) => r.bookerPhone],
  email: ["Email address", (r: Record<string, any>) => r.bookerEmail],
  lodge: ["Lodge", (r: Record<string, any>) => r.lodgeName],
  apartment: ["Apartment", (r: Record<string, any>) => r.categoryName],
  amount: ["Amount paid", (r: Record<string, any>) => r.amountMinor / 100],
  payment: ["Order status", (r: Record<string, any>) => r.paymentStatus],
  stay: ["Accommodation status", (r: Record<string, any>) => r.accommodationStatus],
} as const;

export async function GET(request: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const selected = params.getAll("column").filter((key): key is keyof typeof columns => key in columns);
  const keys = selected.length ? [...new Set(selected)] : Object.keys(columns) as Array<keyof typeof columns>;
  try {
    const data = await getBookingsDashboard(actor, { status: params.get("status") ?? undefined, lodgeId: params.get("lodgeId") ?? undefined, from: params.get("from") ?? undefined, to: params.get("to") ?? undefined, all: true });
    const canSeeFinancials = actor.globalPermissions.has("payment.read") || actor.scopedPermissions.has("payment.read");
    const permittedKeys = canSeeFinancials ? keys : keys.filter((key) => key !== "amount" && key !== "payment");
    const lines = [[...permittedKeys.map((key) => columns[key][0])], ...data.rows.map((row) => permittedKeys.map((key) => columns[key][1](row as never)))].map((line) => line.map((value) => csvCell(value)).join(","));
    return new NextResponse(`\uFEFF${lines.join("\r\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=ymr-bookings.csv", "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to export bookings." }, { status: 403 });
  }
}
