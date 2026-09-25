import { notFound } from "next/navigation";
import { ErrorBanner } from "@/components/AdminChrome";
import { Badge } from "@/components/Badge";
import { BookingStatusTracker } from "@/components/BookingStatusTracker";
import { TicketDownloadActions } from "@/components/TicketDownloadActions";
import { ClearBagOnSuccess } from "@/components/ClearBagOnSuccess";
import { getBookingByReference } from "@/lib/booking/queries";
import { confirmPaymentFromVerifiedResult } from "@/lib/payments/confirm-payment";
import { verifyTransaction } from "@/lib/payments/paystack";
import { formatNaira } from "@/lib/format-currency";
import { formatDateOnly } from "@/lib/format-date";

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
  const hasPaystackCallback = !!(query.reference || query.trxref);
  let verifiedPaystackReturn = false;

  let data = await getBookingByReference(reference);
  if (!data) notFound();

  // Paystack redirects the browser back here with ?reference=...&trxref=...
  // after checkout. We never trust that redirect alone - we re-verify
  // directly against Paystack's API before treating it as paid. The webhook
  // remains the authoritative backstop if the customer closes the tab here.
  if (hasPaystackCallback) {
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
        verifiedPaystackReturn = true;
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
  const { booking, occupants, lodgeName, categoryName, checkInDate, checkOutDate, coordinatorName, coordinatorPhone, items, bookerEmail, isGift } = data;

  // Only a successfully verified Paystack transaction may skip the phone
  // check. Merely adding callback-looking query parameters to a booking URL
  // must never expose occupant and coordinator details.
  if (!verifiedPaystackReturn) {
    const normalizedPhone = query.phone?.trim().replace(/\s+/g, "");
    const phoneMatches = normalizedPhone && [booking.bookerPhone, data.giftRecipient?.phone].filter(Boolean).some((phone) => phone!.replace(/\s+/g, "") === normalizedPhone);
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
    <div className="booking-ticket-page stack">
      {verifiedPaystackReturn && booking.paymentStatus === "PAID" && <ClearBagOnSuccess />}
      <div className="booking-print-area">
      <div className="ticket-print-brand"><img src="/ymr-mark.png" alt="" /><span><strong>YMR Accommodation</strong><small>YMR 2026 · CITY TAKERS · 10TH ANNIVERSARY</small></span></div>
      <header className={`booking-ticket-hero${booking.paymentStatus === "PAID" ? " is-paid" : ""}`}>
        <div className="ticket-confirmation-mark" aria-hidden="true">{booking.paymentStatus === "PAID" ? "✓" : "•"}</div>
        <div><span className="eyebrow">YMR Accommodation · Booking update</span><h1>{booking.paymentStatus === "PAID" ? "Your stay is confirmed" : "Your reservation is held"}</h1>
          <p>{booking.paymentStatus === "PAID" ? "Your accommodation details are ready. Keep this ticket for check-in." : "We’re waiting for payment confirmation. Your reservation details are below."}</p></div>
      </header>

      {!paymentConfigured && booking.paymentStatus === "PENDING" && <div className="alert" role="status">Payment is not configured on this deployment. Your accommodation is held temporarily; a member of the team will follow up. Keep your booking reference.</div>}
      {paymentConfigured && booking.paymentStatus === "PENDING" && <div className="alert" role="status">We&rsquo;re waiting for payment confirmation. If you completed payment, the status will update once confirmed.</div>}

      <section className={`booking-ticket-card${booking.paymentStatus === "PAID" ? " is-paid" : ""}`} aria-label="Booking ticket">
        <div className="ticket-card-topline"><span>BOOKING TICKET</span><Badge tone={booking.paymentStatus === "PAID" ? "brand" : "default"}>{PAYMENT_LABEL[booking.paymentStatus]}</Badge></div>
        <div className="ticket-reference-row"><div><span className="ticket-label">Ticket ID</span><strong className="ticket-reference">{booking.reference}</strong></div><div className="ticket-total"><span className="ticket-label">Total amount</span><strong>{formatNaira(booking.amountMinor)}</strong></div></div>
        <BookingStatusTracker paymentStatus={booking.paymentStatus} accommodationStatus={booking.accommodationStatus} />
        {items.length <= 1 && <div className="ticket-stay-grid">
          <div><span className="ticket-label">Lodge</span><strong>{lodgeName || "Accommodation"}</strong></div>
          <div><span className="ticket-label">Apartment</span><strong>{categoryName || "Assigned accommodation"}</strong></div>
          {(items[0]?.actualCheckInAt || checkInDate) && <div><span className="ticket-label">{items[0]?.actualCheckInAt ? "Checked in" : "Expected Check-in"}</span><strong>{items[0]?.actualCheckInAt ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(items[0].actualCheckInAt)) : formatDateOnly(checkInDate) || "Date to be advised"}</strong></div>}
          {items[0]?.actualCheckOutAt && <div><span className="ticket-label">Checked out</span><strong>{new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(items[0].actualCheckOutAt))}</strong></div>}
        </div>}
      </section>

      <section className="card ticket-booker-details"><span className="eyebrow">Booked by</span><strong>{booking.bookerName}</strong><span>{bookerEmail || booking.bookerEmail}</span><span>{booking.bookerPhone}</span></section>

      {items.length > 1 && <section className="card ticket-order-items"><div className="ticket-section-heading"><div><span className="eyebrow">Your accommodation</span><h2>Booking details by lodge</h2></div><span>{items.length} items</span></div>{items.map((item) => <article className="ticket-order-item" key={item.reference}><span className="ticket-label">Item {item.sequence}</span><h3>{item.apartmentName}</h3><p><strong>{item.lodgeName}</strong>{item.actualCheckInAt ? ` · Checked in ${new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.actualCheckInAt))}` : item.checkInDate ? ` · Expected Check-in: ${formatDateOnly(item.checkInDate)}` : ""}{item.actualCheckOutAt ? ` · Checked out ${new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.actualCheckOutAt))}` : ""}</p><ul>{item.occupants.map((guest, index) => <li key={`${guest.name}-${index}`}>{guest.name}{guest.allocation ? ` · ${guest.allocation}` : ""}</li>)}</ul><strong>{formatNaira(item.amountMinor)}</strong><div className="ticket-coordinator"><span className="ticket-label">Lodge Coordinator:</span><strong>{item.coordinatorName || "Contact support"}</strong><span>|</span>{item.coordinatorPhone ? <a href={`tel:${item.coordinatorPhone}`}>{item.coordinatorPhone}</a> : <a href="/support">Support</a>}</div></article>)}</section>}

        {items.length <= 1 && isGift && <section className="card ticket-occupants">
          <div className="ticket-section-heading"><div><span className="eyebrow">Guest details</span><h2>Occupants</h2></div><span>{occupants.length} guest{occupants.length === 1 ? "" : "s"}</span></div>
          <div className="ticket-guest-list">{occupants.map((occupant, index) => <div className="ticket-guest" key={occupant.id}><span className="ticket-guest-number">{String(index + 1).padStart(2, "0")}</span><strong>{occupant.name}</strong><span>{occupant.gender === "UNSPECIFIED" ? "—" : occupant.gender.toLowerCase()}</span></div>)}</div>
        </section>}
        {items.length <= 1 && <div className="card ticket-coordinator-card"><div className="ticket-coordinator"><span className="ticket-label">Lodge Coordinator:</span><strong>{coordinatorName || "Contact support"}</strong><span>|</span>{coordinatorPhone ? <a href={`tel:${coordinatorPhone}`}>{coordinatorPhone}</a> : <a href="/support">Support</a>}</div></div>}
      </div>
      <TicketDownloadActions ticket={{ ticketId: booking.reference, guestName: booking.bookerName, bookerEmail: bookerEmail || booking.bookerEmail, bookerPhone: booking.bookerPhone, lodgeName: lodgeName || "Accommodation", apartmentName: categoryName || "Assigned accommodation", amountMinor: booking.amountMinor, paymentStatus: booking.paymentStatus, accommodationStatus: booking.accommodationStatus, occupants: occupants.map((occupant) => occupant.name), isGift, checkInDate: checkInDate ?? undefined, checkOutDate: checkOutDate ?? undefined, coordinatorName, coordinatorPhone, items }} />
      <aside className="ticket-next-step booking-screen-only"><span className="eyebrow">Before you arrive</span><h2>Keep your Ticket ID handy.</h2><p>Use the booking reference and the phone number on your reservation if you need to look up your booking or contact the accommodation team.</p><div className="ticket-actions"><a className="btn" href="/check-booking">Manage booking</a><a className="ticket-support-link" href="/support">Need help? Contact support</a></div></aside>
    </div>
  );
}
