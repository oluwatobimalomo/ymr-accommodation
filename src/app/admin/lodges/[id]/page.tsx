import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminNav, ErrorBanner } from "@/components/AdminChrome";
import { Badge } from "@/components/Badge";
import { ImageThumb } from "@/components/ImageThumb";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { listApartmentsForLodge } from "@/lib/inventory/apartments";
import { getLodge } from "@/lib/inventory/lodges";

export const dynamic = "force-dynamic";

export default async function LodgeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;
  const { error } = await searchParams;
  const lodge = await getLodge(id);
  if (!lodge) notFound();
  const apartments = await listApartmentsForLodge(id);
  const canWrite = can(actor, "inventory.write");

  return (
    <div className="stack">
      <AdminNav />
      <p>
        <Link href="/admin/lodges">&larr; All lodges</Link>
      </p>
      <h1>{lodge.name}</h1>
      <ErrorBanner error={error} />

      {canWrite && (
        <div className="card stack">
          <h2>Lodge details</h2>
          <form method="post" action={`/api/admin/lodges/${lodge.id}`} className="stack">
            <input type="hidden" name="intent" value="update" />
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" defaultValue={lodge.name} required />
            </div>
            <div className="field">
              <label htmlFor="address">Address</label>
              <input id="address" name="address" defaultValue={lodge.address} />
            </div>
            <div className="field">
              <label htmlFor="proximityKm">Proximity to Old Auditorium (km)</label>
              <input
                id="proximityKm"
                name="proximityKm"
                type="number"
                min="0"
                step="0.1"
                defaultValue={lodge.proximityKm ?? ""}
                placeholder="e.g. 1.5"
              />
            </div>
            <div className="field">
              <label htmlFor="contactName">Lodge coordinator name</label>
              <input id="contactName" name="contactName" defaultValue={lodge.contactName} />
            </div>
            <div className="field">
              <label htmlFor="contactPhone">Lodge coordinator phone</label>
              <input id="contactPhone" name="contactPhone" type="tel" defaultValue={lodge.contactPhone} />
            </div>
            <button className="btn" type="submit">
              Save
            </button>
          </form>
        </div>
      )}

      {canWrite && (
        <div className="card stack">
          <h2>Photos</h2>
          {lodge.images.length > 0 && (
            <div className="grid">
              {lodge.images.map((src, i) => (
                <div key={i} className="stack" style={{ gap: "8px" }}>
                  <ImageThumb src={src} alt={`${lodge.name} photo ${i + 1}`} />
                  <label style={{ display: "flex", gap: "8px", alignItems: "center", fontWeight: 400 }}>
                    <input type="checkbox" name="keepImage" value={i} defaultChecked form="lodge-images-form" />
                    Keep this photo{i === 0 ? " (main)" : ""}
                  </label>
                </div>
              ))}
            </div>
          )}
          <form
            id="lodge-images-form"
            method="post"
            action={`/api/admin/lodges/${lodge.id}`}
            encType="multipart/form-data"
            className="stack"
          >
            <input type="hidden" name="intent" value="images" />
            <div className="field">
              <label htmlFor="images">Add photos</label>
              <input id="images" name="images" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple />
            </div>
            <button className="btn secondary" type="submit">
              Save photos
            </button>
          </form>
        </div>
      )}

      {canWrite && (
        <form method="post" action={`/api/admin/lodges/${lodge.id}`}>
          <input type="hidden" name="intent" value="status" />
          <input type="hidden" name="status" value={lodge.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
          <button className="btn secondary" type="submit">
            {lodge.status === "ACTIVE" ? "Deactivate lodge" : "Reactivate lodge"}
          </button>
        </form>
      )}

      <h2>Apartments</h2>
      {apartments.length === 0 ? (
        <p>No apartments yet. Add the first one below.</p>
      ) : (
        <div className="grid">
          {apartments.map((a) => (
            <Link key={a.unitId} href={`/admin/apartments/${a.unitId}`} className="listing-card">
              <ImageThumb src={a.image} alt={a.name} />
              <div className="listing-body">
                <h3>{a.name}</h3>
                <div className="badge-row">
                  <Badge>{a.mode === "PRIVATE" ? "Private" : "Shared"}</Badge>
                  {a.genderRestriction !== "ANY" && <Badge>{a.genderRestriction === "MALE" ? "Male" : "Female"}</Badge>}
                </div>
                <p className="listing-price">
                  {(a.priceMinor / 100).toLocaleString()} / {a.pricingModel === "PER_PERSON" ? "bedspace" : "unit"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {canWrite && (
        <p>
          <Link className="btn" href={`/admin/lodges/${lodge.id}/apartments/new`}>
            Add an apartment
          </Link>
        </p>
      )}
    </div>
  );
}
