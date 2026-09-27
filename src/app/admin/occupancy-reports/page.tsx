import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { getOccupancyReport } from "@/lib/admin/occupancy-reports";

export const dynamic = "force-dynamic";
export const metadata = { title: "Occupancy reports" };

export default async function OccupancyReportsPage({ searchParams }: { searchParams: Promise<{ event?: string; lodge?: string }> }) {
  const actor = await requireActor();
  const canReadOccupancy = can(actor, "booking.read") || [...actor.lodgeIds].some((lodgeId) => can(actor, "booking.read", { lodgeId }));
  if (!canReadOccupancy) notFound();
  const filters = await searchParams;
  const report = await getOccupancyReport(actor, filters);

  return <div className="admin-page stack occupancy-report-page">
    <header className="admin-page-heading"><div><span className="eyebrow">Accommodation operations</span><h1>Occupancy reports</h1><p>Review capacity, active allocations, and check-ins for lodges you can access.</p></div></header>
    <form method="get" className="card occupancy-report-filters" aria-label="Filter occupancy report">
      <label className="field"><span>Event</span><select name="event" defaultValue={filters.event ?? ""}><option value="">All events</option>{report.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
      <label className="field"><span>Lodge</span><select name="lodge" defaultValue={filters.lodge ?? ""}><option value="">All permitted lodges</option>{report.lodges.map((lodge) => <option key={lodge.id} value={lodge.id}>{lodge.name}</option>)}</select></label>
      <button className="btn secondary" type="submit">Apply filters</button>
      <Link className="text-button" href="/admin/occupancy-reports">Clear</Link>
    </form>
    <section className="occupancy-report-summary" aria-label="Occupancy summary">
      <article className="card"><span>Inventory capacity</span><strong>{report.summary.capacity.toLocaleString()}</strong><small>Units and bedspaces</small></article>
      <article className="card"><span>Reserved inventory</span><strong>{report.summary.reserved.toLocaleString()}</strong><small>Paid and actively allocated</small></article>
      <article className="card"><span>Guests checked in</span><strong>{report.summary.checkedIn.toLocaleString()}</strong><small>Current check-in count</small></article>
      <article className="card"><span>Guests awaiting allocation</span><strong>{report.summary.unassigned.toLocaleString()}</strong><small>Paid, not yet assigned</small></article>
    </section>
    <section className="card data-table-card occupancy-report-table-card" aria-labelledby="occupancy-report-table-heading">
      <div className="data-table-heading"><div><h2 id="occupancy-report-table-heading">Occupancy by accommodation</h2><span>{report.rows.length.toLocaleString()} categories</span></div></div>
      {report.rows.length ? <div className="data-table-wrap"><table className="data-table occupancy-report-table">
        <thead><tr><th scope="col">Event</th><th scope="col">Lodge</th><th scope="col">Accommodation</th><th scope="col">Capacity</th><th scope="col">Reserved</th><th scope="col">Occupancy</th><th scope="col">Guests checked in</th><th scope="col">Awaiting allocation</th></tr></thead>
        <tbody>{report.rows.map((row) => <tr key={row.categoryId}>
          <td data-label="Event">{row.eventName}</td>
          <td data-label="Lodge">{row.lodgeName}</td>
          <td data-label="Accommodation">{row.categoryName}<small>{row.mode === "PRIVATE" ? "Private" : "Shared"}</small></td>
          <td className="table-cell-nowrap" data-label="Capacity">{row.capacity} {row.spaceLabel}</td>
          <td className="table-cell-nowrap" data-label="Reserved">{row.reserved}</td>
          <td className="table-cell-nowrap" data-label="Occupancy"><span className="occupancy-rate"><span style={{ width: `${row.occupancyPercent}%` }} />{row.occupancyPercent}%</span></td>
          <td className="table-cell-nowrap" data-label="Guests checked in">{row.checkedIn}</td>
          <td className="table-cell-nowrap" data-label="Awaiting allocation">{row.unassigned}</td>
        </tr>)}</tbody>
      </table></div> : <div className="empty-state"><h3>No occupancy data found</h3><p>Try another event or lodge.</p></div>}
    </section>
  </div>;
}
