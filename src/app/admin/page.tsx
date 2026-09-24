import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/lib/auth/session";
import { getDashboardStats } from "@/lib/dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

type MetricIconName = "lodges" | "categories" | "bed" | "available" | "held" | "assigned" | "blocked" | "bookings" | "pending" | "paid" | "unallocated";

function MetricIcon({ name }: { name: MetricIconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const art: Record<MetricIconName, React.ReactNode> = {
    lodges: <><path d="M3 21V8l9-5 9 5v13" /><path d="M9 21v-6h6v6M7 10h.01M12 10h.01M17 10h.01" /></>,
    categories: <><rect x="3" y="4" width="8" height="7" rx="1" /><rect x="13" y="4" width="8" height="7" rx="1" /><rect x="3" y="13" width="8" height="7" rx="1" /><rect x="13" y="13" width="8" height="7" rx="1" /></>,
    bed: <><path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 14h18M5 9V6h5a3 3 0 0 1 3 3" /><path d="M3 18v2M21 18v2" /></>,
    available: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    held: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    assigned: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v1" /></>,
    blocked: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>,
    bookings: <><path d="M5 3h14v18H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    pending: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    paid: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8m-4-4v8" /></>,
    unallocated: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4m0 3h.01" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" {...common}>{art[name]}</svg>;
}

function Stat({ value, label, icon, warn = false }: { value: number | string; label: string; icon: MetricIconName; warn?: boolean }) {
  return (
    <article className={`admin-stat-card${warn ? " is-warning" : ""}`}>
      <span className="admin-stat-icon"><MetricIcon name={icon} /></span>
      <div className="admin-stat-copy"><strong>{value}</strong><span>{label}</span></div>
    </article>
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
    dbError = "Couldn't load dashboard data. If you just deployed or updated the app, make sure you've run `npm run db:migrate` against this database.";
  }

  return (
    <div className="admin-page stack">
      <div className="admin-page-heading">
        <div><span className="eyebrow">Overview</span><h1>Dashboard</h1><p>Accommodation inventory and booking activity at a glance.</p></div>
        <Link className="btn" href="/admin/lodges">Manage lodges</Link>
      </div>
      {dbError && <div className="alert" role="alert">{dbError}</div>}
      {!stats ? null : stats.lodges.total === 0 ? (
        <div className="card stack"><h2>Let&rsquo;s get started</h2><p>No lodges yet. Create your first one to begin building the accommodation catalogue.</p><p><Link className="btn" href="/admin/lodges">Add your first lodge</Link></p></div>
      ) : (
        <>
          <section className="admin-metric-section"><div className="admin-section-heading"><div><span className="eyebrow">Property inventory</span><h2>Inventory</h2></div></div>
            <div className="admin-stat-grid">
              <Stat value={stats.lodges.active} label={`Active lodges of ${stats.lodges.total}`} icon="lodges" />
              <Stat value={stats.categories.total} label={`${stats.categories.shared} shared · ${stats.categories.private} private`} icon="categories" />
              <Stat value={stats.units.total} label="Apartments" icon="bed" />
              <Stat value={stats.bedspaces.total} label="Total bedspaces" icon="bed" />
            </div>
          </section>
          <section className="admin-metric-section"><div className="admin-section-heading"><div><span className="eyebrow">Live allocation</span><h2>Bedspace availability</h2></div></div>
            <div className="admin-stat-grid">
              <Stat value={stats.bedspaces.availableNow} label="Available now" icon="available" />
              <Stat value={stats.bedspaces.held} label="Held at checkout" icon="held" warn={stats.bedspaces.held > 0} />
              <Stat value={stats.bedspaces.assigned} label="Assigned to bookings" icon="assigned" />
              <Stat value={stats.bedspaces.blocked + stats.bedspaces.maintenance} label="Blocked or maintenance" icon="blocked" warn={stats.bedspaces.blocked + stats.bedspaces.maintenance > 0} />
            </div>
          </section>
          <section className="admin-metric-section"><div className="admin-section-heading"><div><span className="eyebrow">Guest activity</span><h2>Bookings</h2></div><Link href="/admin/bookings">View bookings <span aria-hidden="true">→</span></Link></div>
            <div className="admin-stat-grid">
              <Stat value={stats.bookings.total} label="Total bookings" icon="bookings" />
              <Stat value={stats.bookings.pending} label="Payment pending" icon="pending" warn={stats.bookings.pending > 0} />
              <Stat value={stats.bookings.paid} label="Paid" icon="paid" />
              <Stat value={stats.bookings.unallocated} label="Not yet allocated" icon="unallocated" warn={stats.bookings.unallocated > 0} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
