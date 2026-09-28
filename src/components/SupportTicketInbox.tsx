"use client";

import { useEffect, useRef, useState } from "react";

type TicketSummary = {
  id: string; reference: string; category: string; subject: string; customerName: string;
  customerPhone: string; customerEmail: string; contactPreference: string; lodgeName: string | null;
  createdAt: string; status: string; latestMessage: string | null;
};
type TicketDetail = {
  ticket: TicketSummary & { lodgeId?: string | null };
  messages: { id: string; authorLabel: string; isStaff: boolean; body: string; createdAt: string }[];
  lodge: { name: string; contactName: string | null; contactPhone: string | null } | null;
  canManage: boolean;
};

const statuses = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "ESCALATED", "RESOLVED", "CLOSED"];
const labels: Record<string, string> = { OPEN: "Open", IN_PROGRESS: "In progress", WAITING_FOR_CUSTOMER: "Waiting for customer", ESCALATED: "Escalated", RESOLVED: "Resolved", CLOSED: "Closed" };

export function SupportTicketInbox({ tickets }: { tickets: TicketSummary[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const [updates, setUpdates] = useState<Record<string, Partial<TicketSummary>>>({});

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (activeId && !node.open) node.showModal();
    if (!activeId && node.open) node.close();
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    setLoading(true); setError(""); setDetail(null); setNote("");
    fetch(`/api/admin/support/${activeId}`, { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load this ticket.");
        return result as TicketDetail;
      })
      .then((result) => { if (!cancelled) { setDetail(result); setStatus(result.ticket.status); } })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load this ticket."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeId]);

  async function submit(intent: "reply" | "status") {
    if (!activeId) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/admin/support/${activeId}`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ intent, status, body: note }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update this ticket.");
      const refreshed = await fetch(`/api/admin/support/${activeId}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      const fresh = await refreshed.json() as TicketDetail;
      if (!refreshed.ok) throw new Error(fresh as unknown as string);
      setDetail(fresh); setStatus(fresh.ticket.status);
      if (intent === "reply") setNote("");
      const last = fresh.messages.at(-1)?.body ?? null;
      setUpdates((current) => ({ ...current, [activeId]: { status: fresh.ticket.status, latestMessage: last } }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update this ticket.");
    } finally { setSaving(false); }
  }

  return <>
    <div className="support-ticket-list">
      {tickets.map((ticket) => {
        const current = { ...ticket, ...updates[ticket.id] };
        return <a key={ticket.id} href={`/admin/support/${ticket.id}`} className="support-ticket-card support-ticket-card-link" aria-haspopup="dialog" onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); setActiveId(ticket.id);
        }}>
          <div className="support-ticket-main">
            <span className="eyebrow">{ticket.reference} · {ticket.category.replace(/_/g, " ")}</span>
            <h2 className="support-ticket-card-title">{ticket.subject}</h2>
            <p className="support-ticket-card-meta">{ticket.customerName} · {ticket.customerPhone} · prefers {ticket.contactPreference === "CALL" ? "a call" : "WhatsApp"}</p>
            {current.latestMessage && <span className="support-ticket-preview">{current.latestMessage}</span>}
            <small className="support-ticket-card-date">{ticket.lodgeName ? `${ticket.lodgeName} · ` : "General support · "}{new Date(ticket.createdAt).toLocaleString()}</small>
          </div>
          <span className={`status-pill status-${current.status.toLowerCase().replace(/_/g, "-")}`}>{labels[current.status]}</span>
        </a>;
      })}
    </div>

    <dialog ref={dialog} className="support-ticket-dialog" aria-labelledby="support-dialog-title" onCancel={(event) => { event.preventDefault(); setActiveId(null); }} onClick={(event) => { if (event.target === dialog.current) setActiveId(null); }}>
      <div className="support-dialog-shell">
        <header className="support-dialog-header">
          <div className="min-w-0">
            {detail && <span className="eyebrow">{detail.ticket.reference} · {detail.ticket.category.replace(/_/g, " ")}</span>}
            <h2 id="support-dialog-title">{detail?.ticket.subject ?? "Support ticket"}</h2>
          </div>
          <button className="dialog-close" type="button" aria-label="Close ticket" onClick={() => setActiveId(null)}>×</button>
        </header>
        {error && <p className="support-dialog-error" role="alert">{error}</p>}
        {loading && <p className="support-dialog-loading">Loading ticket…</p>}
        {detail && <>
          <section className="support-dialog-contact">
            <div><strong>{detail.ticket.customerName}</strong><a href={`mailto:${detail.ticket.customerEmail}`}>{detail.ticket.customerEmail}</a></div>
            <div><span>Phone</span><a href={`tel:${detail.ticket.customerPhone}`}>{detail.ticket.customerPhone || "Not provided"}</a></div>
            <div><span>Preferred contact</span><strong>{detail.ticket.contactPreference === "CALL" ? "Phone call" : "WhatsApp"}</strong></div>
            <div><span>Status</span><span className={`status-pill status-${detail.ticket.status.toLowerCase().replace(/_/g, "-")}`}>{labels[detail.ticket.status]}</span></div>
          </section>
          <section className="support-dialog-messages" aria-label="Ticket conversation">
            {detail.messages.map((message) => <article className={`support-dialog-message${message.isStaff ? " is-staff" : ""}`} key={message.id}>
              <div><strong>{message.authorLabel}</strong><time>{new Date(message.createdAt).toLocaleString()}</time></div><p>{message.body}</p>
            </article>)}
          </section>
          {detail.canManage && <footer className="support-dialog-actions">
            <form onSubmit={(event) => { event.preventDefault(); void submit("reply"); }} className="support-dialog-note">
              <label htmlFor="support-note">Contact note</label>
              <textarea id="support-note" value={note} onChange={(event) => setNote(event.target.value)} required rows={3} />
              <button className="btn" disabled={saving || !note.trim()} type="submit">Save contact note</button>
            </form>
            <form onSubmit={(event) => { event.preventDefault(); void submit("status"); }} className="support-dialog-status">
              <label htmlFor="support-status">Status</label>
              <select id="support-status" value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</select>
              <button className="btn secondary" disabled={saving} type="submit">Update status</button>
            </form>
          </footer>}
        </>}
      </div>
    </dialog>
  </>;
}
