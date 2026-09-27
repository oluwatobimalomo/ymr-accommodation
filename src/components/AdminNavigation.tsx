"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Actor } from "@/lib/authz/authorize";

const links = [
  { href: "/admin", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/lodges", label: "Lodges", icon: "lodges" },
  { href: "/admin/events", label: "Events", icon: "events" },
  { href: "/admin/bookings", label: "Bookings", icon: "bookings" },
  { href: "/admin/operations", label: "Guest operations", icon: "operations" },
  { href: "/admin/reports", label: "Reports", icon: "reports" },
  { href: "/admin/occupancy-reports", label: "Occupancy reports", icon: "reports" },
  { href: "/admin/check-in-reports", label: "Check-in reports", icon: "checkin" },
  { href: "/admin/payment-reports", label: "Payment reports", icon: "payments" },
  { href: "/admin/reconciliation", label: "Paystack reconciliation", icon: "payments" },
  { href: "/admin/support", label: "Support", icon: "support" },
  { href: "/admin/staff", label: "Staff access", icon: "staff" },
  { href: "/admin/audit", label: "Audit log", icon: "audit" },
] as const;

function Icon({ name }: { name: (typeof links)[number]["icon"] }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    lodges: <><path d="M3 21V8l9-5 9 5v13" /><path d="M9 21v-6h6v6M7 10h.01M12 10h.01M17 10h.01" /></>,
    bookings: <><path d="M5 3h14v18H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    operations: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1M17 8h4m-2-2v4M17 14h4m-2-2v4" /></>,
    reports: <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 6-7" /></>,
    payments: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></>,
    support: <><path d="M4 14v-3a8 8 0 0 1 16 0v3" /><path d="M4 14h3v6H6a2 2 0 0 1-2-2zM20 14h-3v6h1a2 2 0 0 0 2-2zM17 20c-1 1-2 1-5 1" /></>,
    staff: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M17 8h4m-2-2v4M17 15h4"/></>,
    events: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m9 15 2 2 4-4"/></>,
    checkin: <><path d="M8 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="m9 12 2.5 2.5L20 6"/></>,
    audit: <><path d="M12 3 19 6v5c0 4.5-2.8 7.8-7 10-4.2-2.2-7-5.5-7-10V6z"/><path d="M9 12h6M9 9h6M9 15h3"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function AdminNavigation({ actor }: { actor: Actor }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => setIsOpen(false), [pathname]);
  const visibleLinks = links.filter((link) => link.href === "/admin/reports"
    ? actor.globalPermissions.has("reports.read") || actor.scopedPermissions.has("reports.read")
    : link.href === "/admin/staff" ? actor.globalPermissions.has("users.manage")
    : link.href === "/admin/events" ? actor.globalPermissions.has("events.manage")
    : link.href === "/admin/audit" ? actor.globalPermissions.has("audit.read")
    : link.href === "/admin/occupancy-reports" || link.href === "/admin/check-in-reports" ? actor.globalPermissions.has("booking.read") || (actor.scopedPermissions.has("booking.read") && actor.lodgeIds.size > 0)
    : link.href === "/admin/reconciliation" || link.href === "/admin/payment-reports" ? actor.globalPermissions.has("payment.reconcile")
    : link.href === "/admin/lodges" ? actor.globalPermissions.has("inventory.write")
    : link.href === "/admin/operations" || link.href === "/admin/bookings" || link.href === "/admin/support"
      ? actor.globalPermissions.has(link.href === "/admin/support" ? "support.read" : "booking.read") || actor.scopedPermissions.has(link.href === "/admin/support" ? "support.read" : "booking.read")
      : true);
  return (
    <>
      <button className="admin-nav-toggle" type="button" aria-expanded={isOpen} aria-controls="admin-navigation" onClick={() => setIsOpen((open) => !open)}>
        <span aria-hidden="true">{isOpen ? "×" : "☰"}</span><span>{isOpen ? "Close menu" : "Menu"}</span>
      </button>
      <nav className={`admin-nav${isOpen ? " is-open" : ""}`} id="admin-navigation" aria-label="Admin navigation">
        {visibleLinks.map(({ href, label, icon }) => {
          const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={href} href={href} aria-current={active ? "page" : undefined}><Icon name={icon} /><span>{label}</span></Link>;
        })}
      </nav>
    </>
  );
}
