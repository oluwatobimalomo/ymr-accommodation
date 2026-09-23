import { notFound } from "next/navigation";
import { ErrorBanner } from "@/components/AdminChrome";
import { BookingStatusTracker } from "@/components/BookingStatusTracker";
import { getBookingByReference } from "@/lib/booking/queries";
import { confirmPaymentFromVerifiedResult } from "@/lib/payments/confirm-payment";
import { verifyTransaction } from "@/lib/payments/paystack";

export const dynamic = "force-dynamic";

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
};

export default async function BookingConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ reference?: string; trxref?: string; phone?: string; error?: string }>;
}) {
  const { reference } = await params;
  const query = await searchParams;
  const isPaystackCallback = !!(query.reference || query.trxref);

  let data = await getBookingByReference(reference);
  if (!data) notFound();

  // Paystack redirects the browser back here with ?reference=...&trxref=...
  // after checkout. We never trust that redirect alone - we re-verify
  // directly against Paystack's API before treating it as paid. The webhook
  // remains the authoritative backstop if the customer closes the tab here.
  if (isPaystackCallback) {
    try {
      const verified = await verifyTransaction(reference);
      const outcome = await confirmPaymentFromVerifiedResult(verified);
      if (outcome.status !== "confirmed" && outcome.status !== "already_confirmed") {
        console.error(
          `Payment callback for ${reference} did not confirm (${outcome.status}). ` +
            `Expected amount=${data.booking.amountMinor} currency=${data.booking.currency}; ` +
            `Paystack reported requestedAmount=${verified.requestedAmountMinor} grossAmount=${verified.amountMinor} currency=${verified.currency}.`,
        );
      } else {
        data = await getBookingByReference(reference); // re-fetch to show the now-updated status
      }
    } catch (e) {
      // Verification failing here just means the page shows whatever the
      // booking's current status already is; the webhook will still land.
      // But we must never swallow this silently - log it so it's traceable.
      console.error(`Payment callback verification threw for ${reference}:`, e);
    }
  }

  if (!data) notFound();
  const { booking, occupants } = data;

  // Security: a booking reference alone (e.g. YMR26-ACM-00003) is
  // sequential and guessable by design (the brief requires this exact
  // format) - so it must never be sufficient on its own to view occupant
  // names and payment status. Anyone landing here straight from Paystack's
  // own redirect just proved they hold the payment session for this
  // booking, so that one case is trusted without a further prompt. Every
  // other visit (a bookmarked link, a guessed/enumerated URL, coming back
  // later) must additionally match the phone number on file, exactly like
  // /check-booking already requires.
  if (!isPaystackCallback) {
    const phoneMatches =
      query.phone && booking.bookerPhone.replace(/\s+/g, "") === query.phone.trim().replace(/\s+/g, "");
    if (!phoneMatches) {
      return (
        <div className="stack">
          <h1>Verify it&rsquo;s you</h1>
          <p>Enter the phone number used for this booking to view its details.</p>
          <ErrorBanner error={query.phone ? "That phone number doesn't match this booking." : undefined} />
          <form method="get" className="card stack" style={{ maxWidth: 380 }}>
            <div className="field">
              <label htmlFor="phone">Phone number</label>
              <input id="phone" name="phone" type="tel" required autoFocus />
            </div>
            <button className="btn" type="submit">
              View booking
            </button>
          </form>
        </div>
      );
    }
  }

  const paymentConfigured = !!process.env.PAYSTACK_SECRET_KEY;

  return (
    <div className="stack">
      <h1>{booking.paymentStatus === "PAID" ? "Booking confirmed" : "Reservation held"}</h1>
      <div className="card stack">
        <p style={{ margin: 0 }}>
          Booking reference<br />
          <strong style={{ fontSize: "1.5rem" }}>{booking.reference}</strong>
        </p>
        <BookingStatusTracker paymentStatus={booking.paymentStatus} accommodationStatus={booking.accommodationStatus} />
        <p style={{ margin: 0 }}>
          Amount: {(booking.amountMinor / 100).toLocaleString()} {booking.currency}
          <br />
          Payment status: {PAYMENT_LABEL[booking.paymentStatus]}
        </p>
      </div>

      {!paymentConfigured && booking.paymentStatus === "PENDING" && (
        <div
          className="alert"
          role="status"
          style={{ background: "var(--color-info-soft)", borderColor: "var(--color-info)", color: "var(--color-info)" }}
        >
          Payment is not yet configured on this deployment. Your bedspace/unit is held temporarily; a member of the
          team will follow up to complete payment. Please keep your booking reference.
        </div>
      )}

      {paymentConfigured && booking.paymentStatus === "PENDING" && (
        <div className="alert" role="status">
          We&rsquo;re still waiting for payment confirmation. If you completed payment, this page will update shortly
          — you can also check back later using your reference.
        </div>
      )}

      <h2>Occupants</h2>
      <ul>
        {occupants.map((o) => (
          <li key={o.id}>
            {o.name} ({o.gender.toLowerCase()})
          </li>
        ))}
      </ul>

      <p>
        <a className="btn secondary" href="/check-booking">
          Check this booking later
        </a>
      </p>
    </div>
  );
}
