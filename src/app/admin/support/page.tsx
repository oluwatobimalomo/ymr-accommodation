import Link from "next/link";
import { ErrorBanner } from "@/components/AdminChrome";
import { requireActor } from "@/lib/auth/require";
import { listLodges } from "@/lib/inventory/lodges";
import { listTickets } from "@/lib/support/tickets";
import { AutoSubmitDate, AutoSubmitSelect } from "@/components/AutoSubmitSelect";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support tickets" };

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open", IN_PROGRESS: "In progress", WAITING_FOR_CUSTOMER: "Waiting for customer",
  ESCALATED: "Escalated", RESOLVED: "Resolved", CLOSED: "Closed",
};

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const [tickets, lodges] = await Promise.all([listTickets(actor, params), listLodges()]);
  const openCount = tickets.filter((t) => !["RESOLVED", "CLOSED"].includes(t.status)).length;
  const escalatedCount = tickets.filter((t) => t.status === "ESCALATED").length;
  const closedCount = tickets.filter((t) => t.status === "CLOSED").length;

  return (
    <div className="stack">
      <div className="admin-page-heading"><div><span className="eyebrow">Guest care</span><h1>Support inbox</h1><p>Track requests, coordinate follow-up, and record resolutions.</p></div></div>
      <ErrorBanner error={params.error} />
      <section className="metric-grid support-metrics" aria-label="Support ticket metrics">
        <article className="metric-card"><span>Matching tickets</span><strong>{tickets.length}</strong><small>Latest 100 matching requests</small></article>
        <article className="metric-card"><span>Needs attention</span><strong>{openCount}</strong><small>Open, in progress, or awaiting follow-up</small></article>
        <article className="metric-card"><span>Escalated</span><strong>{escalatedCount}</strong><small>Priority follow-up required</small></article>
        <article className="metric-card"><span>Closed</span><strong>{closedCount}</strong><small>Resolved and documented</small></article>
      </section>
      <form method="get" className="directory-tools support-filters" aria-label="Filter support tickets">
        <div className="admin-filter-heading"><div><span className="eyebrow">Stay on top of requests</span><strong>Inbox filters</strong></div><span>Results update when a filter changes</span></div>
        <label className="directory-sort"><span>Status</span><AutoSubmitSelect name="status" defaultValue={params.status ?? ""} options={[{ value: "", label: "All statuses" }, ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))]} /></label>
        <label className="directory-sort"><span>Category</span><AutoSubmitSelect name="category" defaultValue={params.category ?? ""} options={[{ value: "", label: "All categories" }, ...["PAYMENT", "BOOKING", "ACCOMMODATION", "ALLOCATION", "CHECK_IN", "KEY", "REFUND", "GENERAL"].map((value) => ({ value, label: value.replace(/_/g, " ") }))]} /></label>
        <label className="directory-sort"><span>Preferred contact</span><AutoSubmitSelect name="preference" defaultValue={params.preference ?? ""} options={[{ value: "", label: "Any preference" }, { value: "CALL", label: "Phone call" }, { value: "WHATSAPP", label: "WhatsApp" }]} /></label>
        <label className="directory-sort"><span>Lodge</span><AutoSubmitSelect name="lodgeId" defaultValue={params.lodgeId ?? ""} options={[{ value: "", label: "All lodges" }, ...lodges.map((lodge) => ({ value: lodge.id, label: lodge.name }))]} /></label>
        <label className="support-date-filter"><span>From</span><AutoSubmitDate name="from" defaultValue={params.from} /></label>
        <label className="support-date-filter"><span>To</span><AutoSubmitDate name="to" defaultValue={params.to} /></label>
      </form>
      {tickets.length === 0 ? <div className="empty-state card"><h2>No matching support requests</h2><p>Adjust the filters or check back when guests submit a request.</p></div> : (
        <div className="support-ticket-list">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`/admin/support/${ticket.id}`} className="support-ticket-card">
              <div className="support-ticket-main"><span className="eyebrow">{ticket.reference} · {ticket.category.replace(/_/g, " ")}</span><h2>{ticket.subject}</h2><p>{ticket.customerName} · {ticket.customerPhone} · prefers {ticket.contactPreference === "CALL" ? "a call" : "WhatsApp"}</p><small>{ticket.lodgeName ? `${ticket.lodgeName} · ` : "General support · "}{ticket.createdAt.toLocaleString()}</small></div>
              <span className={`status-pill status-${ticket.status.toLowerCase().replace(/_/g, "-")}`}>{STATUS_LABEL[ticket.status]}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
