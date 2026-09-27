import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { getCheckInReport } from "@/lib/admin/check-in-reports";
import { formatDateTime } from "@/lib/format-date";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check-in reports" };

function dateLabel(value: string | Date | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  return formatDateTime(date, { dateStyle: "medium" }) ?? "—";
}

function timeLabel(value: Date | null) {
  return formatDateTime(value) ?? "—";
}

const statusLabel = { ALLOCATED: "Expected", CHECKED_IN: "Checked in", CHECKED_OUT: "Checked out" } as const;

export default async function AdminCheckInReportsPage({ searchParams }: { searchParams: Promise<{ event?: string; lodge?: string; status?: string; from?: string; to?: string; q?: string; page?: string }> }) {
  const actor = await requireActor();
  if (!(can(actor, "booking.read") || [...actor.lodgeIds].some((lodgeId) => can(actor, "booking.read", { lodgeId })))) notFound();
  const report = await getCheckInReport(actor, await searchParams);
  const query = new URLSearchParams();
  for (const key of ["event", "lodge", "status", "from", "to", "q"] as const) if (report.filters[key]) query.set(key, report.filters[key]);
  const pageHref = (page: number) => {
    const next = new URLSearchParams(query);
    next.set("page", String(page));
    return `/admin/check-in-reports?${next}`;
  };
  const pages = Math.max(1, Math.ceil(report.total / report.pageSize));

  return <div className="admin-page stack check-in-report-page">
    <header className="admin-page-heading"><div><span className="eyebrow">Accommodation operations</span><h1>Check-in reports</h1><p>Review expected arrivals and guest check-in and check-out activity for lodges you can access.</p></div></header>
    <form method="get" className="card check-in-report-filters" aria-label="Filter check-in report">
      <label className="field"><span>Event</span><select name="event" defaultValue={report.filters.event}><option value="">All events</option>{report.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
      <label className="field"><span>Lodge</span><select name="lodge" defaultValue={report.filters.lodge}><option value="">All accessible lodges</option>{report.lodges.map((lodge) => <option key={lodge.id} value={lodge.id}>{lodge.name}</option>)}</select></label>
      <label className="field"><span>Guest status</span><select name="status" defaultValue={report.filters.status}><option value="">All statuses</option><option value="ALLOCATED">Expected</option><option value="CHECKED_IN">Checked in</option><option value="CHECKED_OUT">Checked out</option></select></label>
      <label className="field"><span>Search guest or reference</span><input type="search" name="q" maxLength={100} defaultValue={report.filters.q} placeholder="Name, contact, or reference" /></label>
      <label className="field"><span>Expected from</span><input type="date" name="from" defaultValue={report.filters.from} /></label>
      <label className="field"><span>Expected to</span><input type="date" name="to" defaultValue={report.filters.to} /></label>
      <button className="btn secondary" type="submit">Apply filters</button>
      <Link className="text-button" href="/admin/check-in-reports">Clear</Link>
    </form>
    <section className="check-in-report-summary" aria-label="Check-in summary">
      <article className="card"><span>Expected</span><strong>{report.summary.expected.toLocaleString()}</strong><small>Allocated guests</small></article>
      <article className="card"><span>Checked in</span><strong>{report.summary.checkedIn.toLocaleString()}</strong><small>Currently on site</small></article>
      <article className="card"><span>Checked out</span><strong>{report.summary.checkedOut.toLocaleString()}</strong><small>Stay completed</small></article>
      <article className="card"><span>Guests</span><strong>{report.summary.guests.toLocaleString()}</strong><small>Across filtered lodges</small></article>
    </section>
    <section className="card data-table-card check-in-report-table-card" aria-labelledby="check-in-report-table-heading">
      <div className="data-table-heading"><div><h2 id="check-in-report-table-heading">Guest arrival activity</h2><span>{report.total.toLocaleString()} matching guests · page {report.page} of {pages}</span></div></div>
      {report.rows.length ? <div className="data-table-wrap"><table className="data-table check-in-report-table">
        <thead><tr><th scope="col">Guest</th><th scope="col">Contact</th><th scope="col">Reference</th><th scope="col">Lodge / accommodation</th><th scope="col">Expected check-in</th><th scope="col">Status</th><th scope="col">Checked in at</th><th scope="col">Checked out at</th></tr></thead>
        <tbody>{report.rows.map((row) => <tr key={row.occupantId}>
          <td data-label="Guest">{row.occupantName}</td>
          <td data-label="Contact">{row.phone || "—"}<small>{row.email || "—"}</small></td>
          <td data-label="Reference"><Link className="booking-ref" href={`/admin/bookings/${row.bookingId}`}>{row.reference}</Link></td>
          <td data-label="Lodge / accommodation">{row.lodgeName}<small>{row.categoryName} · {row.roomLabel}</small></td>
          <td className="table-cell-nowrap" data-label="Expected check-in">{dateLabel(row.expectedCheckIn)}</td>
          <td data-label="Status"><span className={`status-pill status-${row.bookingStatus.toLowerCase()}`}>{statusLabel[row.bookingStatus as keyof typeof statusLabel] ?? row.bookingStatus}</span></td>
          <td className="table-cell-nowrap" data-label="Checked in at">{timeLabel(row.timestamps.checkedInAt)}</td>
          <td className="table-cell-nowrap" data-label="Checked out at">{timeLabel(row.timestamps.checkedOutAt)}</td>
        </tr>)}</tbody>
      </table></div> : <div className="empty-state"><h3>No guest arrival records found</h3><p>Change the filters or clear them to view other arrivals.</p></div>}
      <nav className="table-pagination" aria-label="Check-in report pages"><span>{report.total ? `Showing ${(report.page - 1) * report.pageSize + 1}–${Math.min(report.page * report.pageSize, report.total)} of ${report.total}` : "No records"}</span><div>{report.page > 1 && <Link className="btn secondary" href={pageHref(report.page - 1)}>Previous</Link>}{report.page < pages && <Link className="btn secondary" href={pageHref(report.page + 1)}>Next</Link>}</div></nav>
    </section>
  </div>;
}
