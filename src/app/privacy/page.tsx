import Link from "next/link";

export const metadata = {
  title: "Privacy notice",
  description: "How YMR Accommodation uses information shared during booking and support.",
};

export default function PrivacyPage() {
  return (
    <article className="legal-page stack">
      <header className="legal-hero">
        <span className="eyebrow">YMR Accommodation · Guest information</span>
        <h1>Privacy notice</h1>
        <p>Here’s what information is used to arrange your accommodation and how it is handled.</p>
      </header>
      <div className="legal-layout">
        <nav className="legal-contents card" aria-label="On this page">
          <strong>On this page</strong>
          <a href="#information">Information collected</a>
          <a href="#use">How it is used</a>
          <a href="#access">Access and payments</a>
          <a href="#retention">Storage and retention</a>
          <a href="#questions">Questions</a>
        </nav>
        <div className="legal-sections">
          <section id="information" className="legal-section card">
            <span className="legal-number">01</span><div><h2>Information collected</h2>
            <p>When you book, we collect the booker’s and occupants’ names, phone numbers, email addresses, and gender where required for room allocation. If you contact support, we also collect the contact details and message you provide, including your preferred way for the lodge coordinator to reach you.</p></div>
          </section>
          <section id="use" className="legal-section card">
            <span className="legal-number">02</span><div><h2>How information is used</h2>
            <p>Booking information is used to process accommodation reservations, allocate rooms, coordinate check-in, and provide booking support. Support contact details help the accommodation team and relevant lodge coordinator follow up on your request.</p></div>
          </section>
          <section id="access" className="legal-section card">
            <span className="legal-number">03</span><div><h2>Access and payments</h2>
            <p>Booking details are available to authorised accommodation staff for these operational purposes. Roommates do not see one another’s contact details. Payments are processed through Paystack; YMR Accommodation does not store your card details.</p></div>
          </section>
          <section id="retention" className="legal-section card">
            <span className="legal-number">04</span><div><h2>Storage and retention</h2>
            <p>Booking records are kept for the event and for a reasonable period afterward to support payment reconciliation and guest support. Access to booking information is limited to authorised accommodation staff.</p></div>
          </section>
          <section id="questions" className="legal-section card">
            <span className="legal-number">05</span><div><h2>Questions about your information</h2>
            <p>If you have a question about information connected to your booking, contact the accommodation team through guest support and include your booking reference where available.</p>
            <Link className="legal-action" href="/support">Contact guest support <span aria-hidden="true">→</span></Link></div>
          </section>
        </div>
      </div>
      <aside className="legal-note"><strong>Your information supports your stay.</strong><span>Share only the details needed to arrange your booking or resolve your request.</span><Link href="/support">Ask a question</Link></aside>
    </article>
  );
}
