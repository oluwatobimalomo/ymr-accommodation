import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminNav, ErrorBanner } from "@/components/AdminChrome";
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
  const canManage = can(actor, "support.manage");

  return (
    <div className="stack">
      <AdminNav />
      <p>
        <Link href="/admin/support">&larr; All tickets</Link>
      </p>
      <h1>{ticket.subject}</h1>
      <ErrorBanner error={error} />
      <p className="listing-meta">
        {ticket.reference} · {ticket.customerName} ({ticket.customerEmail}) · {ticket.category}
      </p>

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
            <h2>Reply</h2>
            <form method="post" action={`/api/admin/support/${ticket.id}`} className="stack">
              <input type="hidden" name="intent" value="reply" />
              <div className="field">
                <label htmlFor="body">Message</label>
                <textarea id="body" name="body" required rows={4} />
              </div>
              <button className="btn" type="submit">
                Send reply
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
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn secondary" type="submit">
                Update status
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
