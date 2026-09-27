import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { getCurrentActor } from "@/lib/auth/session";
import { getBookingReport } from "@/lib/admin/reports";
import { formatNaira } from "@/lib/format-currency";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

function ReportMetricIcon({ kind }: { kind: "revenue" | "bookings" | "paid" | "pending" | "guests" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths = {
    revenue: <><circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.7-.6-1.7-.9-2.8-.9-1.6 0-2.7.8-2.7 2s1.1 1.8 2.7 2.2c1.7.4 2.8 1 2.8 2.3s-1.2 2.2-3 2.2c-1.2 0-2.3-.4-3.1-1.2M12 6v12"/></>,
    bookings: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h4"/></>,
    paid: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
    pending: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    guests: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1m1-12a3 3 0 0 1 0 6m2 1a5 5 0 0 1 3 5v1"/></>,
  };
  return <span className="report-metric-icon"><svg aria-hidden="true" viewBox="0 0 24 24" {...common}>{paths[kind]}</svg></span>;
}

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; event?: string; status?: string; page?: string }> }) {
  const actor = await getCurrentActor();
  if (!actor) return null;
  if (!actor.globalPermissions.has("reports.read") && !actor.scopedPermissions.has("reports.read")) notFound();
  const filters = await searchParams;
  const report = await getBookingReport(actor, { from: filters.from, to: filters.to, eventId: filters.event, status: filters.status, page: filters.page });
  const exportQuery = new URLSearchParams(Object.entries({ from: filters.from, to: filters.to, event: filters.event, status: filters.status }).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString();
  const canExport = actor.globalPermissions.has("reports.export") || actor.scopedPermissions.has("reports.export");
  const pageQuery = new URLSearchParams(exportQuery);
  const previous = new URLSearchParams(pageQuery); previous.set("page", String(Math.max(1, report.page - 1)));
  const next = new URLSearchParams(pageQuery); next.set("page", String(report.page + 1));
  const maxDaily = Math.max(1, ...report.daily.map((day) => day.amountMinor));
  return <div className="admin-page stack reports-dashboard">
    <div className="admin-page-heading"><div><span className="eyebrow">Operations intelligence</span><h1>Reports</h1><p>Revenue and accommodation activity across your permitted lodges.</p></div>{canExport && <Link className="btn" href={`/api/admin/reports/bookings.csv${exportQuery ? `?${exportQuery}` : ""}`}>Download CSV</Link>}</div>
    <form className="card report-filters" method="get"><label className="field"><span>Event</span><select name="event" defaultValue={filters.event ?? ""}><option value="">All events</option>{report.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label><label className="field"><span>Order status</span><select name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option><option value="PAID">Paid</option><option value="PENDING">Pending</option><option value="FAILED">Failed</option><option value="REFUNDED">Refunded</option><option value="CANCELLED">Cancelled</option></select></label><details className="report-custom-period" open={Boolean(filters.from || filters.to)}><summary>Custom Period</summary><div className="report-period-fields"><label className="field"><span>From</span><input type="date" name="from" defaultValue={filters.from} /></label><label className="field"><span>To</span><input type="date" name="to" defaultValue={filters.to} /></label></div></details><div className="report-filter-actions"><button className="btn secondary" type="submit">Apply filters</button><Link className="text-button" href="/admin/reports">Clear filters</Link></div></form>
    <section className="report-summary" aria-label="Report summary">
      <article className="report-metric"><ReportMetricIcon kind="revenue"/><div><small>Paid revenue</small><strong>{formatNaira(report.summary.paidAmountMinor)}</strong></div></article>
      <article className="report-metric"><ReportMetricIcon kind="bookings"/><div><small>Total bookings</small><strong>{report.summary.bookings.toLocaleString()}</strong></div></article>
      <article className="report-metric"><ReportMetricIcon kind="paid"/><div><small>Paid bookings</small><strong>{report.summary.paid.toLocaleString()}</strong></div></article>
      <article className="report-metric"><ReportMetricIcon kind="pending"/><div><small>Awaiting payment</small><strong>{report.summary.pending.toLocaleString()}</strong></div></article>
      <article className="report-metric"><ReportMetricIcon kind="guests"/><div><small>Guests</small><strong>{report.summary.guests.toLocaleString()}</strong></div></article>
    </section>
    <section className="card report-chart-card"><div className="admin-section-heading"><div><span className="eyebrow">Paid booking value</span><h2>Revenue over time</h2></div><span>Daily · {report.daily.length} days</span></div>
      {report.daily.length ? <div className="report-bar-chart" role="img" aria-label="Daily paid revenue chart">{report.daily.map((day) => <div className="report-bar-column" key={day.date} title={`${day.date}: ${formatNaira(day.amountMinor)}`}><span style={{ height: `${Math.max(3, day.amountMinor / maxDaily * 100)}%` }} /><small>{day.date.slice(5)}</small></div>)}</div> : <p className="empty-state">No paid booking activity in this date range.</p>}
    </section>
    <section className="card report-table-card"><div className="admin-section-heading"><div><h2>Booking activity</h2><p>{report.totalRows.toLocaleString()} matching records · page {report.page}</p></div></div><div className="table-scroll"><table className="data-table report-bookings-table"><colgroup><col style={{ width: "13%" }} /><col style={{ width: "8%" }} /><col style={{ width: "9%" }} /><col style={{ width: "11%" }} /><col style={{ width: "16%" }} /><col style={{ width: "15%" }} /><col style={{ width: "4%" }} /><col style={{ width: "9%" }} /><col style={{ width: "7%" }} /><col style={{ width: "8%" }} /></colgroup><thead><tr><th>Reference</th><th>Created</th><th>Customer</th><th>Phone</th><th>Email</th><th>Lodge / apartment</th><th>Guests</th><th>Payment</th><th>Stay</th><th>Amount</th></tr></thead><tbody>{report.rows.map((row) => <tr key={row.id}><td data-label="Reference"><Link href={`/admin/bookings/${row.id}`} className="booking-ref">{row.reference}</Link></td><td className="table-cell-nowrap" data-label="Created">{row.createdAt.toLocaleDateString("en-NG")}</td><td data-label="Customer">{row.bookerName}</td><td className="table-cell-nowrap" data-label="Phone">{row.bookerPhone}</td><td className="table-cell-nowrap email-cell" data-label="Email">{row.bookerEmail}</td><td data-label="Lodge / apartment">{row.lodgeName}<small>{row.categoryName}</small></td><td className="table-cell-nowrap" data-label="Guests">{row.occupantCount}</td><td data-label="Payment"><Badge tone={row.paymentStatus === "PAID" ? "brand" : "default"}>{row.paymentStatus}</Badge></td><td className="table-cell-nowrap" data-label="Stay">{row.accommodationStatus.replaceAll("_", " ")}</td><td className="table-cell-nowrap" data-label="Amount">{formatNaira(row.amountMinor)}</td></tr>)}</tbody></table></div>{report.rows.length === 0 && <p className="empty-state">No bookings match these filters.</p>}<nav className="table-pagination" aria-label="Report pages"><span>Showing {report.totalRows ? (report.page - 1) * report.pageSize + 1 : 0}–{Math.min(report.page * report.pageSize, report.totalRows)} of {report.totalRows}</span><div>{report.page > 1 && <Link className="btn secondary" href={`/admin/reports?${previous}`}>Previous</Link>}{report.page * report.pageSize < report.totalRows && <Link className="btn secondary" href={`/admin/reports?${next}`}>Next</Link>}</div></nav></section>
  </div>;
}
