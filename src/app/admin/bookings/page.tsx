import Link from "next/link";
import { AutoSubmitDate, AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { ErrorBanner } from "@/components/AdminChrome";
import { requireActor } from "@/lib/auth/require";
import { getBookingsDashboard } from "@/lib/booking/admin-queries";
import { formatNaira } from "@/lib/format-currency";
import { listLodges } from "@/lib/inventory/lodges";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bookings" };

const PAYMENT_LABEL: Record<string, string> = { PENDING: "Pending", PAID: "Paid", FAILED: "Failed", REFUNDED: "Refunded", CANCELLED: "Cancelled / abandoned" };

export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const [data, lodges] = await Promise.all([getBookingsDashboard(actor, params), listLodges()]);
  const { rows, totals, transactionCount, page, limit } = data;
  const query = new URLSearchParams();
  for (const key of ["status", "lodgeId", "from", "to"]) if (params[key]) query.set(key, params[key]!);
  const previousQuery = new URLSearchParams(query);
  previousQuery.set("page", String(page - 1));
  const nextQuery = new URLSearchParams(query);
  nextQuery.set("page", String(page + 1));
  const previousHref = `/admin/bookings?${previousQuery.toString()}`;
  const nextHref = `/admin/bookings?${nextQuery.toString()}`;

  return (
    <div className="stack">
      <div className="admin-page-heading"><div><span className="eyebrow">Reservations &amp; payments</span><h1>Bookings</h1><p>Monitor booking outcomes, payment activity, and accommodation allocation.</p></div></div>
      <ErrorBanner error={params.error} />
      <section className="metric-grid booking-metrics" aria-label="Booking metrics">
        <article className="metric-card"><span>Paid booking value</span><strong>{formatNaira(Number(totals.amountMinor ?? 0))}</strong><small>For the selected filters</small></article>
        <article className="metric-card"><span>Payment transactions</span><strong>{transactionCount}</strong><small>Attempts across matching bookings</small></article>
        <article className="metric-card"><span>Paid bookings</span><strong>{totals.paid}</strong><small>Successfully paid</small></article>
        <article className="metric-card"><span>Awaiting payment</span><strong>{totals.pending}</strong><small>Payment still pending</small></article>
      </section>
      <form method="get" className="directory-tools booking-filters" aria-label="Filter bookings">
        <div className="admin-filter-heading"><div><span className="eyebrow">Refine results</span><strong>Booking filters</strong></div><span>Results update when a filter changes</span></div>
        <label className="directory-sort"><span>Payment status</span><AutoSubmitSelect name="status" defaultValue={params.status ?? ""} options={[{ value: "", label: "All statuses" }, { value: "PAID", label: "Successful · Paid" }, { value: "PENDING", label: "Pending" }, { value: "FAILED", label: "Failed" }, { value: "CANCELLED", label: "Cancelled · Abandoned" }, { value: "REFUNDED", label: "Refunded" }]} /></label>
        <label className="directory-sort"><span>Lodge</span><AutoSubmitSelect name="lodgeId" defaultValue={params.lodgeId ?? ""} options={[{ value: "", label: "All lodges" }, ...lodges.map((lodge) => ({ value: lodge.id, label: lodge.name }))]} /></label>
        <label className="support-date-filter"><span>From</span><AutoSubmitDate name="from" defaultValue={params.from} /></label>
        <label className="support-date-filter"><span>To</span><AutoSubmitDate name="to" defaultValue={params.to} /></label>
      </form>
      {rows.length === 0 ? <div className="empty-state card"><h2>No matching bookings</h2><p>Try widening the date range or clearing one of the filters.</p></div> : (
        <div className="card data-table-card">
          <div className="data-table-heading"><h2>Booking activity</h2><span>{totals.count} matching bookings · page {page}</span></div>
          <div className="data-table-wrap"><table className="data-table">
            <thead><tr><th>Ticket ID</th><th>Booker</th><th>Lodge / Apartment</th><th>Amount</th><th>Payment</th><th>Accommodation</th><th>Booked</th></tr></thead>
            <tbody>{rows.map((booking) => <tr key={booking.id}>
              <td data-label="Ticket ID"><Link href={`/admin/bookings/${booking.id}`} className="booking-ref">{booking.reference}</Link></td>
              <td data-label="Booker">{booking.bookerName}</td>
              <td data-label="Lodge / Apartment">{booking.lodgeName}<small>{booking.categoryName}</small></td>
              <td data-label="Amount">{formatNaira(booking.amountMinor)}</td>
              <td data-label="Payment"><span className={`status-pill status-${booking.paymentStatus.toLowerCase()}`}>{PAYMENT_LABEL[booking.paymentStatus]}</span></td>
              <td data-label="Accommodation">{booking.accommodationStatus.replace(/_/g, " ")}</td>
              <td data-label="Booked">{booking.createdAt.toLocaleDateString()}</td>
            </tr>)}</tbody>
          </table></div>
          <nav className="table-pagination" aria-label="Booking pages"><span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, totals.count)} of {totals.count}</span><div>{page > 1 && <Link className="btn secondary" href={previousHref}>Previous</Link>}{page * limit < totals.count && <Link className="btn secondary" href={nextHref}>Next</Link>}</div></nav>
        </div>
      )}
    </div>
  );
}
