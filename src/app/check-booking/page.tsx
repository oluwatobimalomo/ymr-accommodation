import { ErrorBanner } from "@/components/AdminChrome";
import { BookingStatusTracker } from "@/components/BookingStatusTracker";
import { getBookingByReference } from "@/lib/booking/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check my booking" };

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
};
const ACCOM_LABEL: Record<string, string> = {
  UNALLOCATED: "Not yet allocated",
  ALLOCATED: "Allocated",
  CHECKED_IN: "Checked in",
  CHECKED_OUT: "Checked out",
  CANCELLED: "Cancelled",
};

export default async function CheckBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; phone?: string; error?: string }>;
}) {
  const { reference, phone } = await searchParams;
  let result: Awaited<ReturnType<typeof getBookingByReference>> = null;
  let notFoundMessage: string | null = null;

  if (reference && phone) {
    const found = await getBookingByReference(reference.trim());
    if (found && found.booking.bookerPhone.replace(/\s+/g, "") === phone.trim().replace(/\s+/g, "")) {
      result = found;
    } else {
      notFoundMessage = "We couldn't find a booking matching that reference and phone number.";
    }
  }

  return (
    <div className="stack">
      <h1>Check my booking</h1>
      <ErrorBanner error={notFoundMessage ?? undefined} />

      <form method="get" className="card stack" style={{ maxWidth: 420 }}>
        <div className="field">
          <label htmlFor="reference">Booking reference</label>
          <input id="reference" name="reference" required defaultValue={reference} placeholder="YMR26-ACM-00001" />
        </div>
        <div className="field">
          <label htmlFor="phone">Phone number used at booking</label>
          <input id="phone" name="phone" required defaultValue={phone} type="tel" />
        </div>
        <button className="btn" type="submit">
          Look up booking
        </button>
      </form>

      {result && (
        <div className="card stack">
          <h2>{result.booking.reference}</h2>
          <BookingStatusTracker
            paymentStatus={result.booking.paymentStatus}
            accommodationStatus={result.booking.accommodationStatus}
          />
          <p style={{ margin: 0 }}>
            Payment: {PAYMENT_LABEL[result.booking.paymentStatus]}
            <br />
            Accommodation: {ACCOM_LABEL[result.booking.accommodationStatus]}
          </p>
          <h3>Occupants</h3>
          <ul>
            {result.occupants.map((o) => (
              <li key={o.id}>{o.name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
