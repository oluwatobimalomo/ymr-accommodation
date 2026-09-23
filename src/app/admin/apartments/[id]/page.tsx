import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminNav, ErrorBanner } from "@/components/AdminChrome";
import { Badge } from "@/components/Badge";
import { ImageThumb } from "@/components/ImageThumb";
import { requireActor } from "@/lib/auth/require";
import { getApartmentDetail } from "@/lib/inventory/apartments";
import { listFacilities } from "@/lib/inventory/facilities";
import { getLodge } from "@/lib/inventory/lodges";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Available",
  BLOCKED: "Blocked",
  MAINTENANCE: "Maintenance",
  RETIRED: "Retired",
};

export default async function ApartmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireActor();
  const { id } = await params;
  const { error } = await searchParams;
  const detail = await getApartmentDetail(id);
  if (!detail) notFound();
  const { unit, category, room, bedspaceList, facilityIds } = detail;
  const lodge = await getLodge(category.lodgeId);
  const allFacilities = category.mode === "PRIVATE" ? await listFacilities() : [];
  const selectedFacilityIds = new Set(facilityIds);

  return (
    <div className="stack">
      <AdminNav />
      <p>
        <Link href={`/admin/lodges/${category.lodgeId}`}>&larr; {lodge?.name ?? "Lodge"}</Link>
      </p>
      <h1>{unit.name}</h1>
      <ErrorBanner error={error} />
      <div className="badge-row">
        <Badge>{category.mode === "PRIVATE" ? "Private" : "Shared"}</Badge>
        {category.genderRestriction !== "ANY" && <Badge>{category.genderRestriction === "MALE" ? "Male" : "Female"}</Badge>}
      </div>

      <div className="card stack">
        <h2>Details</h2>
        <form method="post" action={`/api/admin/apartments/${unit.id}`} className="stack">
          <input type="hidden" name="intent" value="update" />
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" defaultValue={unit.name} required />
          </div>
          <div className="field">
            <label htmlFor="priceNaira">Price {category.pricingModel === "PER_PERSON" ? "(per bedspace)" : "(per unit)"}</label>
            <input
              id="priceNaira"
              name="priceNaira"
              type="number"
              min="0"
              step="0.01"
              defaultValue={category.defaultPriceMinor / 100}
              required
            />
          </div>
          <button className="btn" type="submit">
            Save
          </button>
        </form>
      </div>

      <div className="card stack">
        <h2>Photos</h2>
        {unit.images.length > 0 && (
          <div className="grid">
            {unit.images.map((src, i) => (
              <div key={i} className="stack" style={{ gap: "8px" }}>
                <ImageThumb src={src} alt={`${unit.name} photo ${i + 1}`} />
                <label style={{ display: "flex", gap: "8px", alignItems: "center", fontWeight: 400 }}>
                  <input type="checkbox" name="keepImage" value={i} defaultChecked form="apartment-images-form" />
                  Keep this photo{i === 0 ? " (main)" : ""}
                </label>
              </div>
            ))}
          </div>
        )}
        <form
          id="apartment-images-form"
          method="post"
          action={`/api/admin/apartments/${unit.id}`}
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

      {category.mode === "PRIVATE" && allFacilities.length > 0 && (
        <div className="card stack">
          <h2>Amenities</h2>
          <form method="post" action={`/api/admin/apartments/${unit.id}`} className="stack">
            <input type="hidden" name="intent" value="facilities" />
            {allFacilities.map((f) => (
              <label key={f.id} style={{ display: "flex", gap: "8px", alignItems: "center", fontWeight: 400 }}>
                <input type="checkbox" name="facilityIds" value={f.id} defaultChecked={selectedFacilityIds.has(f.id)} />
                {f.name}
              </label>
            ))}
            <button className="btn secondary" type="submit">
              Save amenities
            </button>
          </form>
        </div>
      )}

      {category.mode === "SHARED" && room && (
        <div className="card stack">
          <h2>Bedspaces</h2>
          <div className="bed-row">
            {bedspaceList.map((b) => (
              <div key={b.id} className="bed" data-state={b.status.toLowerCase()} role="img" aria-label={`Bedspace ${b.letter}, ${STATUS_LABEL[b.status]}`}>
                <span className="letter">{b.letter}</span>
                <span className="state">{STATUS_LABEL[b.status]}</span>
              </div>
            ))}
          </div>
          <form method="post" action={`/api/admin/apartments/${unit.id}`} className="stack">
            <input type="hidden" name="intent" value="add-bedspaces" />
            <div className="field" style={{ maxWidth: "160px" }}>
              <label htmlFor="addCount">Add more bedspaces</label>
              <input id="addCount" name="addCount" type="number" min="1" defaultValue={1} />
            </div>
            <button className="btn secondary" type="submit">
              Add
            </button>
          </form>

          {bedspaceList.length > 0 && (
            <form method="post" action={`/api/admin/apartments/${unit.id}`} className="stack">
              <input type="hidden" name="intent" value="bedspace-status" />
              <h3>Change a bedspace&rsquo;s status</h3>
              <div className="field">
                <label htmlFor="bedspaceId">Bedspace</label>
                <select id="bedspaceId" name="bedspaceId" defaultValue={bedspaceList[0]!.id}>
                  {bedspaceList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.letter} — currently {STATUS_LABEL[b.status]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="bedspace-new-status">New status</label>
                <select id="bedspace-new-status" name="status" defaultValue="AVAILABLE">
                  <option value="AVAILABLE">Available</option>
                  <option value="BLOCKED">Blocked</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="RETIRED">Retired</option>
                </select>
              </div>
              <button className="btn secondary" type="submit">
                Update
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
