import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorBanner } from "@/components/AdminChrome";
import { Badge } from "@/components/Badge";
import { ImageThumb } from "@/components/ImageThumb";
import { ImageUploadInput } from "@/components/ImageUploadInput";
import { ApartmentStayDates } from "@/components/ApartmentStayDates";
import { ApartmentAmenitiesForm } from "@/components/ApartmentAmenitiesForm";
import { requireActor } from "@/lib/auth/require";
import { getApartmentDetail, getApartmentInventory, getApartmentOrders } from "@/lib/inventory/apartments";
import { listFacilities } from "@/lib/inventory/facilities";
import { getLodge } from "@/lib/inventory/lodges";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Available",
  BLOCKED: "Blocked",
  MAINTENANCE: "Maintenance",
  RETIRED: "Retired",
};
const BED_TYPES = ["Single Bed", "Double Bed", "Bunk"];
const BED_SIZES = ["4x6", "6x6", "3x6", "5x6"];

export default async function ApartmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; tab?: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;
  const { error, tab: requestedTab } = await searchParams;
  const tab = requestedTab === "orders" || requestedTab === "inventory" ? requestedTab : "customize";
  const detail = await getApartmentDetail(id);
  if (!detail) notFound();
  const { unit, category, facilityIds, overviewFacilityIds } = detail;
  const lodge = await getLodge(category.lodgeId);
  const inventory = await getApartmentInventory(id);
  const orders = tab === "orders" ? (await getApartmentOrders(actor, id) ?? []) : [];
  const allFacilities = category.mode === "PRIVATE" ? (await listFacilities()).filter((facility) => facility.name.trim().toLowerCase() !== "bed") : [];
  return (
    <div className="stack">
      <p>
        <Link href={`/admin/lodges/${category.lodgeId}`}>&larr; {lodge?.name ?? "Lodge"}</Link>
      </p>
      <h1>{unit.name}</h1>
      <ErrorBanner error={error} />
      <div className="badge-row">
        <Badge>{category.mode === "PRIVATE" ? "Private" : "Shared"}</Badge>
        {category.genderRestriction !== "ANY" && <Badge>{category.genderRestriction === "MALE" ? "Male" : "Female"}</Badge>}
      </div>

      <nav className="admin-tabs" aria-label="Apartment management">
        <Link aria-current={tab === "orders" ? "page" : undefined} href={`?tab=orders`}>Orders</Link>
        <Link aria-current={tab === "inventory" ? "page" : undefined} href={`?tab=inventory`}>Inventory</Link>
        <Link aria-current={tab === "customize" ? "page" : undefined} href={`?tab=customize`}>Customize</Link>
      </nav>

      {tab === "inventory" && inventory && <section className="card stack">
        <div><h2>Inventory</h2><p className="listing-meta">{inventory.available} available of {inventory.stock} listed units. {inventory.available <= category.lowStockAlert ? "Low stock alert threshold reached." : ""}</p></div>
        <form method="post" action={`/api/admin/apartments/${unit.id}`} className="inventory-fields">
          <input type="hidden" name="intent" value="inventory" />
          <label className="field">Price (₦)<input name="priceNaira" type="number" min="0.01" step="0.01" defaultValue={category.defaultPriceMinor / 100} required /></label>
          <label className="field">No. in stock<input name="stock" type="number" min="0" step="1" defaultValue={inventory.stock} required /></label>
          <label className="field">Minimum order<input name="minOrder" type="number" min="1" step="1" defaultValue={category.minOrderQuantity} required /></label>
          <label className="field">Maximum order<input name="maxOrder" type="number" min={category.minOrderQuantity} step="1" defaultValue={category.maxOrderQuantity ?? ""} placeholder="No limit" /></label>
          <label className="field">Low stock alert at<input name="lowStockAlert" type="number" min="0" step="1" defaultValue={category.lowStockAlert} required /></label>
          <label className="checkbox-option inventory-list-toggle"><input name="listed" type="checkbox" defaultChecked={category.status === "ACTIVE"} /><span>List this apartment for booking</span></label>
          <button className="btn" type="submit">Save inventory</button>
        </form>
      </section>}

      {tab === "orders" && <section className="card stack">
        <div className="orders-heading"><div><h2>Orders</h2><p className="listing-meta">{orders.length} booking{orders.length === 1 ? "" : "s"} for this apartment</p></div><a className="btn secondary" href={`/api/admin/apartments/${unit.id}/orders.csv`}>Export CSV</a></div>
        {orders.length ? <div className="table-scroll"><table className="admin-table"><thead><tr><th>Reference</th><th>Date</th><th>Booker</th><th>Qty</th><th>Total</th><th>Payment</th><th>Stay</th></tr></thead><tbody>{orders.map((order) => <tr key={order.reference}><td>{order.reference}</td><td>{order.createdAt.toLocaleDateString()}</td><td>{order.name}<small>{order.phone} · {order.email}</small></td><td>{order.quantity}</td><td>₦{(order.amountMinor / 100).toLocaleString()}</td><td>{order.paymentStatus}</td><td>{order.stayStatus}</td></tr>)}</tbody></table></div> : <p>No orders yet.</p>}
      </section>}

      {tab === "customize" && <div className="apartment-customize-grid">
      <div className="card stack">
        <h2>Details</h2>
        <form method="post" action={`/api/admin/apartments/${unit.id}`} className="stack">
          <input type="hidden" name="intent" value="update" />
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" defaultValue={unit.name} required />
          </div>
          <div className="field">
            <label htmlFor="priceNaira">Total listed price for this stay {category.pricingModel === "PER_PERSON" ? "(per bedspace, ₦)" : "(per apartment, ₦)"}</label>
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
          <ApartmentStayDates checkInDate={category.checkInDate} checkOutDate={category.checkOutDate} />
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
            <ImageUploadInput id="images" />
          </div>
          <button className="btn secondary" type="submit">
            Save photos
          </button>
        </form>
      </div>

      {category.mode === "PRIVATE" && allFacilities.length > 0 && (
        <div className="card stack">
          <h2>Amenities</h2>
          <ApartmentAmenitiesForm action={`/api/admin/apartments/${unit.id}`} facilities={allFacilities} initialFacilityIds={facilityIds} initialOverviewIds={overviewFacilityIds} />
        </div>
      )}

      <div className="card stack">
        <h2>Beds</h2>
        <form method="post" action={`/api/admin/apartments/${unit.id}`} className="stack">
          <input type="hidden" name="intent" value="beds" />
          <fieldset className="checkbox-field">
            <legend>Bed type</legend>
            <div className="checkbox-grid">
              {BED_TYPES.map((bedType) => (
                <label className="checkbox-option" key={bedType}>
                  <input type="checkbox" name="bedTypes" value={bedType} defaultChecked={unit.bedTypes.includes(bedType) || unit.bedSpecifications.includes(bedType)} />
                  <span>{bedType}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="checkbox-field">
            <legend>Bed size</legend>
            <div className="checkbox-grid">
              {BED_SIZES.map((bedSize) => (
                <label className="checkbox-option" key={bedSize}>
                  <input type="checkbox" name="bedSizes" value={bedSize} defaultChecked={unit.bedSizes.includes(bedSize) || unit.bedSpecifications.includes(bedSize)} />
                  <span>{bedSize}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button className="btn secondary" type="submit">Save beds</button>
        </form>
      </div>

      {category.mode === "SHARED" && detail.rooms.length > 0 && (
        <div className="card stack">
          <h2>Rooms &amp; bedspaces</h2>
          <p className="listing-meta">
            {detail.rooms.length} room{detail.rooms.length === 1 ? "" : "s"} · {detail.rooms.reduce((n, r) => n + r.bedspaceList.length, 0)} bedspaces total
          </p>

          {detail.rooms.map((r) => (
            <div key={r.room.id} className="stack" style={{ borderTop: "1px solid var(--color-line)", paddingTop: "var(--space-3)" }}>
              <h3 style={{ margin: 0 }}>{r.room.name}</h3>
              <div className="bed-row">
                {r.bedspaceList.map((b) => (
                  <div
                    key={b.id}
                    className="bed"
                    data-state={b.status.toLowerCase()}
                    role="img"
                    aria-label={`${r.room.name}, bedspace ${b.letter}, ${STATUS_LABEL[b.status]}`}
                  >
                    <span className="letter">{b.letter}</span>
                    <span className="state">{STATUS_LABEL[b.status]}</span>
                  </div>
                ))}
              </div>
              <form method="post" action={`/api/admin/apartments/${unit.id}`} style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                <input type="hidden" name="intent" value="add-bedspaces" />
                <input type="hidden" name="roomId" value={r.room.id} />
                <div className="field" style={{ maxWidth: "120px" }}>
                  <label htmlFor={`addCount-${r.room.id}`}>Add bedspaces</label>
                  <input id={`addCount-${r.room.id}`} name="addCount" type="number" min="1" defaultValue={1} />
                </div>
                <button className="btn secondary" type="submit">
                  Add
                </button>
              </form>
            </div>
          ))}

          <form method="post" action={`/api/admin/apartments/${unit.id}`} style={{ display: "flex", gap: "8px", alignItems: "flex-end", borderTop: "1px solid var(--color-line)", paddingTop: "var(--space-3)" }}>
            <input type="hidden" name="intent" value="add-room" />
            <div className="field" style={{ maxWidth: "160px" }}>
              <label htmlFor="new-room-bedspaces">New room&rsquo;s bedspaces</label>
              <input id="new-room-bedspaces" name="bedspaceCount" type="number" min="1" defaultValue={4} />
            </div>
            <button className="btn secondary" type="submit">
              Add another room
            </button>
          </form>

          <form method="post" action={`/api/admin/apartments/${unit.id}`} className="stack" style={{ borderTop: "1px solid var(--color-line)", paddingTop: "var(--space-3)" }}>
            <input type="hidden" name="intent" value="bedspace-status" />
            <h3>Change a bedspace&rsquo;s status</h3>
            <div className="field">
              <label htmlFor="bedspaceId">Bedspace</label>
              <select id="bedspaceId" name="bedspaceId">
                {detail.rooms.map((r) =>
                  r.bedspaceList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {r.room.name} — {b.letter} — currently {STATUS_LABEL[b.status]}
                    </option>
                  )),
                )}
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
        </div>
      )}
      </div>}
    </div>
  );
}
