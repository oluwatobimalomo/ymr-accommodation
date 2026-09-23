import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminNav, ErrorBanner } from "@/components/AdminChrome";
import { ImageThumb } from "@/components/ImageThumb";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { getCategory } from "@/lib/inventory/categories";
import { listFacilities } from "@/lib/inventory/facilities";
import { listRoomsForUnit } from "@/lib/inventory/rooms";
import { getUnit, listFacilitiesForUnit } from "@/lib/inventory/units";

export const dynamic = "force-dynamic";

export default async function UnitDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;
  const { error } = await searchParams;
  const unit = await getUnit(id);
  if (!unit) notFound();
  const [category, rooms, unitFacilities, allFacilities] = await Promise.all([
    getCategory(unit.categoryId),
    listRoomsForUnit(id),
    listFacilitiesForUnit(id),
    listFacilities(),
  ]);
  const canWrite = can(actor, "inventory.write");
  const canBlock = can(actor, "inventory.block");
  const canCapacity = can(actor, "capacity.write");
  const hasRooms = rooms.length > 0;
  const selectedFacilityIds = new Set(unitFacilities.map((f) => f.id));

  return (
    <div className="stack">
      <AdminNav />
      <p>
        <Link href={`/admin/categories/${unit.categoryId}`}>&larr; {category?.name ?? "Category"}</Link>
      </p>
      <h1>{unit.name}</h1>
      <ErrorBanner error={error} />
      <p>
        Capacity {unit.capacity} · {unit.status}
      </p>

      {canWrite && (
        <div className="card stack">
          <h2>Unit details</h2>
          <form method="post" action={`/api/admin/units/${unit.id}`} className="stack">
            <input type="hidden" name="intent" value="update" />
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" defaultValue={unit.name} required />
            </div>
            <div className="field">
              <label htmlFor="description">Description</label>
              <input id="description" name="description" defaultValue={unit.description} />
            </div>
            <button className="btn" type="submit">
              Save changes
            </button>
          </form>
        </div>
      )}

      {canCapacity && !hasRooms && (
        <div className="card stack">
          <h2>Capacity</h2>
          <p>This unit has no rooms, so its capacity is set directly here.</p>
          <form method="post" action={`/api/admin/units/${unit.id}`} className="stack">
            <input type="hidden" name="intent" value="capacity" />
            <div className="field">
              <label htmlFor="capacity">Capacity</label>
              <input id="capacity" name="capacity" type="number" min="0" defaultValue={unit.capacity} required />
            </div>
            <button className="btn secondary" type="submit">
              Update capacity
            </button>
          </form>
        </div>
      )}
      {hasRooms && (
        <p>
          <em>Capacity is set by this unit&rsquo;s rooms and updates automatically.</em>
        </p>
      )}

      {canBlock && (
        <div className="card stack">
          <h2>Status</h2>
          <form method="post" action={`/api/admin/units/${unit.id}`} className="stack">
            <input type="hidden" name="intent" value="status" />
            <div className="field">
              <label htmlFor="status">Set status to</label>
              <select id="status" name="status" defaultValue={unit.status}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="MAINTENANCE">Maintenance</option>
              </select>
            </div>
            <button className="btn secondary" type="submit">
              Update status
            </button>
          </form>
        </div>
      )}

      {canWrite && (
        <div className="card stack">
          <h2>Photos</h2>
          <p>Add pictures of this apartment so people can see what they&rsquo;re booking. The first photo is the main one shown in listings.</p>
          <form method="post" action={`/api/admin/units/${unit.id}`} encType="multipart/form-data" className="stack">
            <input type="hidden" name="intent" value="images" />
            {unit.images.length > 0 && (
              <div className="grid">
                {unit.images.map((src, i) => (
                  <div key={i} className="stack" style={{ gap: "8px" }}>
                    <ImageThumb src={src} alt={`${unit.name} photo ${i + 1}`} />
                    <label style={{ display: "flex", gap: "8px", alignItems: "center", fontWeight: 400 }}>
                      <input type="checkbox" name="keepImage" value={i} defaultChecked />
                      Keep this photo{i === 0 ? " (main)" : ""}
                    </label>
                  </div>
                ))}
              </div>
            )}
            <div className="field">
              <label htmlFor="new-unit-images">Add more photos</label>
              <input
                id="new-unit-images"
                name="images"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
              />
            </div>
            <button className="btn secondary" type="submit">
              Save photos
            </button>
          </form>
        </div>
      )}

      {canWrite && allFacilities.length > 0 && (
        <div className="card stack">
          <h2>Facilities</h2>
          <form method="post" action={`/api/admin/units/${unit.id}`} className="stack">
            <input type="hidden" name="intent" value="facilities" />
            {allFacilities.map((f) => (
              <label key={f.id} style={{ display: "flex", gap: "8px", alignItems: "center", fontWeight: 400 }}>
                <input type="checkbox" name="facilityIds" value={f.id} defaultChecked={selectedFacilityIds.has(f.id)} />
                {f.name}
              </label>
            ))}
            <button className="btn secondary" type="submit">
              Save facilities
            </button>
          </form>
        </div>
      )}

      <h2>Rooms</h2>
      {rooms.length === 0 ? (
        <p>No rooms yet. For a private unit with no room breakdown, you can leave this empty.</p>
      ) : (
        <div className="grid">
          {rooms.map((r) => (
            <Link key={r.id} href={`/admin/rooms/${r.id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
              <h3>{r.name}</h3>
              <p style={{ margin: 0 }}>
                Capacity {r.capacity} · {r.genderRestriction} · {r.status}
              </p>
            </Link>
          ))}
        </div>
      )}

      {canWrite && (
        <div className="card stack">
          <h2>Add a room</h2>
          <form method="post" action={`/api/admin/rooms?unitId=${unit.id}`} className="stack">
            <div className="field">
              <label htmlFor="room-name">Name</label>
              <input id="room-name" name="name" required placeholder="Room 1" />
            </div>
            <div className="field">
              <label htmlFor="code">Code</label>
              <input id="code" name="code" required placeholder="R1" />
            </div>
            <div className="field">
              <label htmlFor="genderRestriction">Gender</label>
              <select id="genderRestriction" name="genderRestriction" defaultValue={category?.genderRestriction ?? "ANY"}>
                <option value="ANY">Any</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="capacity">Capacity (only used until bedspaces are added)</label>
              <input id="capacity" name="capacity" type="number" min="0" defaultValue={0} />
            </div>
            <button className="btn" type="submit">
              Add room
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
