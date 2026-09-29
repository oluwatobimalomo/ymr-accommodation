import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { lodges } from "@/db/schema";
import { can } from "@/lib/authz/authorize";
import { getCurrentActor } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestedIndex = new URL(request.url).searchParams.get("index");
  const imageIndex = requestedIndex === null ? 0 : Number(requestedIndex);
  if (!Number.isInteger(imageIndex) || imageIndex < 0) return new Response(null, { status: 404 });

  const [lodge] = await getDb().select({
    image: sql<string | null>`${lodges.images}[${imageIndex + 1}]`,
    status: lodges.status,
  }).from(lodges).where(eq(lodges.id, id)).limit(1);
  if (!lodge?.image) return new Response(null, { status: 404 });
  if (lodge.status !== "ACTIVE") {
    const actor = await getCurrentActor();
    if (!actor || !can(actor, "inventory.read", { lodgeId: id })) return new Response(null, { status: 404 });
  }
  const source = lodge.image;
  const match = source?.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return Response.redirect(new URL("/ymr-mark.png", request.url), 302);
  return new Response(Buffer.from(match[2]!, "base64"), {
    headers: {
      "Content-Type": match[1]!,
      "Cache-Control": lodge.status === "ACTIVE" ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
