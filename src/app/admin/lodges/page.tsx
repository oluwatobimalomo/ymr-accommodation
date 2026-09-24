import Link from "next/link";
import { ErrorBanner } from "@/components/AdminChrome";
import { ImageThumb } from "@/components/ImageThumb";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { listLodges } from "@/lib/inventory/lodges";
import { formatNaira } from "@/lib/format-currency";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lodges" };

export default async function LodgesPage({ searchParams }: { searchParams: Promise<{ error?: string; q?: string; sort?: string }> }) {
  const actor = await requireActor();
  const { error, q, sort } = await searchParams;
  const query = q?.trim().toLocaleLowerCase() ?? "";
  const lodges = (await listLodges())
    .filter((lodge) => !query || `${lodge.name} ${lodge.address}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => {
      if (sort === "name-desc") return b.name.localeCompare(a.name);
      if (sort === "price-asc" || sort === "price-desc") {
        if (a.minimumPriceMinor === null) return b.minimumPriceMinor === null ? a.name.localeCompare(b.name) : 1;
        if (b.minimumPriceMinor === null) return -1;
        return (sort === "price-asc" ? 1 : -1) * (a.minimumPriceMinor - b.minimumPriceMinor) || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });
  const canCreate = can(actor, "inventory.write");

  return (
    <div className="stack">
      <div className="admin-page-heading">
        <div><span className="eyebrow">Property inventory</span><h1>Lodges</h1><p>Manage properties and their apartment listings.</p></div>
        {canCreate && <Link className="btn" href="/admin/lodges/new">Add a lodge</Link>}
      </div>
      <ErrorBanner error={error} />

      <form method="get" className="directory-tools" role="search">
        <div className="directory-search-group"><label className="directory-search"><span className="sr-only">Search lodges</span><input name="q" type="search" defaultValue={q} placeholder="Search lodges by name or address" /></label><button className="btn secondary" type="submit">Search</button></div>
        <label className="directory-sort"><span>Sort by</span><AutoSubmitSelect name="sort" defaultValue={sort ?? "name-asc"} options={[{ value: "name-asc", label: "Name: A to Z" }, { value: "name-desc", label: "Name: Z to A" }, { value: "price-asc", label: "Price: lowest first" }, { value: "price-desc", label: "Price: highest first" }]} /></label>
      </form>

      {lodges.length === 0 ? (
        <p>{query ? `No lodges match “${q}”. Try another name or address.` : "No lodges yet. Add the first one to start building the accommodation catalogue."}</p>
      ) : (
        <div className="grid">
          {lodges.map((lodge) => (
            <Link key={lodge.id} href={`/admin/lodges/${lodge.id}`} className="listing-card">
              <ImageThumb src={lodge.mainImage} alt={lodge.name} aspect="16/10" />
              <div className="listing-body">
                <h3>{lodge.name}</h3>
                <p className="listing-meta">
                  {lodge.status === "ACTIVE" ? "Active" : "Inactive"}
                  {lodge.address ? ` · ${lodge.address}` : ""}
                </p>
                {lodge.minimumPriceMinor !== null && <p className="listing-price">From {formatNaira(lodge.minimumPriceMinor)} <span className="price-unit">lowest listed rate</span></p>}
              </div>
            </Link>
          ))}
        </div>
      )}

    </div>
  );
}
