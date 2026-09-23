import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { ImageThumb } from "@/components/ImageThumb";
import { getLodgeBySlug, listActiveCategoriesForLodge } from "@/lib/booking/queries";

export const dynamic = "force-dynamic";

export default async function LodgePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lodge = await getLodgeBySlug(slug);
  if (!lodge) notFound();
  const categories = await listActiveCategoriesForLodge(lodge.id);

  return (
    <div className="stack">
      <p>
        <Link href="/accommodation">&larr; All accommodation</Link>
      </p>
      <h1>{lodge.name}</h1>
      {lodge.description && <p>{lodge.description}</p>}
      {lodge.address && <p>{lodge.address}</p>}

      <h2>Available categories</h2>
      {categories.length === 0 ? (
        <p>No categories are open for booking here yet.</p>
      ) : (
        <div className="grid">
          {categories.map((c) => (
            <Link key={c.id} href={`/booking/${c.id}`} className="listing-card">
              <ImageThumb src={c.image} alt={c.name} aspect="4/3" />
              <div className="listing-body">
                <h3>{c.name}</h3>
                <div className="badge-row">
                  <Badge tone="brand">{c.mode === "PRIVATE" ? "Private" : "Shared"}</Badge>
                  {c.genderRestriction !== "ANY" && <Badge tone="navy">{c.genderRestriction === "MALE" ? "Male only" : "Female only"}</Badge>}
                </div>
                <p className="listing-price">
                  {(c.defaultPriceMinor / 100).toLocaleString()} / {c.pricingModel === "PER_PERSON" ? "person" : "unit"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
