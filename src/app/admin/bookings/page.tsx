import Link from "next/link";
import { AdminNav, ErrorBanner } from "@/components/AdminChrome";
import { requireActor } from "@/lib/auth/require";
import { listBookings } from "@/lib/booking/admin-queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bookings" };

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
};

export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor();
  const { error } = await searchParams;
  const bookings = await listBookings(actor);

  return (
    <div className="stack">
      <AdminNav />
      <h1>Bookings</h1>
      <ErrorBanner error={error} />

      {bookings.length === 0 ? (
        <p>No bookings yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-line)" }}>
                <th style={{ padding: "8px" }}>Reference</th>
                <th style={{ padding: "8px" }}>Booker</th>
                <th style={{ padding: "8px" }}>Lodge / Category</th>
                <th style={{ padding: "8px" }}>Amount</th>
                <th style={{ padding: "8px" }}>Payment</th>
                <th style={{ padding: "8px" }}>Accommodation</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} style={{ borderBottom: "1px solid var(--color-line)" }}>
                  <td style={{ padding: "8px" }}>
                    <Link href={`/admin/bookings/${b.id}`}>{b.reference}</Link>
                  </td>
                  <td style={{ padding: "8px" }}>{b.bookerName}</td>
                  <td style={{ padding: "8px" }}>
                    {b.lodgeName} / {b.categoryName}
                  </td>
                  <td style={{ padding: "8px" }}>
                    {(b.amountMinor / 100).toLocaleString()} {b.currency}
                  </td>
                  <td style={{ padding: "8px" }}>
                    <span className="badge">{PAYMENT_LABEL[b.paymentStatus]}</span>
                  </td>
                  <td style={{ padding: "8px" }}>{b.accommodationStatus.replace(/_/g, " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
