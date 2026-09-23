import Link from "next/link";
import { AdminNav, ErrorBanner } from "@/components/AdminChrome";
import { requireActor } from "@/lib/auth/require";
import { listTickets } from "@/lib/support/tickets";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support tickets" };

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  WAITING_FOR_CUSTOMER: "Waiting for customer",
  ESCALATED: "Escalated",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor();
  const { error } = await searchParams;
  const tickets = await listTickets(actor);

  return (
    <div className="stack">
      <AdminNav />
      <h1>Support tickets</h1>
      <ErrorBanner error={error} />

      {tickets.length === 0 ? (
        <p>No tickets yet.</p>
      ) : (
        <div className="stack">
          {tickets.map((t) => (
            <Link key={t.id} href={`/admin/support/${t.id}`} className="card" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <strong>{t.subject}</strong>
                <span className="badge">{STATUS_LABEL[t.status]}</span>
              </div>
              <p className="listing-meta" style={{ margin: "4px 0 0" }}>
                {t.reference} · {t.customerName} · {t.category}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
