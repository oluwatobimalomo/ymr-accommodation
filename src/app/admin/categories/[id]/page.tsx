import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorBanner } from "@/components/AdminChrome";
import { ImageThumb } from "@/components/ImageThumb";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { getCategory } from "@/lib/inventory/categories";
import { getLodge } from "@/lib/inventory/lodges";
import { listUnitsForCategory } from "@/lib/inventory/units";
import { formatNaira } from "@/lib/format-currency";

export const dynamic = "force-dynamic";

export default async function CategoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lodgeId?: string; error?: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;
  const { lodgeId, error } = await searchParams;
  const category = await getCategory(id);
  if (!category) notFound();
  const [lodge, units] = await Promise.all([getLodge(category.lodgeId), listUnitsForCategory(id)]);
  const canWrite = can(actor, "inventory.write");
  const canPrice = can(actor, "pricing.write");

  return (
    <div className="stack">
      <p>
        <Link href={`/admin/lodges/${category.lodgeId}`}>&larr; {lodge?.name ?? "Lodge"}</Link>
      </p>
      <h1>{category.name}</h1>
      <ErrorBanner error={error} />
      <p>
        {category.mode === "PRIVATE" ? "Private" : "Shared"} · {category.genderRestriction} ·{" "}
        {category.status === "ACTIVE" ? "Active" : "Inactive"}
      </p>

      {canWrite && (
        <div className="card stack">
          <h2>Category settings</h2>
          <form method="post" action={`/api/admin/categories/${category.id}?lodgeId=${lodgeId ?? category.lodgeId}`} className="stack">
            <input type="hidden" name="intent" value="update" />
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" defaultValue={category.name} required />
            </div>
            <div className="field">
              <label htmlFor="description">Description</label>
              <input id="description" name="description" defaultValue={category.description} />
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={category.status}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
            <label style={{ display: "flex", gap: "8px", alignItems: "center", fontWeight: 400 }}>
              <input type="checkbox" name="customerSelectsRoom" defaultChecked={category.customerSelectsRoom} />{" "}
              Customer can pick the specific room
            </label>
            <label style={{ display: "flex", gap: "8px", alignItems: "center", fontWeight: 400 }}>
              <input
                type="checkbox"
                name="customerSelectsBedspace"
                defaultChecked={category.customerSelectsBedspace}
              />{" "}
              Customer can pick the specific bedspace
            </label>
            <label style={{ display: "flex", gap: "8px", alignItems: "center", fontWeight: 400 }}>
              <input type="checkbox" name="allowEntireRoomBooking" defaultChecked={category.allowEntireRoomBooking} />{" "}
              Allow booking an entire room
            </label>
            <button className="btn" type="submit">
              Save changes
            </button>
          </form>
        </div>
      )}

      {canPrice && (
        <div className="card stack">
          <h2>Pricing</h2>
          <p>Current price: {formatNaira(category.defaultPriceMinor)} per {category.pricingModel === "PER_PERSON" ? "person" : "unit"}</p>
          <form method="post" action={`/api/admin/categories/${category.id}?lodgeId=${lodgeId ?? category.lodgeId}`} className="stack">
            <input type="hidden" name="intent" value="pricing" />
            <div className="field">
              <label htmlFor="priceNaira">New price (₦)</label>
              <input id="priceNaira" name="priceNaira" type="number" min="0" step="0.01" defaultValue={category.defaultPriceMinor / 100} required />
            </div>
            <button className="btn secondary" type="submit">
              Update price
            </button>
          </form>
        </div>
      )}

      <h2>Units</h2>
      {units.length === 0 ? (
        <p>No units yet. Add one below, such as &ldquo;Chalet A&rdquo; or &ldquo;Building A&rdquo;.</p>
      ) : (
        <div className="grid">
          {units.map((u) => (
            <Link key={u.id} href={`/admin/units/${u.id}`} className="listing-card">
              <ImageThumb src={u.images[0]} alt={u.name} />
              <div className="listing-body">
                <h3>{u.name}</h3>
                <p className="listing-meta">
                  Capacity {u.capacity} · {u.status}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {canWrite && (
        <div className="card stack">
          <h2>Add a unit</h2>
          <form method="post" action={`/api/admin/units?categoryId=${category.id}`} className="stack">
            <div className="field">
              <label htmlFor="unit-name">Name</label>
              <input id="unit-name" name="name" required placeholder="Building A" />
            </div>
            <div className="field">
              <label htmlFor="code">Code</label>
              <input id="code" name="code" required placeholder="A" />
            </div>
            <div className="field">
              <label htmlFor="capacity">
                Capacity {category.mode === "SHARED" ? "(only used until rooms are added)" : ""}
              </label>
              <input id="capacity" name="capacity" type="number" min="0" defaultValue={0} />
            </div>
            <div className="field">
              <label htmlFor="unit-description">Description</label>
              <input id="unit-description" name="description" />
            </div>
            <button className="btn" type="submit">
              Add unit
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
