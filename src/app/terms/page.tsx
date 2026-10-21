import Link from "next/link";

export const metadata = {
  title: "Booking terms",
  description: "Terms for accommodation bookings made through YMR Accommodation.",
};

export default function TermsPage() {
  return (
    <article className="legal-page stack">
      <header className="legal-hero">
        <span className="eyebrow">YMR Accommodation · Guest information</span>
        <h3>Booking Terms</h3>
        <p>Please review how accommodation reservations, guest details, and support requests are handled.</p>
      </header>
      <div className="legal-layout">
        <nav className="legal-contents card" aria-label="On this page">
          <strong>On this page</strong>
          <a href="#reservations">Reservations</a>
          <a href="#guest-details">Guest details</a>
          <a href="#retreat-registration">Retreat registration</a>
          <a href="#changes-support">Changes and support</a>
        </nav>
        <div className="legal-sections">
          <section id="reservations" className="legal-section card">
            <span className="legal-number">01</span><div><h2>Accommodation Reservations</h2>
            <p>When you make a reservation, ensure your details are accurate. Keep your booking reference and have it available for check in.</p></div>
          </section>
          <section id="guest-details" className="legal-section card">
            <span className="legal-number">02</span><div><h2>Guest details and conduct</h2>
            <p>The details submitted for a booking are used to coordinate your stay and check-in. Guests are expected to follow the conduct requirements communicated by YMR and the accommodation provider.</p></div>
          </section>
          <section id="retreat-registration" className="legal-section card">
            <span className="legal-number">03</span><div><h2>Retreat Registration</h2>
            <p>If you're yet to register as a participant/volunteer for YMR 2026, you can do so through the YMR Global website.</p>
            <Link className="legal-action" href="https://register.ymrglobal.org">Register for the retreat<span aria-hidden="true">→</span></Link></div>
          </section>
          <section id="changes-support" className="legal-section card">
            <span className="legal-number">04</span><div><h2>Changes, cancellations, and support</h2>
            <p>For help with a reservation or a change, contact the accommodation team and include your booking reference. Cancellation and refund requests are reviewed by the accommodation team based on the details of the booking.</p>
            <Link className="legal-action" href="/support">Contact Support <span aria-hidden="true">→</span></Link></div>
          </section>
        </div>
      </div>
      <aside className="legal-note"><strong>Need help with a booking?</strong><span>We have a dedicated 24/7 support team, ready to assist you.</span><Link href="/support">Contact Support</Link></aside>
    </article>
  );
}
