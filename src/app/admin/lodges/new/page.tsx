import Link from "next/link";
import { ErrorBanner } from "@/components/AdminChrome";
import { ImageUploadInput } from "@/components/ImageUploadInput";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { listEvents } from "@/lib/inventory/events";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add a lodge" };

export default async function NewLodgePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor();
  if (!can(actor, "inventory.write")) return <div className="alert" role="alert">You don&rsquo;t have permission to add lodges.</div>;
  const [{ error }, events] = await Promise.all([searchParams, listEvents()]);

  return (
    <div className="stack admin-page">
      <Link className="back-link" href="/admin/lodges">← Back to lodges</Link>
      <div className="admin-page-heading">
        <div><span className="eyebrow">Property inventory / New</span><h1>Add a lodge</h1><p>Create a property listing for the retreat accommodation directory.</p></div>
      </div>
      <ErrorBanner error={error} />
      {events.length === 0 ? (
        <div className="card stack"><h2>No retreat event is available</h2><p>Create or open an event before adding lodge inventory.</p><Link href="/admin/lodges" className="btn secondary">Back to lodges</Link></div>
      ) : (
        <div className="lodge-create-layout">
          <section className="card lodge-form-card">
            <div className="form-section-heading"><span className="form-section-icon" aria-hidden="true">⌂</span><div><h2>Property details</h2><p>Start with the basics. You can add apartment categories and photos later.</p></div></div>
            <form method="post" action="/api/admin/lodges" encType="multipart/form-data" className="lodge-form">
              <div className="field"><label htmlFor="eventId">Retreat event</label><select id="eventId" name="eventId" required defaultValue={events[0]!.id}>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></div>
              <div className="field"><label htmlFor="name">Lodge name</label><input id="name" name="name" required placeholder="e.g. White House Suites" autoComplete="organization" /></div>
              <div className="field"><label htmlFor="slug">Listing URL</label><input id="slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="white-house-suites" aria-describedby="slug-help" /><small id="slug-help" className="field-hint">Use lowercase letters, numbers, and hyphens.</small></div>
              <div className="field"><label htmlFor="address">Address or area</label><input id="address" name="address" placeholder="Street, neighbourhood, city" autoComplete="street-address" /></div>
              <div className="field"><label htmlFor="contactName">Lodge contact name</label><input id="contactName" name="contactName" autoComplete="name" /></div>
              <div className="field"><label htmlFor="contactPhone">Lodge contact phone</label><input id="contactPhone" name="contactPhone" type="tel" autoComplete="tel" /></div>
              <div className="field lodge-form-wide"><label htmlFor="description">About this lodge</label><textarea id="description" name="description" rows={4} placeholder="A short description to help guests choose this property." /></div>
              <div className="field lodge-form-wide"><label htmlFor="images">Property photos</label><ImageUploadInput id="images" /><small className="field-hint">Choose clear photos of the property. The first photo becomes the listing cover.</small></div>
              <div className="lodge-form-actions lodge-form-wide"><Link className="btn secondary" href="/admin/lodges">Cancel</Link><button className="btn" type="submit">Create lodge</button></div>
            </form>
          </section>
          <aside className="lodge-create-aside"><span className="eyebrow">A good listing starts here</span><h2>Help guests picture their stay.</h2><p>Use a familiar lodge name, a precise location, and a short, helpful description. Once it’s created, add the private or shared apartments it offers.</p><div className="lodge-aside-tip"><strong>Next step</strong><span>Add apartment categories, facilities, availability, and prices from the lodge page.</span></div></aside>
        </div>
      )}
    </div>
  );
}
