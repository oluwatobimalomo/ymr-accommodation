import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { accommodationCategories, accommodationUnits, bedspaces, events, lodges, rooms } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const db = getDb();
  const rows = await db
    .select({
      bedspaceId: bedspaces.id,
      status: sql<"AVAILABLE" | "HELD" | "OCCUPIED" | "BLOCKED" | "MAINTENANCE" | "RETIRED">`
        CASE
          WHEN ${bedspaces.status} <> 'AVAILABLE' THEN ${bedspaces.status}::text
          WHEN EXISTS (
            SELECT 1
            FROM booking_occupants bo
            INNER JOIN bookings b ON b.id = bo.booking_id
            WHERE bo.bedspace_id = ${bedspaces.id}
              AND b.payment_status = 'PAID'
              AND b.accommodation_status <> 'CANCELLED'
          ) THEN 'OCCUPIED'
          WHEN EXISTS (
            SELECT 1 FROM inventory_holds h
            WHERE h.bedspace_id = ${bedspaces.id} AND h.expires_at > now()
          ) THEN 'HELD'
          ELSE 'AVAILABLE'
        END
      `,
    })
    .from(accommodationCategories)
    .innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId))
    .innerJoin(events, eq(events.id, lodges.eventId))
    .leftJoin(accommodationUnits, and(eq(accommodationUnits.categoryId, accommodationCategories.id), eq(accommodationUnits.status, "ACTIVE")))
    .leftJoin(rooms, and(eq(rooms.unitId, accommodationUnits.id), eq(rooms.status, "ACTIVE")))
    .leftJoin(bedspaces, eq(bedspaces.roomId, rooms.id))
    .where(and(
      eq(accommodationCategories.id, categoryId),
      eq(accommodationCategories.status, "ACTIVE"),
      eq(accommodationCategories.mode, "SHARED"),
      eq(accommodationCategories.customerSelectsBedspace, true),
      eq(lodges.status, "ACTIVE"),
      eq(events.status, "OPEN"),
    ));

  if (rows.length === 0) {
    return NextResponse.json({ error: "Booking option unavailable" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(
    { bedspaces: rows.filter((row): row is typeof row & { bedspaceId: string } => row.bedspaceId !== null).map(({ bedspaceId, status }) => ({ id: bedspaceId, status })) },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
