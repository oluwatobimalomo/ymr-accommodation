import { ErrorBanner } from "@/components/AdminChrome";
import { listActiveLodges } from "@/lib/booking/queries";

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
      <div className="support-page stack">
        <div className="page-intro"><span className="eyebrow">We’re here to help</span><h1>Request received</h1></div>
        <div className="card stack support-success">
          <p style={{ margin: 0 }}>
            Your reference<br />
            <strong style={{ fontSize: "1.4rem" }}>{reference}</strong>
          </p>
          <p style={{ margin: 0 }}>Your request has been sent to the accommodation team. A coordinator will contact you using your selected phone or WhatsApp preference. Keep this reference for your records.</p>
        </div>
      </div>
    );
  }
  const lodges = await listActiveLodges();

  return (
    <div className="support-page stack">
      <div className="page-intro support-intro">
        <span className="eyebrow">Guest care</span>
        <h1>How can we help?</h1>
        <p>Send a note to our accommodation team. We’ll route it to the right lodge coordinator and contact you using your preferred method.</p>
      </div>
      <ErrorBanner error={error} />

      <div className="support-content">
      <form method="post" action="/api/support/create" className="card stack support-form">
        <div className="support-fields">
        <div className="field">
          <label htmlFor="customerName">Your name</label>
          <input id="customerName" name="customerName" required autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="customerEmail">Email</label>
          <input id="customerEmail" name="customerEmail" type="email" required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="customerPhone">Phone number for follow-up</label>
          <input id="customerPhone" name="customerPhone" type="tel" required autoComplete="tel" placeholder="+234…" />
        </div>
        <div className="field">
          <label htmlFor="contactPreference">How should the lodge coordinator contact you?</label>
          <select id="contactPreference" name="contactPreference" required defaultValue="WHATSAPP">
            <option value="CALL">Phone call</option>
            <option value="WHATSAPP">WhatsApp</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="bookingReference">Booking reference (if applicable)</label>
          <input id="bookingReference" name="bookingReference" placeholder="YMR26-WH-569402CF" />
        </div>
        <div className="field">
          <label htmlFor="lodgeId">Lodge</label>
          <select id="lodgeId" name="lodgeId" defaultValue="">
            <option value="">General accommodation support</option>
            {lodges.map((lodge) => <option key={lodge.id} value={lodge.id}>{lodge.name}</option>)}
          </select>
          <p className="listing-meta">If you provide a booking reference, we&rsquo;ll route this to the lodge on that booking.</p>
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
        <div className="field support-message-field">
          <label htmlFor="description">Message</label>
          <textarea id="description" name="description" required rows={5} />
        </div>
        </div>
        <button className="btn" type="submit">
          Send message
        </button>
      </form>
      <aside className="support-aside card stack">
        <span className="support-aside-icon" aria-hidden="true">✦</span>
        <h2>Personal help, from people who know your stay.</h2>
        <p>For booking questions, include your booking reference so we can connect you with the right lodge.</p>
        <div className="support-assurance"><strong>What happens next?</strong><span>A coordinator reviews your request and follows up by call or WhatsApp.</span></div>
        <a className="support-aside-link" href="/faq">Browse frequently asked questions <span aria-hidden="true">→</span></a>
      </aside>
      </div>
    </div>
  );
}
