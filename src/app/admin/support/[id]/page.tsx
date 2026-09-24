import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorBanner } from "@/components/AdminChrome";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { getTicket } from "@/lib/support/tickets";

export const dynamic = "force-dynamic";

const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "ESCALATED", "RESOLVED", "CLOSED"] as const;

export default async function AdminTicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;
  const { error } = await searchParams;
  const data = await getTicket(actor, id);
  if (!data) notFound();
  const { ticket, messages } = data;
  const phoneDigits = ticket.customerPhone.replace(/\D/g, "");
  const customerWhatsAppNumber = phoneDigits.startsWith("0") && phoneDigits.length === 11 ? `234${phoneDigits.slice(1)}` : phoneDigits;
  const canManage = can(actor, "support.manage");

  return (
    <div className="stack">
      <p>
        <Link href="/admin/support">&larr; All tickets</Link>
      </p>
      <h1>{ticket.subject}</h1>
      <ErrorBanner error={error} />
      <p className="listing-meta">
        {ticket.reference} · {ticket.category.replace(/_/g, " ")} · {ticket.createdAt.toLocaleString()}
      </p>

      <section className="card support-contact-card">
        <div><span className="eyebrow">Customer contact</span><h2>{ticket.customerName}</h2><p>{ticket.customerEmail}</p></div>
        <div className="support-contact-grid">
          <span><strong>Phone</strong><a href={`tel:${ticket.customerPhone}`}>{ticket.customerPhone || "Not provided"}</a></span>
          <span><strong>Preferred contact</strong>{ticket.contactPreference === "CALL" ? "Phone call" : "WhatsApp"}</span>
          {customerWhatsAppNumber && <a className="whatsapp-contact-button" href={`https://wa.me/${customerWhatsAppNumber}`} target="_blank" rel="noreferrer" aria-label={`Open WhatsApp chat with ${ticket.customerName}`}>
            <svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16.04 3C8.86 3 3.02 8.82 3.02 15.98c0 2.28.6 4.5 1.75 6.45L3 29l6.75-1.76a13.1 13.1 0 0 0 6.28 1.6h.01c7.17 0 13.01-5.82 13.01-12.98 0-3.47-1.36-6.73-3.82-9.18A12.93 12.93 0 0 0 16.04 3Zm0 23.63h-.01c-1.93 0-3.82-.52-5.47-1.5l-.39-.23-4 .1 1.07-3.87-.25-.4a10.7 10.7 0 0 1-1.65-5.75c0-5.91 4.8-10.72 10.71-10.72 2.87 0 5.56 1.12 7.59 3.15a10.65 10.65 0 0 1 3.14 7.59c0 5.91-4.8 10.72-10.7 10.72Zm5.88-8.03c-.32-.16-1.88-.93-2.17-1.04-.29-.1-.5-.16-.72.16-.21.32-.82 1.04-1 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.58-.95-.84-1.59-1.88-1.78-2.2-.18-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.1-.21.05-.4-.03-.56-.08-.16-.72-1.72-.98-2.35-.26-.62-.52-.53-.72-.54h-.61c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.65 0 1.57 1.14 3.08 1.3 3.29.16.21 2.25 3.44 5.45 4.82.76.33 1.35.52 1.81.67.76.24 1.45.21 2 .13.61-.09 1.88-.77 2.15-1.51.27-.75.27-1.39.19-1.52-.08-.13-.29-.21-.61-.37Z"/></svg>
            <span>Message guest on WhatsApp</span><span aria-hidden="true">↗</span>
          </a>}
          {data.lodge && <span><strong>Lodge coordinator</strong>{data.lodge.contactName || "Not listed"} · <a href={`tel:${data.lodge.contactPhone}`}>{data.lodge.contactPhone || "No phone"}</a></span>}
        </div>
      </section>

      <div className="stack">
        {messages.map((m) => (
          <div key={m.id} className="card" style={{ background: m.isStaff ? "#FDF0E4" : undefined }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{m.authorLabel}</p>
            <p style={{ margin: "4px 0 0" }}>{m.body}</p>
          </div>
        ))}
      </div>

      {canManage && (
        <>
          <div className="card stack">
            <h2>Contact log</h2>
            <p className="listing-meta">Record the outcome of your call or WhatsApp conversation. The guest is contacted directly by the coordinator.</p>
            <form method="post" action={`/api/admin/support/${ticket.id}`} className="stack">
              <input type="hidden" name="intent" value="reply" />
              <div className="field">
                <label htmlFor="body">Call or WhatsApp summary</label>
                <textarea id="body" name="body" required rows={4} />
              </div>
              <button className="btn" type="submit">
                Save contact note
              </button>
            </form>
          </div>

          <div className="card stack">
            <h2>Status</h2>
            <form method="post" action={`/api/admin/support/${ticket.id}`} className="stack">
              <input type="hidden" name="intent" value="status" />
              <div className="field">
                <label htmlFor="status">Set status to</label>
                <select id="status" name="status" defaultValue={ticket.status}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <button className="btn secondary" type="submit">Update status</button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
