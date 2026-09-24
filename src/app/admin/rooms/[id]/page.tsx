import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorBanner } from "@/components/AdminChrome";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { listBedspacesForRoom } from "@/lib/inventory/bedspaces";
import { getRoom } from "@/lib/inventory/rooms";
import { getUnit } from "@/lib/inventory/units";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Available",
  BLOCKED: "Blocked",
  MAINTENANCE: "Maintenance",
  RETIRED: "Retired",
};

export default async function RoomDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;
  const { error } = await searchParams;
  const room = await getRoom(id);
  if (!room) notFound();
  const [unit, bedspaces] = await Promise.all([getUnit(room.unitId), listBedspacesForRoom(id)]);
  const canWrite = can(actor, "inventory.write");
  const canBlock = can(actor, "inventory.block");
  const canCapacity = can(actor, "capacity.write");
  const hasBedspaces = bedspaces.length > 0;

  return (
    <div className="stack">
      <p>
        <Link href={`/admin/units/${room.unitId}`}>&larr; {unit?.name ?? "Unit"}</Link>
      </p>
      <h1>{room.name}</h1>
      <ErrorBanner error={error} />
      <p>
        Capacity {room.capacity} · {room.genderRestriction} · {room.status}
      </p>

      {canWrite && (
        <div className="card stack">
          <h2>Room details</h2>
          <form method="post" action={`/api/admin/rooms/${room.id}`} className="stack">
            <input type="hidden" name="intent" value="update" />
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" defaultValue={room.name} required />
            </div>
            <div className="field">
              <label htmlFor="code">Code</label>
              <input id="code" name="code" defaultValue={room.code} required />
            </div>
            <button className="btn" type="submit">
              Save changes
            </button>
          </form>
        </div>
      )}

      {canCapacity && !hasBedspaces && (
        <div className="card stack">
          <h2>Capacity</h2>
          <p>This room has no bedspaces, so its capacity is set directly here (useful for a whole-room private booking).</p>
          <form method="post" action={`/api/admin/rooms/${room.id}`} className="stack">
            <input type="hidden" name="intent" value="capacity" />
            <div className="field">
              <label htmlFor="capacity">Capacity</label>
              <input id="capacity" name="capacity" type="number" min="0" defaultValue={room.capacity} required />
            </div>
            <button className="btn secondary" type="submit">
              Update capacity
            </button>
          </form>
        </div>
      )}
      {hasBedspaces && (
        <p>
          <em>Capacity is set by this room&rsquo;s bedspaces and updates automatically.</em>
        </p>
      )}

      {canBlock && (
        <div className="card stack">
          <h2>Status</h2>
          <form method="post" action={`/api/admin/rooms/${room.id}`} className="stack">
            <input type="hidden" name="intent" value="status" />
            <div className="field">
              <label htmlFor="status">Set status to</label>
              <select id="status" name="status" defaultValue={room.status}>
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

      <h2>Bedspaces</h2>
      {bedspaces.length === 0 ? (
        <p>No bedspaces yet. Add letters below (A, B, C...) for a shared room.</p>
      ) : (
        <div className="bed-row">
          {bedspaces.map((b) => (
            <div key={b.id} className="bed" data-state={b.status.toLowerCase()} role="img" aria-label={`Bedspace ${b.letter}, ${STATUS_LABEL[b.status]}`}>
              <span className="letter">{b.letter}</span>
              <span className="state">{STATUS_LABEL[b.status]}</span>
            </div>
          ))}
        </div>
      )}

      {canWrite && (
        <div className="card stack">
          <h2>Add a bedspace</h2>
          <form method="post" action={`/api/admin/bedspaces?roomId=${room.id}`} className="stack">
            <div className="field">
              <label htmlFor="letter">Letter</label>
              <input id="letter" name="letter" required maxLength={4} placeholder="A" style={{ maxWidth: "120px" }} />
            </div>
            <button className="btn" type="submit">
              Add bedspace
            </button>
          </form>
        </div>
      )}

      {canBlock && bedspaces.length > 0 && (
        <div className="card stack">
          <h2>Change a bedspace&rsquo;s status</h2>
          {bedspaces.map((b) => (
            <form key={b.id} method="post" action={`/api/admin/bedspaces/${b.id}?roomId=${room.id}`} className="stack" style={{ borderTop: "1px solid var(--color-line)", paddingTop: "var(--space-3)" }}>
              <p style={{ margin: 0, fontWeight: 600 }}>Bedspace {b.letter} — currently {STATUS_LABEL[b.status]}</p>
              <div className="field">
                <label htmlFor={`status-${b.id}`}>New status</label>
                <select id={`status-${b.id}`} name="status" defaultValue={b.status}>
                  <option value="AVAILABLE">Available</option>
                  <option value="BLOCKED">Blocked</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="RETIRED">Retired</option>
                </select>
              </div>
              <button className="btn secondary" type="submit">
                Update bedspace {b.letter}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
