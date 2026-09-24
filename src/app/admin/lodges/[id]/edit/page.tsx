import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorBanner } from "@/components/AdminChrome";
import { ImageThumb } from "@/components/ImageThumb";
import { ImageUploadInput } from "@/components/ImageUploadInput";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { getLodge } from "@/lib/inventory/lodges";

export const dynamic = "force-dynamic";

export default async function EditLodgePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "inventory.write")) return <p>You do not have permission to edit lodges.</p>;
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const lodge = await getLodge(id);
  if (!lodge) notFound();

  return (
    <div className="stack">
      <p><Link href={`/admin/lodges/${id}`}>&larr; Back to {lodge.name}</Link></p>
      <div className="admin-page-heading"><div><span className="eyebrow">Property settings</span><h1>Edit Lodge Details</h1><p>Update the property profile, coordinator, photos, and availability.</p></div></div>
      <ErrorBanner error={error} />
      <section className="card stack lodge-details-card">
        <h2>Lodge details</h2>
        <form method="post" action={`/api/admin/lodges/${id}`} className="lodge-details-form">
          <input type="hidden" name="intent" value="update" />
          <div className="field"><label htmlFor="name">Name</label><input id="name" name="name" defaultValue={lodge.name} required /></div>
          <div className="field lodge-form-wide"><label htmlFor="address">Address</label><input id="address" name="address" defaultValue={lodge.address} /></div>
          <div className="field"><label htmlFor="proximityKm">Proximity to Old Auditorium (km)</label><input id="proximityKm" name="proximityKm" type="number" min="0" step="0.1" defaultValue={lodge.proximityKm ?? ""} placeholder="e.g. 1.5" /></div>
          <div className="field"><label htmlFor="contactName">Lodge coordinator name</label><input id="contactName" name="contactName" defaultValue={lodge.contactName} /></div>
          <div className="field"><label htmlFor="contactPhone">Lodge coordinator phone</label><input id="contactPhone" name="contactPhone" type="tel" defaultValue={lodge.contactPhone} /></div>
          <button className="btn lodge-form-wide" type="submit">Save lodge details</button>
        </form>
      </section>
      <section className="card stack lodge-details-card">
        <h2>Property photos</h2>
        {lodge.images.length > 0 && <div className="grid lodge-photo-grid">{lodge.images.map((src, i) => <div key={i} className="stack"><ImageThumb src={src} alt={`${lodge.name} photo ${i + 1}`} aspect="4/3" /><label className="image-keep-label"><input type="checkbox" name="keepImage" value={i} defaultChecked form="lodge-images-form" />Keep this photo{i === 0 ? " (main)" : ""}</label></div>)}</div>}
        <form id="lodge-images-form" method="post" action={`/api/admin/lodges/${id}`} encType="multipart/form-data" className="stack lodge-photo-form">
          <input type="hidden" name="intent" value="images" />
          <div className="field"><label htmlFor="images">Add photos</label><ImageUploadInput id="images" /></div>
          <button className="btn secondary" type="submit">Save photos</button>
        </form>
      </section>
      <form method="post" action={`/api/admin/lodges/${id}`}>
        <input type="hidden" name="intent" value="status" /><input type="hidden" name="status" value={lodge.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
        <button className="btn secondary" type="submit">{lodge.status === "ACTIVE" ? "Deactivate lodge" : "Reactivate lodge"}</button>
      </form>
    </div>
  );
}
