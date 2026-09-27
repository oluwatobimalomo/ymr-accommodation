import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/lib/auth/session";
import { getDashboardStats } from "@/lib/dashboard";
import { formatNaira } from "@/lib/format-currency";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/admin/login");
  if (!actor.globalPermissions.has("payment.read") && !actor.scopedPermissions.has("payment.read")) redirect("/admin/operations");
  const params = await searchParams;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const range = params.range ?? "30";
  const from = params.from ?? (range === "all" ? undefined : range === "custom" ? undefined : new Date(now.getTime() - (Number(range) || 30) * 86400000).toISOString().slice(0, 10));
  const to = params.to ?? (range === "all" ? undefined : today);
  const chartPeak = 150_000 * 100;
  let chartMax = chartPeak;

  let stats: Awaited<ReturnType<typeof getDashboardStats>> | null = null;
  let dbError: string | null = null;
  try {
    stats = await getDashboardStats({ from, to });
    if (stats.daily.length) {
      const max = Math.max(...stats.daily.map((point) => point.amount));
      // Amounts are stored in minor units. Round the axis up to a readable ₦150k block.
      chartMax = Math.max(chartPeak, Math.ceil(max / chartPeak) * chartPeak);
    }
  } catch {
    dbError = "Couldn't load dashboard data. If you just deployed or updated the app, make sure you've run `npm run db:migrate` against this database.";
  }

  return (
    <div className="admin-page stack dashboard-page">
      <div className="admin-page-heading">
        <div><span className="eyebrow">Overview</span><h1>Dashboard</h1><p>Accommodation performance and live inventory.</p></div>
        <div className="dashboard-heading-actions"><form method="get" className="dashboard-date-filter"><label><span>Period</span><select name="range" defaultValue={range}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option><option value="custom">Custom period</option></select></label>{range === "custom" && <><label><span>From</span><input type="date" name="from" defaultValue={params.from} /></label><label><span>To</span><input type="date" name="to" defaultValue={params.to} /></label></>}<button className="btn secondary" type="submit">Apply</button></form><Link className="btn" href="/admin/lodges">Manage lodges</Link></div>
      </div>
      {dbError && <div className="alert" role="alert">{dbError}</div>}
      {!stats ? null : stats.lodges.total === 0 ? (
        <div className="card stack"><h2>Let&rsquo;s get started</h2><p>No lodges yet. Create your first one to begin building the accommodation catalogue.</p><p><Link className="btn" href="/admin/lodges">Add your first lodge</Link></p></div>
      ) : (
        <>
          <section className="dashboard-kpis" aria-label="Key metrics">
            <article><span>Paid revenue</span><strong>{formatNaira(stats.bookings.paidAmountMinor)}</strong><small>{stats.bookings.paid} paid bookings</small></article>
            <article><span>Bookings</span><strong>{stats.bookings.total.toLocaleString()}</strong><small>In selected period</small></article>
            <article><span>Awaiting payment</span><strong>{stats.bookings.pending.toLocaleString()}</strong><small>Payment pending</small></article>
            <article><span>Available bedspaces</span><strong>{stats.bedspaces.availableNow.toLocaleString()}</strong><small>Live availability</small></article>
          </section>
          <section className="dashboard-analysis-grid"><article className="card dashboard-chart-card"><div className="admin-section-heading"><div><span className="eyebrow">Paid bookings</span><h2>Revenue trend</h2></div><Link href="/admin/reports">Full reports →</Link></div>{stats.daily.length ? <div className="dashboard-chart" role="img" aria-label="Daily paid booking revenue with a labelled Naira axis"><div className="dashboard-y-axis">{[3,2,1,0].map((step) => <span key={step}>{formatNaira(chartMax * step / 3)}</span>)}</div><div className="dashboard-plot"><div className="dashboard-grid-lines" aria-hidden="true"><i/><i/><i/><i/></div><div className="dashboard-bars">{stats.daily.map((point) => <div key={point.date} title={`${point.date}: ${formatNaira(point.amount)}`}><i style={{height:`${Math.max(2, point.amount / chartMax * 100)}%`}}/><small>{point.date.slice(5)}</small></div>)}</div></div></div> : <p className="empty-state">No bookings for this period.</p>}</article>
            <article className="card dashboard-status-card"><div className="admin-section-heading"><div><span className="eyebrow">Payment mix</span><h2>Booking status</h2></div></div><div className="dashboard-status-list">{[{label:"Paid",count:stats.bookings.paid,color:"#237246"},{label:"Pending",count:stats.bookings.pending,color:"#8a5b0b"},{label:"Failed",count:stats.bookings.failed,color:"#99463e"}].map((item) => <div className="dashboard-status-row" key={item.label}><span className="dashboard-status-dot" style={{background:item.color}}/><span>{item.label}</span><strong>{item.count.toLocaleString()}</strong><small>{stats!.bookings.total ? Math.round(item.count / stats!.bookings.total * 100) : 0}%</small></div>)}</div><p className="dashboard-inventory-note">{stats.lodges.active} active lodges · {stats.units.total} apartments · {stats.bedspaces.total} bedspaces</p></article>
          </section>
          <section className="card dashboard-recent-card"><div className="admin-section-heading"><div><span className="eyebrow">Guest activity</span><h2>Recent bookings</h2></div><Link href="/admin/bookings">View all bookings →</Link></div><div className="dashboard-recent-scroll"><table className="data-table dashboard-recent-table"><thead><tr><th>Guest name</th><th>Lodge / room category</th><th>Status</th><th>Amount</th><th>Check-in date</th></tr></thead><tbody>{stats.recentBookings.map((booking) => <tr key={booking.id}><td data-label="Guest name"><Link href={`/admin/bookings/${booking.id}`}>{booking.guestName}</Link><small>{booking.reference}</small></td><td data-label="Lodge / room category">{booking.lodgeName}<small>{booking.categoryName}</small></td><td data-label="Status"><span className={`status-pill status-${booking.paymentStatus.toLowerCase()}`}>{booking.paymentStatus === "PAID" ? "Paid" : booking.paymentStatus === "PENDING" ? "Pending" : booking.paymentStatus === "FAILED" ? "Failed" : booking.paymentStatus.replaceAll("_", " ")}</span></td><td className="table-cell-nowrap" data-label="Amount">{formatNaira(booking.amountMinor)}</td><td className="table-cell-nowrap" data-label="Check-in date">{booking.checkInDate ? new Date(`${booking.checkInDate}T00:00:00`).toLocaleDateString("en-NG") : "—"}</td></tr>)}</tbody></table>{stats.recentBookings.length === 0 && <p className="empty-state">No bookings in this period.</p>}</div></section>
        </>
      )}
    </div>
  );
}
