export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="stack">
      <h1>Privacy</h1>
      <p>
        We collect the booker&rsquo;s and each occupant&rsquo;s name, phone number, email and gender to process
        accommodation bookings, allocate rooms, and manage check-in. This information is only visible to authorised
        accommodation staff — roommates never see each other&rsquo;s contact details.
      </p>
      <p>
        Payment is processed by Paystack; we do not store your card details. We keep booking records for the
        duration of the event and a reasonable period afterward for reconciliation and support purposes.
      </p>
      <p>
        Questions about your data can be sent to <a href="/support">Support</a>.
      </p>
      <p className="listing-meta">
        This is placeholder content. Replace it with YMR&rsquo;s actual privacy policy before real bookings open.
      </p>
    </div>
  );
}
