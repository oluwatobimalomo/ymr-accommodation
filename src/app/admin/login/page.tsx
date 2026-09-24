import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/lib/auth/session";

export const metadata = { title: "Staff sign in" };

const MESSAGES: Record<string, string> = {
  invalid: "Email or password is incorrect.",
  locked: "Too many attempts. This account is locked for 15 minutes.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentActor()) redirect("/admin");
  const { error } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;
  return (
    <div className="admin-login-page">
      <aside className="login-story-panel">
        <LinkLogo />
        <div className="login-story-copy">
          <span className="login-story-kicker">Young Ministers Retreat · 2026</span>
          <h1>Welcome to a smoother stay.</h1>
          <p>One workspace for lodge inventory, guest bookings, and on-site accommodation support.</p>
        </div>
        <div className="login-story-card">
          <span className="login-story-icon" aria-hidden="true">⌂</span>
          <div><strong>Every stay starts here.</strong><span>Manage the places and people that make retreat possible.</span></div>
          <div className="login-story-dots" aria-hidden="true"><i /><i /><i /></div>
        </div>
        <div className="login-story-foot"><span>YMR Accommodation</span><span>Staff workspace</span></div>
      </aside>
      <section className="login-form-panel">
        <div className="login-form-inner">
          <div className="login-mobile-brand"><Image src="/ymr-mark.png" alt="" width={42} height={52} /><span>YMR Accommodation</span></div>
          <span className="eyebrow">Staff workspace</span>
          <h2>Sign in to continue</h2>
          <p className="login-form-subtitle">Use your staff account to manage retreat accommodation.</p>
          {message && <div className="alert" role="alert">{message}</div>}
          <form method="post" action="/api/auth/login" className="login-form">
            <div className="field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="username" placeholder="you@example.com" required /></div>
            <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required /></div>
            <button className="btn" type="submit">Sign in securely <span aria-hidden="true">→</span></button>
          </form>
          <p className="login-security-note"><span aria-hidden="true">▣</span> Authorized YMR staff only. Your sign-in is protected.</p>
          <a className="login-back-link" href="/">← Return to accommodation site</a>
        </div>
      </section>
    </div>
  );
}

function LinkLogo() {
  return <a href="/" className="login-story-brand"><Image src="/ymr-mark.png" alt="" width={44} height={55} /><span><strong>YMR Accommodation</strong><small>Young Ministers Retreat</small></span></a>;
}
