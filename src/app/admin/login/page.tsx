export const metadata = { title: "Staff sign in" };

const MESSAGES: Record<string, string> = {
  invalid: "Email or password is incorrect.",
  locked: "Too many attempts. This account is locked for 15 minutes.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <img src="/ymr-mark.png" alt="" className="auth-mark" aria-hidden="true" />
        <h1>Staff sign in</h1>
        <p className="auth-subtitle">YMR 2026 accommodation administration</p>
        {message && (
          <div className="alert" role="alert">
            {message}
          </div>
        )}
        <form method="post" action="/api/auth/login" className="stack">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="btn" type="submit" style={{ width: "100%" }}>
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
