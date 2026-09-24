import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { ApartmentBrowser } from "@/components/ApartmentBrowser";
import { getLodgeBySlug, listActiveCategoriesForLodge } from "@/lib/booking/queries";

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
        <section className="stack apartment-sections">
          <h2>Available apartments</h2>
          <ApartmentBrowser apartments={categories} lodgeName={lodge.name} />
        </section>
      )}
      <aside className="ensuite-note"><strong>NB:</strong> All apartments are ensuite and come with a private restroom/toilet.</aside>
    </div>
  );
}
