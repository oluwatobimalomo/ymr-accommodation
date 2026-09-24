import { ErrorBanner } from "@/components/AdminChrome";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { listFacilities } from "@/lib/inventory/facilities";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facilities" };

export default async function FacilitiesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor();
  const { error } = await searchParams;
  const facilities = await listFacilities();
  const canWrite = can(actor, "inventory.write");

  return (
    <div className="stack">
      <h1>Facilities</h1>
      <ErrorBanner error={error} />
      <p>These appear as checkboxes when editing a unit. Add new ones here as needs come up.</p>

      {facilities.length === 0 ? (
        <p>No facilities yet.</p>
      ) : (
        <ul>
          {facilities.map((f) => (
            <li key={f.id}>{f.name}</li>
          ))}
        </ul>
      )}

      {canWrite && (
        <div className="card stack">
          <h2>Add a facility</h2>
          <form method="post" action="/api/admin/facilities" className="stack">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" required placeholder="Standing Fan" />
            </div>
            <button className="btn" type="submit">
              Add facility
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
