import Image from "next/image";
import Link from "next/link";

export const metadata = { title: "Request staff access" };

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Check your details. Use a valid email address and a password with at least 12 characters.",
};

export default async function StaffRegistrationPage({ searchParams }: { searchParams: Promise<{ error?: string; submitted?: string }> }) {
  const params = await searchParams;
  const error = params.error === "invalid" ? ERROR_MESSAGES.invalid : params.error;
  return <div className="staff-registration-wrap">
    <section className="staff-registration-card">
      <div className="staff-registration-brand"><Image src="/ymr-mark.png" alt="" width={42} height={52} /><span><strong>YMR Accommodation</strong><small>Staff workspace</small></span></div>
      {params.submitted ? <div className="staff-registration-success" role="status">
        <span className="staff-registration-icon" aria-hidden="true">✓</span>
        <span className="eyebrow">Request received</span>
        <h1>Your access is awaiting approval</h1>
        <p>An administrator will review your request and assign the right level of access. For security, you can sign in only after approval.</p>
        <Link className="btn" href="/staff/login">Return to staff sign in</Link>
      </div> : <>
        <span className="eyebrow">Staff registration</span>
        <h1>Request staff access</h1>
        <p className="staff-registration-intro">Create your account and request an operational role. An administrator must approve your access before you can sign in.</p>
        {error && <div className="alert" role="alert">{error}</div>}
        <form method="post" action="/api/staff/request-access" className="staff-registration-form">
          <label className="field"><span>Full name</span><input name="name" autoComplete="name" required minLength={2} maxLength={120} /></label>
          <label className="field"><span>Work email</span><input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label className="field"><span>Create password (at least 12 characters)</span><input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={200} /></label>
          <label className="field"><span>Role requested</span><select name="roleKey" defaultValue="accommodation_officer"><option value="accommodation_officer">Lodge Coordinator</option><option value="accommodation_overseer">Accommodation Overseer</option></select></label>
          <div className="staff-role-note"><strong>Lodge Coordinator</strong><span>An administrator will assign one or more lodges after approval.</span><strong>Accommodation Overseer</strong><span>After approval, this role automatically covers all lodges.</span></div>
          <button className="btn" type="submit">Submit access request</button>
        </form>
        <p className="staff-registration-login">Already approved? <Link href="/staff/login">Sign in</Link></p>
      </>}
    </section>
  </div>;
}
