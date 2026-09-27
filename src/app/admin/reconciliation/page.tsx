import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { reconcilePayments } from "@/lib/payments/reconciliation";
import { formatNaira } from "@/lib/format-currency";
import { formatDateTime } from "@/lib/format-date";

export const dynamic = "force-dynamic";
export const metadata = { title: "Paystack reconciliation" };

function dateLabel(value: Date | string | null) {
  return formatDateTime(value, { dateStyle: "medium" }) ?? "—";
}

function amount(value: number | null, currency: string | null) {
  if (value === null) return "—";
  return currency?.toUpperCase() === "NGN" ? formatNaira(value) : `${(value / 100).toFixed(2)} ${currency ?? ""}`;
}

const resultLabels = {
  MATCHED: "Matched",
  MISMATCH: "Mismatch",
  LOCAL_ONLY: "Only in app",
  PAYSTACK_ONLY: "Only in Paystack",
  NOT_CHECKED: "Not checked",
} as const;

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const actor = await requireActor();
  if (!can(actor, "payment.reconcile")) notFound();
  const filters = await searchParams;
  let result: Awaited<ReturnType<typeof reconcilePayments>> | null = null;
  let error: string | null = null;
  try {
    result = await reconcilePayments(filters);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Could not reconcile transactions. Try again.";
  }

  return <div className="admin-page stack reconciliation-page">
    <header className="admin-page-heading"><div><span className="eyebrow">Payments</span><h1>Paystack reconciliation</h1><p>Compare locally recorded payment attempts with Paystack transactions. This review does not change payment or booking records.</p></div></header>
    <form method="get" className="card reconciliation-filters" aria-label="Choose reconciliation date range">
      <label className="field"><span>From</span><input type="date" name="from" defaultValue={result?.from ?? filters.from} required /></label>
      <label className="field"><span>To</span><input type="date" name="to" defaultValue={result?.to ?? filters.to} required /></label>
      <button className="btn secondary" type="submit">Run reconciliation</button>
    </form>
    {error && <div className="reconciliation-notice" role="alert">{error}</div>}
    {result && <>
      <section className="reconciliation-summary" aria-label="Reconciliation summary">
        <article className="card"><span>Matched</span><strong>{result.counts.matched}</strong></article>
        <article className="card"><span>Needs review</span><strong>{result.counts.mismatch}</strong></article>
        <article className="card"><span>Only in app</span><strong>{result.counts.localOnly}</strong></article>
        <article className="card"><span>Only in Paystack</span><strong>{result.counts.paystackOnly}</strong></article>
      </section>
      {result.truncated && <div className="reconciliation-notice" role="status">Paystack has more pages than were loaded. “Only in app” results are marked “Not checked” to avoid false discrepancies. Narrow the date range for a complete comparison.</div>}
      <section className="card data-table-card reconciliation-table-card" aria-labelledby="reconciliation-table-heading">
        <div className="data-table-heading"><div><h2 id="reconciliation-table-heading">Transaction comparison</h2><span>{result.from} to {result.to} · {result.rows.length.toLocaleString()} records</span></div></div>
        {result.rows.length ? <div className="data-table-wrap"><table className="data-table reconciliation-table">
          <thead><tr><th scope="col">Reference</th><th scope="col">App status</th><th scope="col">Paystack status</th><th scope="col">App amount</th><th scope="col">Paystack amount</th><th scope="col">Date</th><th scope="col">Result</th></tr></thead>
          <tbody>{result.rows.map((row, index) => <tr key={`${row.reference}-${row.paystackId ?? row.localId}-${index}`}>
            <td data-label="Reference"><code>{row.reference}</code></td>
            <td data-label="App status">{row.localStatus ?? "—"}</td>
            <td data-label="Paystack status">{row.paystackStatus ?? "—"}</td>
            <td className="table-cell-nowrap" data-label="App amount">{amount(row.localAmount, row.localCurrency)}</td>
            <td className="table-cell-nowrap" data-label="Paystack amount">{amount(row.paystackAmount, row.paystackCurrency)}</td>
            <td className="table-cell-nowrap" data-label="Date">{dateLabel(row.localDate ?? row.paystackDate)}</td>
            <td data-label="Result"><span className={`reconciliation-result reconciliation-result-${row.result.toLowerCase()}`}>{resultLabels[row.result]}</span></td>
          </tr>)}</tbody>
        </table></div> : <div className="empty-state"><h3>No transactions in this period</h3><p>Choose another date range to review transactions.</p></div>}
      </section>
    </>}
  </div>;
}
