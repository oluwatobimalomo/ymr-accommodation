import { ErrorBanner } from "@/components/AdminChrome";
import { requireActor } from "@/lib/auth/require";
import { listLodges } from "@/lib/inventory/lodges";
import { listTickets } from "@/lib/support/tickets";
import { AutoSubmitDate, AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { SupportTicketInbox } from "@/components/SupportTicketInbox";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support tickets" };

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open", IN_PROGRESS: "In progress", WAITING_FOR_CUSTOMER: "Waiting for customer",
  ESCALATED: "Escalated", RESOLVED: "Resolved", CLOSED: "Closed",
};

function SupportMetricIcon({ kind }: { kind: "inbox" | "attention" | "priority" | "closed" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths = {
    inbox: <><path d="M4 5h16v14H4z"/><path d="M4 13h4l2 3h4l2-3h4"/></>,
    attention: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5m0 4h.01"/></>,
    priority: <><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/></>,
    closed: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" {...common}>{paths[kind]}</svg>;
}

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const [tickets, lodges] = await Promise.all([listTickets(actor, params), listLodges(actor)]);
  const openCount = tickets.filter((t) => !["RESOLVED", "CLOSED"].includes(t.status)).length;
  const escalatedCount = tickets.filter((t) => t.status === "ESCALATED").length;
  const closedCount = tickets.filter((t) => t.status === "CLOSED").length;

  return (
    <div className="stack">
      <div className="admin-page-heading"><div><span className="eyebrow">Guest care</span><h1>Support inbox</h1><p>Track requests, coordinate follow-up, and record resolutions.</p></div></div>
      <ErrorBanner error={params.error} />
      <section className="metric-grid support-metrics" aria-label="Support ticket metrics">
        <article className="metric-card"><span className="support-metric-icon"><SupportMetricIcon kind="inbox"/>Matching tickets</span><strong>{tickets.length}</strong></article>
        <article className="metric-card"><span className="support-metric-icon"><SupportMetricIcon kind="attention"/>Needs attention</span><strong>{openCount}</strong></article>
        <article className="metric-card"><span className="support-metric-icon"><SupportMetricIcon kind="priority"/>Escalated</span><strong>{escalatedCount}</strong></article>
        <article className="metric-card"><span className="support-metric-icon"><SupportMetricIcon kind="closed"/>Closed</span><strong>{closedCount}</strong></article>
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
      {tickets.length === 0 ? <div className="empty-state card"><h2>No matching support requests</h2><p>Adjust the filters or check back when guests submit a request.</p></div> : <SupportTicketInbox tickets={tickets.map((ticket) => ({ ...ticket, createdAt: ticket.createdAt.toISOString() }))} />}
    </div>
  );
}
