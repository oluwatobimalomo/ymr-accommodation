import Link from "next/link";
import type { Actor } from "@/lib/authz/authorize";
import { AdminNavigation } from "@/components/AdminNavigation";
import { SupportNotifications } from "@/components/SupportNotifications";

export function AdminShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const roleLabel = actor.roleKeys.map((role) => role.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())).join(", ") || "Staff";
  const initials = actor.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/admin" aria-label="YMR Accommodation admin home">
          <img src="/ymr-mark.png" alt="" />
          <span><strong>YMR Accommodation</strong><small>Administration</small></span>
        </Link>
        <p className="admin-nav-label">Workspace</p>
        <AdminNavigation actor={actor} />
        <div className="admin-sidebar-foot">Young Ministers Retreat</div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="admin-account">
            <SupportNotifications />
            <span className="admin-avatar" aria-hidden="true">{initials}</span>
            <span className="admin-account-copy"><strong>{actor.name}</strong><small>{roleLabel}</small></span>
            <form method="post" action="/api/auth/logout"><button className="admin-signout" type="submit">Sign out</button></form>
          </div>
        </header>
        <div className="admin-main">{children}</div>
      </div>
    </div>
  );
}

/** Shows the ?error= query param set by handleAdminAction after a failed form submission. */
export function ErrorBanner({ error }: { error?: string }) {
  if (!error) return null;
  return <div className="alert" role="alert">{error}</div>;
}
