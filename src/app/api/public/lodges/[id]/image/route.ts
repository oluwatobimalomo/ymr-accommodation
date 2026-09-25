import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { lodges } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [lodge] = await getDb().select({ image: lodges.images, status: lodges.status }).from(lodges).where(eq(lodges.id, id)).limit(1);
  if (lodge?.status !== "ACTIVE") return new Response(null, { status: 404 });
  const source = lodge?.image[0];
  const match = source?.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return Response.redirect(new URL("/ymr-mark.png", request.url), 302);
  return new Response(Buffer.from(match[2]!, "base64"), {
    headers: {
      "Content-Type": match[1]!,
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
