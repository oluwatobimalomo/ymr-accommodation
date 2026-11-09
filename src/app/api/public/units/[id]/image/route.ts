import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accommodationCategories, accommodationUnits, events, lodges } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestedIndex = new URL(request.url).searchParams.get("index");
  const imageIndex = requestedIndex === null ? 0 : Number(requestedIndex);
  if (!Number.isInteger(imageIndex) || imageIndex < 0) return new Response(null, { status: 404 });

  const [unit] = await getDb().select({
    image: sql<string | null>`${accommodationUnits.images}[${imageIndex + 1}]`,
  }).from(accommodationUnits)
    .innerJoin(accommodationCategories, eq(accommodationCategories.id, accommodationUnits.categoryId))
    .innerJoin(lodges, eq(lodges.id, accommodationCategories.lodgeId))
    .innerJoin(events, eq(events.id, lodges.eventId))
    .where(and(
      eq(accommodationUnits.id, id),
      eq(accommodationUnits.status, "ACTIVE"),
      eq(accommodationCategories.status, "ACTIVE"),
      eq(lodges.status, "ACTIVE"),
      eq(events.status, "OPEN"),
    )).limit(1);

  const match = unit?.image?.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return new Response(null, { status: 404 });

  return new Response(Buffer.from(match[2]!, "base64"), {
    headers: {
      "Content-Type": match[1]!,
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
