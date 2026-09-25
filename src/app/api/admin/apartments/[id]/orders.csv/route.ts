import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth/session";
import { csvCell } from "@/lib/admin/reports";
import { getApartmentOrders } from "@/lib/inventory/apartments";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const { id } = await params;
    const rows = await getApartmentOrders(actor, id);
    if (!rows) return NextResponse.json({ error: "Apartment not found." }, { status: 404 });
    const columns = ["Booking reference", "Created at", "Booker", "Phone", "Email", "Quantity", "Amount minor units", "Payment status", "Stay status"];
    const lines = [columns, ...rows.map((row) => [row.reference, row.createdAt, row.name, row.phone, row.email, row.quantity, row.amountMinor, row.paymentStatus, row.stayStatus])].map((line) => line.map(csvCell).join(","));
    return new NextResponse(`\uFEFF${lines.join("\r\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=apartment-orders.csv", "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to export orders." }, { status: 403 });
  }
}
