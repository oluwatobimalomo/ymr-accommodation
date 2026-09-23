import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminChrome";
import { getCurrentActor } from "@/lib/auth/session";
import { getDashboardStats } from "@/lib/dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

function Stat({ value, label, warn }: { value: number | string; label: string; warn?: boolean }) {
  return (
    <div className={`stat-card${warn ? " stat-warning" : ""}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default async function AdminHome() {
  const actor = await getCurrentActor();
  if (!actor) redirect("/admin/login");

  let stats: Awaited<ReturnType<typeof getDashboardStats>> | null = null;
  let dbError: string | null = null;
  try {
    stats = await getDashboardStats();
  } catch {
    dbError =
      "Couldn't load dashboard data. If you just deployed or updated the app, make sure you've run `npm run db:migrate` against this database.";
  }

  return (
    <div className="stack">
      <AdminNav />
      <h1>Dashboard</h1>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <p style={{ margin: 0 }}>
          Signed in as {actor.name} ({actor.roleKeys.join(", ") || "no role"}).
        </p>
        <form method="post" action="/api/auth/logout">
          <button className="btn secondary" type="submit">
            Sign out
          </button>
        </form>
      </div>

      {dbError && (
        <div className="alert" role="alert">
          {dbError}
        </div>
      )}

      {!stats ? null : stats.lodges.total === 0 ? (
        <div className="card stack">
          <h2>Let&rsquo;s get started</h2>
          <p>No lodges yet. Create your first one to begin building the accommodation catalogue.</p>
          <p>
            <Link className="btn" href="/admin/lodges">
              Add your first lodge
            </Link>
          </p>
        </div>
      ) : (
        <>
          <h2 className="stat-section-title">Inventory</h2>
          <div className="stat-grid">
            <Stat value={stats.lodges.active} label={`Active lodges (of ${stats.lodges.total})`} />
            <Stat value={stats.categories.total} label={`Categories (${stats.categories.shared} shared, ${stats.categories.private} private)`} />
            <Stat value={stats.units.total} label="Units" />
            <Stat value={stats.bedspaces.total} label="Total bedspaces" />
          </div>

          <h2 className="stat-section-title">Bedspace availability</h2>
          <div className="stat-grid">
            <Stat value={stats.bedspaces.availableNow} label="Available right now" />
            <Stat value={stats.bedspaces.held} label="Currently held (checkout in progress)" warn={stats.bedspaces.held > 0} />
            <Stat value={stats.bedspaces.assigned} label="Assigned to a booking" />
            <Stat value={stats.bedspaces.blocked + stats.bedspaces.maintenance} label="Blocked / maintenance" warn={stats.bedspaces.blocked + stats.bedspaces.maintenance > 0} />
          </div>

          <h2 className="stat-section-title">Bookings</h2>
          <div className="stat-grid">
            <Stat value={stats.bookings.total} label="Total bookings" />
            <Stat value={stats.bookings.pending} label="Payment pending" warn={stats.bookings.pending > 0} />
            <Stat value={stats.bookings.paid} label="Paid" />
            <Stat value={stats.bookings.unallocated} label="Not yet allocated" warn={stats.bookings.unallocated > 0} />
          </div>

          <p>
            <Link className="btn secondary" href="/admin/lodges">
              Manage lodges
            </Link>{" "}
            <Link className="btn secondary" href="/admin/facilities">
              Manage facilities
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
