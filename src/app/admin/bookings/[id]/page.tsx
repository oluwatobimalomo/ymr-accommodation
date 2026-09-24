import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorBanner } from "@/components/AdminChrome";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { getBookingDetail } from "@/lib/booking/admin-queries";
import { formatNaira } from "@/lib/format-currency";
import { getDb } from "@/db/client";
import { paymentTransactions } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function AdminBookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;
  const { error } = await searchParams;
  const data = await getBookingDetail(actor, id);
  if (!data) notFound();
  const { booking, occupants, category } = data;
  const transactions = await getDb().select().from(paymentTransactions).where(eq(paymentTransactions.bookingId, id));
  const canCancel = can(actor, "booking.cancel") && booking.paymentStatus !== "CANCELLED";

  return (
    <div className="stack">
      <p>
        <Link href="/admin/bookings">&larr; All bookings</Link>
      </p>
      <h1>{booking.reference}</h1>
      <ErrorBanner error={error} />

      <div className="card stack">
        <p style={{ margin: 0 }}>
          {booking.bookerName} · {booking.bookerPhone} · {booking.bookerEmail}
        </p>
        <p style={{ margin: 0 }}>{category?.name}</p>
        <p style={{ margin: 0 }}>
          {formatNaira(booking.amountMinor)} · Payment: {booking.paymentStatus} ·
          Accommodation: {booking.accommodationStatus.replace(/_/g, " ")}
        </p>
      </div>

      <h2>Occupants</h2>
      <div className="stack">
        {occupants.map((o) => (
          <div key={o.id} className="card">
            <p style={{ margin: 0, fontWeight: 600 }}>
              {o.name} ({o.gender.toLowerCase()})
            </p>
            <p className="listing-meta" style={{ margin: "4px 0 0" }}>
              {o.phone} {o.email && `· ${o.email}`}
              {!o.bedspaceId && !o.roomId && !o.unitId && " · Not currently assigned"}
            </p>
          </div>
        ))}
      </div>

      {transactions.length > 0 && (
        <>
          <h2>Payment transactions</h2>
          <div className="stack">
            {transactions.map((t) => (
              <div key={t.id} className="card">
                <p style={{ margin: 0 }}>
                  {t.status} · {formatNaira(t.amountMinor)} · {t.gatewayResponse}
                </p>
                <p className="listing-meta" style={{ margin: "4px 0 0" }}>
                  Ref {t.reference} {t.paidAt && `· Paid ${new Date(t.paidAt).toLocaleString()}`}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {canCancel && (
        <div className="card stack">
          <h2>Cancel this booking</h2>
          <p>This releases any inventory held for it and cannot be undone from here.</p>
          <form method="post" action={`/api/admin/bookings/${booking.id}`} className="stack">
            <input type="hidden" name="intent" value="cancel" />
            <button className="btn secondary" type="submit">
              Cancel booking
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
