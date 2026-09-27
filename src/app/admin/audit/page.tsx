import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { listAuditEntries, type AuditFilters } from "@/lib/admin/audit";
import { formatDateTime } from "@/lib/format-date";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log" };

function dateLabel(value: Date) {
  return formatDateTime(value) ?? "—";
}

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<AuditFilters> }) {
  const actor = await requireActor();
  if (!can(actor, "audit.read")) notFound();
  const params = await searchParams;
  const { rows, page, pageSize, total } = await listAuditEntries(params);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const makePageHref = (nextPage: number) => {
    const query = new URLSearchParams();
    for (const key of ["q", "action", "from", "to"] as const) if (params[key]) query.set(key, params[key]!);
    query.set("page", String(nextPage));
    return `/admin/audit?${query}`;
  };

  return <div className="admin-page stack audit-page">
    <header className="admin-page-heading"><div><span className="eyebrow">Administration</span><h1>Audit log</h1><p>Review a time-ordered record of administrative and operational changes.</p></div></header>
    <form method="get" className="directory-tools audit-filters" aria-label="Filter audit log">
      <label className="audit-search"><span>Search history</span><input type="search" name="q" maxLength={120} defaultValue={params.q} placeholder="Actor, action, record ID, or reason" /></label>
      <label><span>Action</span><input name="action" maxLength={100} defaultValue={params.action} placeholder="e.g. inventory.price_changed" /></label>
      <label><span>From</span><input type="date" name="from" defaultValue={params.from} /></label>
      <label><span>To</span><input type="date" name="to" defaultValue={params.to} /></label>
      <div className="audit-filter-actions"><button className="btn secondary" type="submit">Apply filters</button><Link className="text-link" href="/admin/audit">Clear</Link></div>
    </form>
    <section className="card data-table-card audit-table-card" aria-labelledby="audit-entries-heading">
      <div className="data-table-heading"><h2 id="audit-entries-heading">Audit entries</h2><span>{total.toLocaleString()} matching records</span></div>
      {rows.length ? <div className="data-table-wrap"><table className="data-table audit-table">
        <thead><tr><th scope="col">Date and time</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Record</th><th scope="col">Reason</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td className="table-cell-nowrap" data-label="Date and time">{dateLabel(row.occurredAt)}</td>
          <td className="audit-actor" data-label="Actor">{row.actorLabel}</td>
          <td data-label="Action"><code>{row.action}</code></td>
          <td className="audit-record" data-label="Record"><strong>{row.entityType}</strong>{row.entityId && <small>{row.entityId}</small>}</td>
          <td className="audit-reason" data-label="Reason">{row.reason || <span className="listing-meta">—</span>}</td>
        </tr>)}</tbody>
      </table></div> : <div className="empty-state"><h3>No audit entries found</h3><p>Try clearing a filter or choosing a wider date range.</p></div>}
      <nav className="table-pagination" aria-label="Audit log pages"><span>{total ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : "No records"}</span><div>{page > 1 && <Link className="btn secondary" href={makePageHref(page - 1)}>Previous</Link>}{page < pages && <Link className="btn secondary" href={makePageHref(page + 1)}>Next</Link>}</div></nav>
    </section>
  </div>;
}
