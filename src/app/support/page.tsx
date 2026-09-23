import { ErrorBanner } from "@/components/AdminChrome";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support" };

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reference?: string }>;
}) {
  const { error, reference } = await searchParams;

  if (reference) {
    return (
      <div className="stack">
        <h1>Support request received</h1>
        <div className="card stack">
          <p style={{ margin: 0 }}>
            Your reference<br />
            <strong style={{ fontSize: "1.4rem" }}>{reference}</strong>
          </p>
          <p style={{ margin: 0 }}>We&rsquo;ll get back to you by email. Keep this reference for follow-up.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>Support</h1>
      <p>Have a question about your booking, payment, or accommodation? Send us a message.</p>
      <ErrorBanner error={error} />

      <form method="post" action="/api/support/create" className="card stack" style={{ maxWidth: 480 }}>
        <div className="field">
          <label htmlFor="customerName">Your name</label>
          <input id="customerName" name="customerName" required autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="customerEmail">Email</label>
          <input id="customerEmail" name="customerEmail" type="email" required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="customerPhone">Phone (optional)</label>
          <input id="customerPhone" name="customerPhone" type="tel" autoComplete="tel" />
        </div>
        <div className="field">
          <label htmlFor="bookingReference">Booking reference (if applicable)</label>
          <input id="bookingReference" name="bookingReference" placeholder="YMR26-ACM-00001" />
        </div>
        <div className="field">
          <label htmlFor="category">Category</label>
          <select id="category" name="category" required defaultValue="GENERAL">
            <option value="PAYMENT">Payment</option>
            <option value="BOOKING">Booking</option>
            <option value="ACCOMMODATION">Accommodation</option>
            <option value="ALLOCATION">Room allocation</option>
            <option value="CHECK_IN">Check-in</option>
            <option value="KEY">Room key</option>
            <option value="REFUND">Refund</option>
            <option value="GENERAL">General</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="subject">Subject</label>
          <input id="subject" name="subject" required />
        </div>
        <div className="field">
          <label htmlFor="description">Message</label>
          <textarea id="description" name="description" required rows={5} />
        </div>
        <button className="btn" type="submit">
          Send message
        </button>
      </form>
    </div>
  );
}
