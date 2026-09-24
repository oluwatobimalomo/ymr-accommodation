import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorBanner } from "@/components/AdminChrome";
import { Badge } from "@/components/Badge";
import { ImageThumb } from "@/components/ImageThumb";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { listApartmentsForLodge } from "@/lib/inventory/apartments";
import { getLodge } from "@/lib/inventory/lodges";
import { formatNaira } from "@/lib/format-currency";

export const dynamic = "force-dynamic";

export default async function LodgeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; q?: string; sort?: string; success?: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;
  const { error, q, sort, success } = await searchParams;
  const lodge = await getLodge(id);
  if (!lodge) notFound();
  const query = q?.trim().toLocaleLowerCase() ?? "";
  const allApartments = await listApartmentsForLodge(id);
  const apartments = allApartments
    .filter((apartment) => !query || apartment.name.toLocaleLowerCase().includes(query))
    .sort((a, b) => {
      if (sort === "price-asc") return a.priceMinor - b.priceMinor || a.name.localeCompare(b.name);
      if (sort === "price-desc") return b.priceMinor - a.priceMinor || a.name.localeCompare(b.name);
      if (sort === "name-desc") return b.name.localeCompare(a.name);
      return a.name.localeCompare(b.name);
    });
  const privateApartments = apartments.filter((apartment) => apartment.mode === "PRIVATE");
  const sharedApartments = apartments.filter((apartment) => apartment.mode === "SHARED");
  const canWrite = can(actor, "inventory.write");

  function ApartmentCards({ items }: { items: typeof apartments }) {
    const bedLabel = (specification: string) => /\bbed\b/i.test(specification) ? specification : `${specification} Bed`;
    return (
      <div className="grid">
        {items.map((a) => (
          <Link key={a.unitId} href={`/admin/apartments/${a.unitId}`} className="listing-card">
            <ImageThumb src={a.image} alt={a.name} />
            <div className="listing-body">
              <h3>{a.name}</h3>
              <div className="badge-row">
                <Badge>{a.mode === "PRIVATE" ? "Private" : "Shared"}</Badge>
                {a.genderRestriction !== "ANY" && <Badge>{a.genderRestriction === "MALE" ? "Male" : "Female"}</Badge>}
              </div>
              <p className="listing-meta">{a.mode === "PRIVATE" ? (/chalet/i.test(a.name) ? "Chalet" : /single\s*room|room/i.test(a.name) ? "Single Room" : "Private apartment") : "Shared accommodation"}</p>
              {a.facilities.some((facility) => /air conditioner|air conditioning|\bac\b/i.test(facility)) ? <p className="listing-meta">AC</p> : a.facilities.some((facility) => /fan/i.test(facility)) ? <p className="listing-meta">Fan</p> : null}
              {a.bedSpecifications.length > 0 && <p className="listing-meta">{a.bedSpecifications.map(bedLabel).join(", ")}</p>}
              <p className="listing-price">
                <span className="price-unit">Price</span> <strong>{formatNaira(a.priceMinor)}</strong>
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
        <Link href="/admin/lodges">&larr; All lodges</Link>
      </p>
      <h1>{lodge.name}</h1>
      <ErrorBanner error={error} />
      {success === "apartment-created" && <p className="alert success" role="status">Apartment saved. It is now included in this lodge’s apartment list.</p>}
      <section className="card lodge-overview stack">
        <div className="admin-page-heading">
          <div><span className="eyebrow">Lodge details</span><h2>{lodge.status === "ACTIVE" ? "Active property" : "Inactive property"}</h2><p>{lodge.address || "No address added yet."}</p></div>
          <div className="lodge-actions">
            {canWrite && <Link className="btn secondary" href={`/admin/lodges/${lodge.id}/edit`}>Edit Lodge Details</Link>}
            {canWrite && <Link className="btn" href={`/admin/lodges/${lodge.id}/apartments/new`}>Add an Apartment</Link>}
          </div>
        </div>
        <div className="lodge-contact-summary">
          <span><strong>Coordinator</strong>{lodge.contactName || "Not provided"}</span>
          <span><strong>Phone</strong>{lodge.contactPhone || "Not provided"}</span>
          <span><strong>Distance to Old Auditorium</strong>{lodge.proximityKm ? `${lodge.proximityKm} km` : "Not provided"}</span>
        </div>
        {lodge.images.length > 0 && <div className="lodge-photo-strip">{lodge.images.map((src, i) => <ImageThumb key={i} src={src} alt={`${lodge.name} photo ${i + 1}`} aspect="16/10" />)}</div>}
      </section>

      <div className="admin-page-heading apartment-list-heading">
        <div><span className="eyebrow">Accommodation inventory</span><h2>Apartments</h2><p>Search and sort this lodge’s private and shared listings.</p></div>
      </div>
      {allApartments.length > 0 && (
        <form method="get" className="directory-tools" role="search">
          <div className="directory-search-group"><label className="directory-search"><span className="sr-only">Search apartments</span><input name="q" type="search" defaultValue={q} placeholder="Search apartments by name" /></label><button className="btn secondary" type="submit">Search</button></div>
          <label className="directory-sort"><span>Sort by</span><AutoSubmitSelect name="sort" defaultValue={sort ?? "name-asc"} options={[{ value: "name-asc", label: "Name: A to Z" }, { value: "name-desc", label: "Name: Z to A" }, { value: "price-asc", label: "Price: lowest first" }, { value: "price-desc", label: "Price: highest first" }]} /></label>
        </form>
      )}
      {allApartments.length === 0 ? (
        <p>No apartments yet. Add the first one below.</p>
      ) : apartments.length === 0 ? (
        <p>No apartments match “{q}”. Try another name.</p>
      ) : (
        <div className="stack apartment-sections">
          {privateApartments.length > 0 && <section className="stack"><h3>Private apartments</h3><ApartmentCards items={privateApartments} /></section>}
          {sharedApartments.length > 0 && <section className="stack"><h3>Shared apartments</h3><ApartmentCards items={sharedApartments} /></section>}
        </div>
      )}

    </div>
  );
}
