import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorBanner } from "@/components/AdminChrome";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { getTicket } from "@/lib/support/tickets";

export const dynamic = "force-dynamic";
const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "ESCALATED", "RESOLVED", "CLOSED"] as const;

export default async function AdminTicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor();
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const data = await getTicket(actor, id);
  if (!data) notFound();
  const { ticket, messages, lodge } = data;
  const phoneDigits = ticket.customerPhone.replace(/\D/g, "");
  const whatsappNumber = phoneDigits.startsWith("0") && phoneDigits.length === 11 ? `234${phoneDigits.slice(1)}` : phoneDigits;
  const canManage = can(actor, "support.manage", { lodgeId: lodge?.id });

  return <div className="stack support-ticket-page">
    <div className="support-ticket-page-heading">
      <div><Link className="support-ticket-detail-back" href="/admin/support">&larr; All tickets</Link><span className="eyebrow">{ticket.reference} · {ticket.category.replace(/_/g, " ")}</span><h1>{ticket.subject}</h1></div>
      <span className={`status-pill status-${ticket.status.toLowerCase().replace(/_/g, "-")}`}>{ticket.status.replace(/_/g, " ")}</span>
    </div>
    <ErrorBanner error={error} />
    <section className="card support-detail-contact">
      <div><span className="eyebrow">Guest</span><h2>{ticket.customerName}</h2><a href={`mailto:${ticket.customerEmail}`}>{ticket.customerEmail}</a></div>
      <div><span>Phone</span><a href={`tel:${ticket.customerPhone}`}>{ticket.customerPhone || "Not provided"}</a></div>
      <div><span>Preferred contact</span>{ticket.contactPreference === "CALL" ? "Phone call" : <>{whatsappNumber && <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer">WhatsApp</a>}</>}</div>
      {lodge && <div><span>Lodge</span><strong>{lodge.name}</strong></div>}
    </section>
    <div className="support-detail-columns">
      <section className="card support-detail-conversation"><header><h2>Conversation</h2><span>{messages.length} {messages.length === 1 ? "message" : "messages"}</span></header>
        <div className="support-detail-messages">{messages.map((message) => <article key={message.id} className={`support-detail-message${message.isStaff ? " is-staff" : ""}`}><div><strong>{message.authorLabel}</strong><time>{message.createdAt.toLocaleString()}</time></div><p>{message.body}</p></article>)}</div>
      </section>
      {canManage && <aside className="support-detail-tools">
        <form method="post" action={`/api/admin/support/${ticket.id}`} className="card support-detail-note">
          <h2>Contact note</h2><label htmlFor="body">Call or WhatsApp summary</label><textarea id="body" name="body" required rows={4} />
          <button className="btn" type="submit" name="intent" value="reply">Save contact note</button>
        </form>
        <form method="post" action={`/api/admin/support/${ticket.id}`} className="card support-detail-status">
          <h2>Update status</h2><label htmlFor="status">Status</label><select id="status" name="status" defaultValue={ticket.status}>{STATUSES.map((value) => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}</select>
          <button className="btn secondary" type="submit" name="intent" value="status">Update status</button>
        </form>
      </aside>}
    </div>
  </div>;
}
