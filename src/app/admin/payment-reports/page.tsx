import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { getPaymentReport } from "@/lib/admin/payment-reports";
import { formatNaira } from "@/lib/format-currency";
import { formatDateTime } from "@/lib/format-date";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment reports" };

function dateLabel(date: Date | null) {
  return formatDateTime(date) ?? "—";
}

export default async function AdminPaymentReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; status?: string; page?: string }> }) {
  const actor = await requireActor();
  // Financial totals and individual transaction amounts are restricted to the roles
  // granted the dedicated payment reconciliation permission.
  if (!can(actor, "payment.reconcile")) notFound();
  const filters = await searchParams;
  const report = await getPaymentReport(filters);
  const query = new URLSearchParams();
  if (report.from) query.set("from", report.from);
  if (report.to) query.set("to", report.to);
  if (report.status) query.set("status", report.status);
  const pageHref = (page: number) => { const params = new URLSearchParams(query); params.set("page", String(page)); return `/admin/payment-reports?${params}`; };
  const receivedLabel = report.summary.receivedByCurrency.length
    ? report.summary.receivedByCurrency.map(({ currency, amountMinor }) => `${currency.toUpperCase() === "NGN" ? formatNaira(Number(amountMinor ?? 0)) : `${(Number(amountMinor ?? 0) / 100).toFixed(2)} ${currency}`}`).join(" · ")
    : "—";

  return <div className="admin-page stack payment-report-page">
    <header className="admin-page-heading"><div><span className="eyebrow">Finance</span><h1>Payment reports</h1><p>Review recorded payment transactions and exceptions.</p></div></header>
    <form method="get" className="card payment-report-filters" aria-label="Filter payment report">
      <label className="field"><span>From</span><input type="date" name="from" defaultValue={report.from} /></label>
      <label className="field"><span>To</span><input type="date" name="to" defaultValue={report.to} /></label>
      <label className="field"><span>Transaction status</span><select name="status" defaultValue={report.status ?? ""}><option value="">All statuses</option><option value="SUCCESS">Successful</option><option value="PENDING">Pending</option><option value="FAILED">Failed</option><option value="AMOUNT_MISMATCH">Amount mismatch</option></select></label>
      <button className="btn secondary" type="submit">Apply filters</button>
      <Link className="text-button" href="/admin/payment-reports">Clear</Link>
    </form>
    <section className="payment-report-summary" aria-label="Payment summary">
      <article className="card"><span>Gross received*</span><strong>{receivedLabel}</strong></article>
      <article className="card"><span>Successful</span><strong>{report.summary.successful.toLocaleString()}</strong></article>
      <article className="card"><span>Pending</span><strong>{report.summary.pending.toLocaleString()}</strong></article>
      <article className="card"><span>Failed</span><strong>{report.summary.failed.toLocaleString()}</strong></article>
      <article className="card"><span>Amount exceptions</span><strong>{report.summary.mismatches.toLocaleString()}</strong></article>
    </section>
    <p className="payment-report-footnote">*Includes successful transactions flagged for amount review. This is the gross amount recorded by the app; Paystack settlement totals can differ due to fees, refunds, or settlement timing.</p>
    <section className="card data-table-card payment-report-table-card" aria-labelledby="payment-report-table-heading">
      <div className="data-table-heading"><div><h2 id="payment-report-table-heading">Transactions</h2><span>{report.total.toLocaleString()} records · page {report.page} of {report.pages}</span></div><Link className="text-link" href="/admin/reconciliation">Open reconciliation</Link></div>
      {report.rows.length ? <div className="data-table-wrap"><table className="data-table payment-report-table">
        <thead><tr><th scope="col">Reference</th><th scope="col">Paystack ID</th><th scope="col">Lodge / category</th><th scope="col">Status</th><th scope="col">Amount received</th><th scope="col">Recorded</th><th scope="col">Gateway response</th></tr></thead>
        <tbody>{report.rows.map((row) => <tr key={row.id}>
          <td data-label="Reference"><code>{row.reference}</code></td>
          <td className="table-cell-nowrap" data-label="Paystack ID">{row.paystackTransactionId ?? "—"}</td>
          <td data-label="Lodge / category">{row.lodgeName}<small>{row.categoryName}</small></td>
          <td data-label="Status"><span className={`status-pill status-${row.status.toLowerCase()}`}>{row.status.replaceAll("_", " ")}</span></td>
          <td className="table-cell-nowrap" data-label="Amount received">{row.currency.toUpperCase() === "NGN" ? formatNaira(row.amountMinor) : `${(row.amountMinor / 100).toFixed(2)} ${row.currency}`}</td>
          <td className="table-cell-nowrap" data-label="Recorded">{dateLabel(row.paidAt ?? row.createdAt)}</td>
          <td data-label="Gateway response">{row.gatewayResponse || "—"}</td>
        </tr>)}</tbody>
      </table></div> : <div className="empty-state"><h3>No payment transactions found</h3><p>Choose another period or clear the status filter.</p></div>}
      <nav className="table-pagination" aria-label="Payment report pages"><span>Showing {report.total ? (report.page - 1) * report.pageSize + 1 : 0}–{Math.min(report.page * report.pageSize, report.total)} of {report.total}</span><div>{report.page > 1 && <Link className="btn secondary" href={pageHref(report.page - 1)}>Previous</Link>}{report.page < report.pages && <Link className="btn secondary" href={pageHref(report.page + 1)}>Next</Link>}</div></nav>
    </section>
  </div>;
}
