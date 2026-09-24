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
        <h1>Booking terms</h1>
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
            <span className="legal-number">01</span><div><h2>Accommodation reservations</h2>
            <p>When you make a reservation, provide accurate details for the booker and every occupant. Keep your booking reference and have it available when you check in. Room allocation depends on the accommodation option and availability shown during booking.</p></div>
          </section>
          <section id="guest-details" className="legal-section card">
            <span className="legal-number">02</span><div><h2>Guest details and conduct</h2>
            <p>The details submitted for a booking are used to coordinate the stay and check-in. Guests are expected to follow the conduct requirements communicated by the Young Ministers Retreat and the accommodation provider.</p></div>
          </section>
          <section id="retreat-registration" className="legal-section card">
            <span className="legal-number">03</span><div><h2>Retreat registration</h2>
            <p>An accommodation booking covers the stay only. It does not register a guest for, or guarantee entry to, the retreat. Retreat registration is handled separately by YMR Global.</p></div>
          </section>
          <section id="changes-support" className="legal-section card">
            <span className="legal-number">04</span><div><h2>Changes, cancellations, and support</h2>
            <p>For help with a reservation or a change, contact the accommodation team and include your booking reference. Cancellation and refund requests are reviewed by the accommodation team based on the details of the booking.</p>
            <Link className="legal-action" href="/support">Contact guest support <span aria-hidden="true">→</span></Link></div>
          </section>
        </div>
      </div>
      <aside className="legal-note"><strong>Need help with a booking?</strong><span>Our support team can route your request to the relevant lodge coordinator.</span><Link href="/support">Get in touch</Link></aside>
    </article>
  );
}
