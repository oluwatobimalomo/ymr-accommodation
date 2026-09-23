import Link from "next/link";

export function AdminNav() {
  const links: [string, string][] = [
    ["/admin", "Dashboard"],
    ["/admin/lodges", "Lodges"],
    ["/admin/facilities", "Facilities"],
    ["/admin/bookings", "Bookings"],
    ["/admin/support", "Support"],
  ];
  return (
    <nav className="nav" aria-label="Admin section" style={{ marginBottom: "var(--space-2)" }}>
      {links.map(([href, label]) => (
        <Link key={href} href={href}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Shows the ?error= query param set by handleAdminAction after a failed form submission. */
export function ErrorBanner({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div className="alert" role="alert">
      {error}
    </div>
  );
}
