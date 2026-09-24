import Link from "next/link";
import { ImageThumb } from "@/components/ImageThumb";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { listActiveLodges } from "@/lib/booking/queries";
import { formatNaira } from "@/lib/format-currency";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accommodation" };

export default async function AccommodationPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string }> }) {
  const [{ q, sort }, allLodges] = await Promise.all([searchParams, listActiveLodges()]);
  const query = q?.trim().toLocaleLowerCase() ?? "";
  const lodges = allLodges
    .filter((lodge) => !query || `${lodge.name} ${lodge.description} ${lodge.address}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => {
      if (sort === "price-asc" || sort === "price-desc") {
        if (a.minimumPriceMinor === null) return b.minimumPriceMinor === null ? a.name.localeCompare(b.name) : 1;
        if (b.minimumPriceMinor === null) return -1;
        return (sort === "price-asc" ? 1 : -1) * (a.minimumPriceMinor - b.minimumPriceMinor) || a.name.localeCompare(b.name);
      }
      if (sort === "name-desc") return b.name.localeCompare(a.name);
      return a.name.localeCompare(b.name);
    });
  return (
    <div className="stack">
      <div className="page-intro">
        <span className="eyebrow">Find your stay</span>
        <h1>Accommodation</h1>
        <p>Browse trusted places to stay for the Young Ministers Retreat.</p>
      </div>
      {allLodges.length > 0 && (
        <form method="get" className="directory-tools" role="search">
          <div className="directory-search-group"><label className="directory-search"><span className="sr-only">Search accommodations</span><input name="q" type="search" defaultValue={q} placeholder="Search by lodge name or location" /></label><button className="btn secondary" type="submit">Search</button></div>
          <label className="directory-sort"><span>Sort by</span><AutoSubmitSelect name="sort" defaultValue={sort ?? "name-asc"} options={[
            { value: "name-asc", label: "Name: A to Z" }, { value: "name-desc", label: "Name: Z to A" }, { value: "price-asc", label: "Price: lowest first" }, { value: "price-desc", label: "Price: highest first" },
          ]} /></label>
        </form>
      )}
      {allLodges.length === 0 ? (
        <p>Accommodation options will appear here once booking opens.</p>
      ) : lodges.length === 0 ? (
        <p>No lodges match “{q}”. Try another name or location.</p>
      ) : (
        <div className="grid">
          {lodges.map((lodge) => (
            <Link key={lodge.id} href={`/accommodation/${lodge.slug}`} className="listing-card">
              <ImageThumb src={lodge.mainImage} alt={lodge.name} aspect="4/3" />
              <div className="listing-body">
                <h3>{lodge.name}</h3>
                <p className="listing-meta">{lodge.description || lodge.address || "See available rooms"}</p>
                {lodge.minimumPriceMinor !== null && <p className="listing-price">From {formatNaira(lodge.minimumPriceMinor)} <span className="price-unit">lowest available rate</span></p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
