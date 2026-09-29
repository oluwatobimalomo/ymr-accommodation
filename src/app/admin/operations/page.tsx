import Link from "next/link";
import { requireActor } from "@/lib/auth/require";
import { getOperationsOverview } from "@/lib/booking/operations";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guest Operations" };

const STATUS_LABEL: Record<string, string> = {
  UNALLOCATED: "Needs allocation",
  ALLOCATED: "Ready for check-in",
  CHECKED_IN: "On site",
  CHECKED_OUT: "Checked out",
};

function OperationsIcon({ kind }: { kind: "allocation" | "ready" | "onsite" | "checkout" }) {
  const shapes = {
    allocation: <><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h4"/><path d="M16 15h4m-2-2v4"/></>,
    ready: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
    onsite: <><path d="M4 19v-1a8 8 0 0 1 16 0v1"/><circle cx="12" cy="8" r="4"/></>,
    checkout: <><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5m-1 3 2 2 4-4"/></>,
  };
  return <span className="operations-summary-icon"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{shapes[kind]}</svg></span>;
}

export default async function AdminOperationsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; lodge?: string; page?: string }> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const data = await getOperationsOverview(actor, params);
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.status) query.set("status", params.status);
  if (params.lodge) query.set("lodge", params.lodge);
  const pageHref = (page: number) => {
    const next = new URLSearchParams(query);
    next.set("page", String(page));
    return `/admin/operations?${next.toString()}`;
  };

  return <div className="admin-page stack operations-page">
    <header className="admin-page-heading"><div><span className="eyebrow">On-site workflow</span><h1>Guest operations</h1><p>Find paid guests, confirm room assignments, and continue check-in or key handover.</p></div></header>
    <section className="operations-summary" aria-label="Guest accommodation status">
      <article><OperationsIcon kind="allocation"/><span>Needs allocation</span><strong>{data.totals.UNALLOCATED}</strong></article>
      <article><OperationsIcon kind="ready"/><span>Ready for check-in</span><strong>{data.totals.ALLOCATED}</strong></article>
      <article><OperationsIcon kind="onsite"/><span>On site</span><strong>{data.totals.CHECKED_IN}</strong></article>
      <article><OperationsIcon kind="checkout"/><span>Checked out</span><strong>{data.totals.CHECKED_OUT}</strong></article>
    </section>
    <form method="get" className="card operations-filters" aria-label="Search guest operations">
      <label className="field"><span>Search</span><input name="q" type="search" defaultValue={params.q} placeholder="Name, phone, email or ref" /></label>
      <label className="field"><span>Accommodation status</span><select name="status" defaultValue={params.status ?? ""}><option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field"><span>Lodge</span><select name="lodge" defaultValue={params.lodge ?? ""}><option value="">All lodges</option>{data.lodges.map((lodge) => <option key={lodge.id} value={lodge.id}>{lodge.name}</option>)}</select></label>
      <button className="btn secondary" type="submit">Search</button>
      <Link className="text-button" href="/admin/operations">Reset</Link>
    </form>
    <section className="card operations-list" aria-labelledby="operations-list-heading">
      <div className="admin-section-heading"><div><h2 id="operations-list-heading">Guests</h2><p>{data.total.toLocaleString()} matching occupants · page {data.page}</p></div></div>
      {data.rows.length ? <div className="operations-guest-list">{data.rows.map((guest) => <article className="operations-guest-card" key={guest.occupantId}>
        <div className="operations-guest-main"><span className="eyebrow">{guest.lodgeName} · {guest.categoryName}</span><h3>{guest.occupantName}</h3><p className="operations-guest-contact"><span className="operations-guest-phone">{guest.occupantPhone || "No phone"}</span>{guest.occupantEmail && <span className="operations-guest-email">{guest.occupantEmail}</span>}</p><small>Booking <Link href={`/admin/bookings/${guest.bookingId}`}>{guest.reference}</Link></small></div>
        <div className="operations-guest-location"><strong>{guest.roomName ? `${guest.roomName}${guest.bedspaceLetter ? ` · Bedspace ${guest.bedspaceLetter}` : ""}` : guest.unitName ?? "Not allocated"}</strong><span>{guest.checkInDate ? `Expected ${new Date(`${guest.checkInDate}T00:00:00`).toLocaleDateString("en-NG")}` : "Expected check-in not set"}</span>{guest.keyLabel && <span>Key {guest.keyLabel} issued</span>}</div>
        <div className="operations-guest-action"><span className={`status-pill status-${guest.accommodationStatus.toLowerCase()}`}>{STATUS_LABEL[guest.accommodationStatus] ?? guest.accommodationStatus}</span><Link className="btn secondary" href={`/admin/bookings/${guest.bookingId}`}>Open booking</Link></div>
      </article>)}</div> : <p className="empty-state">No paid occupants match these filters.</p>}
      <nav className="table-pagination" aria-label="Guest operations pages"><span>Showing {data.total ? (data.page - 1) * data.pageSize + 1 : 0}–{Math.min(data.page * data.pageSize, data.total)} of {data.total}</span><div>{data.page > 1 && <Link className="btn secondary" href={pageHref(data.page - 1)}>Previous</Link>}{data.page * data.pageSize < data.total && <Link className="btn secondary" href={pageHref(data.page + 1)}>Next</Link>}</div></nav>
    </section>
  </div>;
}
