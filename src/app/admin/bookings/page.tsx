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

function BookingMetricIcon({ kind }: { kind: "revenue" | "transactions" | "paid" | "pending" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths = {
    revenue: <><circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.7-.6-1.7-.9-2.8-.9-1.6 0-2.7.8-2.7 2s1.1 1.8 2.7 2.2c1.7.4 2.8 1 2.8 2.3s-1.2 2.2-3 2.2c-1.2 0-2.3-.4-3.1-1.2M12 6v12"/></>,
    transactions: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h4"/></>,
    paid: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
    pending: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  };
  return <span className="booking-metric-icon"><svg aria-hidden="true" viewBox="0 0 24 24" {...common}>{paths[kind]}</svg></span>;
}

export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const [data, lodges] = await Promise.all([getBookingsDashboard(actor, params), listLodges(actor)]);
  const canSeeFinancials = actor.globalPermissions.has("payment.read") || actor.scopedPermissions.has("payment.read");
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
      {canSeeFinancials && <section className="metric-grid booking-metrics" aria-label="Booking metrics">
        <article className="metric-card"><BookingMetricIcon kind="revenue"/><div><span>Paid booking value</span><strong>{formatNaira(Number(totals.amountMinor ?? 0))}</strong><small>For the selected filters</small></div></article>
        <article className="metric-card"><BookingMetricIcon kind="transactions"/><div><span>Payment transactions</span><strong>{transactionCount}</strong><small>Attempts across matching bookings</small></div></article>
        <article className="metric-card"><BookingMetricIcon kind="paid"/><div><span>Paid bookings</span><strong>{totals.paid}</strong><small>Successfully paid</small></div></article>
        <article className="metric-card"><BookingMetricIcon kind="pending"/><div><span>Awaiting payment</span><strong>{totals.pending}</strong><small>Payment still pending</small></div></article>
      </section>}
      <form method="get" className="directory-tools booking-filters" aria-label="Filter bookings">
        <div className="admin-filter-heading"><div><span className="eyebrow">Refine results</span><strong>Booking filters</strong></div><span>Results update when a filter changes</span></div>
        {canSeeFinancials && <label className="directory-sort"><span>Payment status</span><AutoSubmitSelect name="status" defaultValue={params.status ?? ""} options={[{ value: "", label: "All statuses" }, { value: "PAID", label: "Successful · Paid" }, { value: "PENDING", label: "Pending" }, { value: "FAILED", label: "Failed" }, { value: "CANCELLED", label: "Cancelled · Abandoned" }, { value: "REFUNDED", label: "Refunded" }]} /></label>}
        <label className="directory-sort"><span>Lodge</span><AutoSubmitSelect name="lodgeId" defaultValue={params.lodgeId ?? ""} options={[{ value: "", label: "All lodges" }, ...lodges.map((lodge) => ({ value: lodge.id, label: lodge.name }))]} /></label>
        <label className="support-date-filter"><span>From</span><AutoSubmitDate name="from" defaultValue={params.from} /></label>
        <label className="support-date-filter"><span>To</span><AutoSubmitDate name="to" defaultValue={params.to} /></label>
      </form>
      <details className="booking-export-options"><summary>Export bookings</summary><form action="/api/admin/bookings.csv" method="get" className="booking-export-form">
        {(["status", "lodgeId", "from", "to"] as const).map((key) => params[key] ? <input key={key} type="hidden" name={key} value={params[key]} /> : null)}
        <fieldset><legend>Select columns to include</legend>{[["reference","Reference"],["createdAt","Order date"],["name","Customer name"],["phone","Phone number"],["email","Email address"],["lodge","Lodge"],["apartment","Apartment"],...(canSeeFinancials ? [["amount","Amount paid"],["payment","Order status"]] : []),["stay","Accommodation status"]].map(([value,label]) => <label key={value}><input type="checkbox" name="column" value={value} defaultChecked />{label}</label>)}</fieldset>
        <button className="btn secondary" type="submit">Download CSV</button>
      </form></details>
      {rows.length === 0 ? <div className="empty-state card"><h2>No matching bookings</h2><p>Try widening the date range or clearing one of the filters.</p></div> : (
        <div className="card data-table-card">
          <div className="data-table-heading"><h2>Booking activity</h2><span>{totals.count} matching bookings · page {page}</span></div>
          <div className="data-table-wrap"><table className="data-table">
            <thead><tr><th>Ticket ID</th><th>Booker</th><th>Lodge / Apartment</th>{canSeeFinancials && <><th>Amount</th><th>Payment</th></>}<th>Accommodation</th><th>Booked</th></tr></thead>
            <tbody>{rows.map((booking) => <tr key={booking.id}>
              <td data-label="Ticket ID"><Link href={`/admin/bookings/${booking.id}`} className="booking-ref">{booking.reference}</Link></td>
              <td data-label="Booker">{booking.bookerName}</td>
              <td data-label="Lodge / Apartment">{booking.lodgeName}<small>{booking.categoryName}</small></td>
              {canSeeFinancials && <><td className="table-cell-nowrap" data-label="Amount">{formatNaira(booking.amountMinor)}</td>
              <td data-label="Payment"><span className={`status-pill status-${booking.paymentStatus.toLowerCase()}`}>{PAYMENT_LABEL[booking.paymentStatus]}</span></td></>}
              <td className="table-cell-nowrap" data-label="Accommodation">{booking.accommodationStatus.replace(/_/g, " ")}</td>
              <td className="table-cell-nowrap" data-label="Booked">{booking.createdAt.toLocaleDateString()}</td>
            </tr>)}</tbody>
          </table></div>
          <nav className="table-pagination" aria-label="Booking pages"><span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, totals.count)} of {totals.count}</span><div>{page > 1 && <Link className="btn secondary" href={previousHref}>Previous</Link>}{page * limit < totals.count && <Link className="btn secondary" href={nextHref}>Next</Link>}</div></nav>
        </div>
      )}
    </div>
  );
}
