import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { getCurrentActor } from "@/lib/auth/session";
import { getBookingReport } from "@/lib/admin/reports";
import { formatNaira } from "@/lib/format-currency";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; event?: string }> }) {
  const actor = await getCurrentActor();
  if (!actor) return null;
  if (!actor.globalPermissions.has("reports.read") && !actor.scopedPermissions.has("reports.read")) notFound();
  const filters = await searchParams;
  const report = await getBookingReport(actor, { from: filters.from, to: filters.to, eventId: filters.event });
  const exportQuery = new URLSearchParams(Object.entries({ from: filters.from, to: filters.to, event: filters.event }).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString();
  const canExport = actor.globalPermissions.has("reports.export") || actor.scopedPermissions.has("reports.export");
  return <div className="admin-page stack">
    <div className="admin-page-heading"><div><span className="eyebrow">Operations</span><h1>Reports</h1><p>Booking and payment overview for your permitted lodges.</p></div>{canExport && <Link className="btn" href={`/api/admin/reports/bookings.csv${exportQuery ? `?${exportQuery}` : ""}`}>Download CSV</Link>}</div>
    <form className="card report-filters" method="get"><label className="field"><span>Event</span><select name="event" defaultValue={filters.event ?? ""}><option value="">All events</option>{report.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label><label className="field"><span>Created from</span><input type="date" name="from" defaultValue={filters.from} /></label><label className="field"><span>Created to</span><input type="date" name="to" defaultValue={filters.to} /></label><button className="btn secondary" type="submit">Apply filters</button><Link className="text-button" href="/admin/reports">Clear</Link></form>
    <section className="grid report-summary" aria-label="Report summary"><article className="card"><span>Total bookings</span><strong>{report.summary.bookings}</strong></article><article className="card"><span>Paid</span><strong>{report.summary.paid}</strong></article><article className="card"><span>Awaiting payment</span><strong>{report.summary.pending}</strong></article><article className="card"><span>Cancelled</span><strong>{report.summary.cancelled}</strong></article><article className="card"><span>Guests</span><strong>{report.summary.guests}</strong></article><article className="card"><span>Paid value before refunds</span><strong>{formatNaira(report.summary.paidAmountMinor)}</strong></article></section>
    <section className="card report-table-card"><div className="admin-section-heading"><div><h2>Bookings</h2><p>{report.rows.length} matching record{report.rows.length === 1 ? "" : "s"}</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Reference</th><th>Created</th><th>Guest</th><th>Lodge / apartment</th><th>Guests</th><th>Payment</th><th>Stay</th><th>Amount</th></tr></thead><tbody>{report.rows.map((row) => <tr key={row.id}><td><Link href={`/admin/bookings/${row.id}`}>{row.reference}</Link></td><td>{row.createdAt.toLocaleDateString("en-NG")}</td><td>{row.bookerName}<small>{row.bookerPhone} · {row.bookerEmail}</small></td><td>{row.lodgeName}<small>{row.categoryName}</small></td><td>{row.occupantCount}</td><td><Badge tone={row.paymentStatus === "PAID" ? "brand" : "default"}>{row.paymentStatus}</Badge></td><td>{row.accommodationStatus.replaceAll("_", " ")}</td><td>{formatNaira(row.amountMinor)}</td></tr>)}</tbody></table></div>{report.rows.length === 0 && <p className="empty-state">No bookings match these filters.</p>}</section>
  </div>;
}
