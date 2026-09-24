"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/lodges", label: "Lodges", icon: "lodges" },
  { href: "/admin/bookings", label: "Bookings", icon: "bookings" },
  { href: "/admin/support", label: "Support", icon: "support" },
] as const;

function Icon({ name }: { name: (typeof links)[number]["icon"] }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    lodges: <><path d="M3 21V8l9-5 9 5v13" /><path d="M9 21v-6h6v6M7 10h.01M12 10h.01M17 10h.01" /></>,
    bookings: <><path d="M5 3h14v18H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    support: <><path d="M4 14v-3a8 8 0 0 1 16 0v3" /><path d="M4 14h3v6H6a2 2 0 0 1-2-2zM20 14h-3v6h1a2 2 0 0 0 2-2zM17 20c-1 1-2 1-5 1" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function AdminNavigation() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="Admin navigation">
      {links.map(({ href, label, icon }) => {
        const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return <Link key={href} href={href} aria-current={active ? "page" : undefined}><Icon name={icon} /><span>{label}</span></Link>;
      })}
    </nav>
  );
}
