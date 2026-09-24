import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { ImageThumb } from "@/components/ImageThumb";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { getLodgeBySlug, listActiveCategoriesForLodge } from "@/lib/booking/queries";
import { formatNaira } from "@/lib/format-currency";
import { formatDateOnly } from "@/lib/format-date";

export const dynamic = "force-dynamic";

export default async function LodgePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; sort?: string }> }) {
  const [{ slug }, { q, sort }] = await Promise.all([params, searchParams]);
  const lodge = await getLodgeBySlug(slug);
  if (!lodge) notFound();
  const allCategories = await listActiveCategoriesForLodge(lodge.id);
  const query = q?.trim().toLocaleLowerCase() ?? "";
  const categories = allCategories
    .filter((category) => !query || category.name.toLocaleLowerCase().includes(query))
    .sort((a, b) => {
      if (sort === "price-asc") return a.defaultPriceMinor - b.defaultPriceMinor || a.name.localeCompare(b.name);
      if (sort === "price-desc") return b.defaultPriceMinor - a.defaultPriceMinor || a.name.localeCompare(b.name);
      if (sort === "name-desc") return b.name.localeCompare(a.name);
      return a.name.localeCompare(b.name);
    });
  const privateCategories = categories.filter((category) => category.mode === "PRIVATE");
  const sharedCategories = categories.filter((category) => category.mode === "SHARED");

  function CategoryCards({ items }: { items: typeof categories }) {
    const bedLabel = (specification: string) => /\bbed\b/i.test(specification) ? specification : `${specification} Bed`;
    const accommodationType = (name: string) => /chalet/i.test(name) ? "Chalet" : /single\s*room|room/i.test(name) ? "Single Room" : "Private apartment";
    return (
      <div className="grid">
        {items.map((c) => (
          <Link key={c.id} href={`/booking/${c.id}`} className="listing-card">
            {/* The card heading already names the apartment; keep its image decorative for assistive technology. */}
            <ImageThumb src={c.image} alt="" aspect="4/3" />
            <div className="listing-body">
              <h3>{c.name}</h3>
              <div className="badge-row">
                <Badge tone="brand">{c.mode === "PRIVATE" ? "Private" : "Shared"}</Badge>
                {c.genderRestriction !== "ANY" && <Badge tone="navy">{c.genderRestriction === "MALE" ? "Male only" : "Female only"}</Badge>}
              </div>
              <p className="listing-meta">{c.mode === "PRIVATE" ? accommodationType(c.name) : "Shared accommodation"}</p>
              {c.facilities.some((facility) => /air conditioner|air conditioning|\bac\b/i.test(facility)) && <p className="listing-meta">AC</p>}
              {!c.facilities.some((facility) => /air conditioner|air conditioning|\bac\b/i.test(facility)) && c.facilities.some((facility) => /fan/i.test(facility)) && <p className="listing-meta">Fan</p>}
              {c.bedSpecifications.length > 0 && <p className="listing-meta">{c.bedSpecifications.map(bedLabel).join(", ")}</p>}
              {c.checkInDate && c.checkOutDate && <p className="stay-date-line">{formatDateOnly(c.checkInDate, { day: "numeric", month: "short" })} – {formatDateOnly(c.checkOutDate, { day: "numeric", month: "short", year: "numeric" })}</p>}
              <p className="listing-price">
                <span className="price-unit">Price</span> <strong>{formatNaira(c.defaultPriceMinor)}</strong>
              </p>
            </div>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="stack">
      <p>
        <Link href="/accommodation">&larr; All accommodation</Link>
      </p>
      <div className="page-intro">
        <span className="eyebrow">Explore this property</span>
        <h1>{lodge.name}</h1>
        {lodge.description && <p>{lodge.description}</p>}
        {lodge.address && <p>{lodge.address}</p>}
      </div>

      {allCategories.length > 0 && (
        <form method="get" className="directory-tools" role="search">
          <div className="directory-search-group"><label className="directory-search"><span className="sr-only">Search apartments</span><input name="q" type="search" defaultValue={q} placeholder="Search apartments by name" /></label><button className="btn secondary" type="submit">Search</button></div>
          <label className="directory-sort"><span>Sort by</span><AutoSubmitSelect name="sort" defaultValue={sort ?? "name-asc"} options={[
            { value: "name-asc", label: "Name: A to Z" }, { value: "name-desc", label: "Name: Z to A" }, { value: "price-asc", label: "Price: lowest first" }, { value: "price-desc", label: "Price: highest first" },
          ]} /></label>
        </form>
      )}

      {allCategories.length === 0 ? (
        <section className="stack">
          <h2>Available apartments</h2>
          <p>No categories are open for booking here yet.</p>
        </section>
      ) : categories.length === 0 ? (
        <p>No apartments match “{q}”. Try another name.</p>
      ) : (
        <div className="stack apartment-sections">
          {privateCategories.length > 0 && (
            <section className="stack">
              <h2>Private apartments</h2>
              <CategoryCards items={privateCategories} />
            </section>
          )}
          {sharedCategories.length > 0 && (
            <section className="stack">
              <h2>Shared apartments</h2>
              <CategoryCards items={sharedCategories} />
            </section>
          )}
        </div>
      )}
      <aside className="ensuite-note"><strong>NB:</strong> All apartments are ensuite and come with a private restroom/toilet.</aside>
    </div>
  );
}
