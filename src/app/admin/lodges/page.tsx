import Link from "next/link";
import { AdminNav, ErrorBanner } from "@/components/AdminChrome";
import { ImageThumb } from "@/components/ImageThumb";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { listEvents } from "@/lib/inventory/events";
import { listLodges } from "@/lib/inventory/lodges";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lodges" };

export default async function LodgesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor();
  const { error } = await searchParams;
  const [lodges, events] = await Promise.all([listLodges(), listEvents()]);
  const canCreate = can(actor, "inventory.write");

  return (
    <div className="stack">
      <AdminNav />
      <h1>Lodges</h1>
      <ErrorBanner error={error} />

      {lodges.length === 0 ? (
        <p>No lodges yet. Add the first one below to start building the accommodation catalogue.</p>
      ) : (
        <div className="grid">
          {lodges.map((lodge) => (
            <Link key={lodge.id} href={`/admin/lodges/${lodge.id}`} className="listing-card">
              <ImageThumb src={lodge.images[0]} alt={lodge.name} aspect="16/10" />
              <div className="listing-body">
                <h3>{lodge.name}</h3>
                <p className="listing-meta">
                  {lodge.status === "ACTIVE" ? "Active" : "Inactive"}
                  {lodge.address ? ` · ${lodge.address}` : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {canCreate && (
        <div className="card stack">
          <h2>Add a lodge</h2>
          {events.length === 0 ? (
            <p>Create an event first (Admin &gt; Events) before adding lodges.</p>
          ) : (
            <form method="post" action="/api/admin/lodges" encType="multipart/form-data" className="stack">
              <div className="field">
                <label htmlFor="eventId">Event</label>
                <select id="eventId" name="eventId" required defaultValue={events[0]!.id}>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="name">Name</label>
                <input id="name" name="name" required placeholder="White House Lotto" />
              </div>
              <div className="field">
                <label htmlFor="slug">Slug</label>
                <input id="slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="white-house-lotto" />
              </div>
              <div className="field">
                <label htmlFor="address">Address / location</label>
                <input id="address" name="address" />
              </div>
              <div className="field">
                <label htmlFor="contactName">Contact name</label>
                <input id="contactName" name="contactName" />
              </div>
              <div className="field">
                <label htmlFor="contactPhone">Contact phone</label>
                <input id="contactPhone" name="contactPhone" />
              </div>
              <div className="field">
                <label htmlFor="description">Description</label>
                <input id="description" name="description" />
              </div>
              <div className="field">
                <label htmlFor="images">Photos</label>
                <input id="images" name="images" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple />
              </div>
              <button className="btn" type="submit">
                Add lodge
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
