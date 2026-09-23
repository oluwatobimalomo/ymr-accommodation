export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <div className="stack">
      <h1>Terms</h1>
      <p>
        These terms cover accommodation bookings made through this site for the Young Ministers Retreat. By completing
        a booking, you agree to arrive with the occupant details provided, to keep your booking reference for
        check-in, and to follow the conduct expected of all YMR participants.
      </p>
      <p>
        A booking reserves accommodation but does not guarantee entry to the retreat itself; retreat registration is
        handled separately by YMR Global.
      </p>
      <p>
        Cancellations and refunds are handled case by case by the accommodation team. Contact{" "}
        <a href="/support">Support</a> with your booking reference for any changes.
      </p>
      <p className="listing-meta">
        This is placeholder content. Replace it with YMR&rsquo;s actual terms before real bookings open.
      </p>
    </div>
  );
}
