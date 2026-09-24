"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MAIN_SITE_URL } from "@/theme/tokens";

const LINKS = [
  { href: "/accommodation", label: "Accommodation", icon: "stay" },
  { href: "/check-booking", label: "Check Booking", icon: "ticket" },
  { href: "/support", label: "Support", icon: "help" },
  { href: MAIN_SITE_URL, label: "YMR Global", icon: "external" },
] as const;

function NavIcon({ name }: { name: (typeof LINKS)[number]["icon"] }) {
  const art = {
    stay: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    ticket: <><path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6Z" /><path d="M13 8v2m0 4v2" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4.3 1.8c-1 .9-1.8 1.1-1.8 2.7M12 17h.01" /></>,
    external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{art[name]}</svg>;
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function isCurrent(href: string) {
    return href.startsWith("/") && (pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)));
  }

  return (
    <header className="site-header">
      <div className="wrap site-header-row">
        <Link className="brand" href="/" aria-label="YMR Accommodation home">
          <Image src="/ymr-mark.png" alt="" width={32} height={48} priority style={{ height: "42px", width: "auto" }} />
          <span className="brand-copy">
            <span className="brand-name">YMR Accommodation</span>
            <span className="brand-caption">Young Ministers Retreat</span>
          </span>
        </Link>

        {/* Desktop nav: hidden on narrow screens via CSS, never wraps raggedly */}
        <nav className="nav nav-desktop" aria-label="Main">
          {LINKS.map(({ href, label, icon }) => (
            <a key={href} href={href} className={`nav-tab${href === "/check-booking" ? " nav-booking-link" : ""}${isCurrent(href) ? " nav-current" : ""}`} aria-current={isCurrent(href) ? "page" : undefined}>
              <NavIcon name={icon} /><span>{label}</span>
            </a>
          ))}
        </nav>

        {/* Mobile: a real toggleable menu instead of letting links wrap onto their own stray lines */}
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
        </button>
      </div>

      {open && (
        <nav id="mobile-nav" className="nav-mobile" aria-label="Main">
          {LINKS.map(({ href, label, icon }) => (
            <a key={href} href={href} className={`nav-tab${isCurrent(href) ? " nav-current" : ""}`} aria-current={isCurrent(href) ? "page" : undefined} onClick={() => setOpen(false)}>
              <NavIcon name={icon} /><span>{label}</span>
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-main">
          <div className="footer-brand-block">
            <a className="footer-brand-lockup" href={MAIN_SITE_URL}>
              <Image src="/ymr-mark.png" alt="" width={34} height={44} />
              <span><strong>YMR Global</strong></span>
            </a>
            <p>Official accommodation booking and guest support for the Young Ministers Retreat.</p>
            <p className="footer-trademark">© {new Date().getFullYear()} YMR Global. All rights reserved.</p>
          </div>
          <nav className="footer-links" aria-label="Guest services">
            <strong>Guest services</strong>
            <a href="/accommodation">Find accommodation</a>
            <a href="/check-booking">Check my booking</a>
            <a href="/support">Contact support</a>
          </nav>
          <nav className="footer-links footer-resources" aria-label="Information">
            <strong>Information</strong>
            <a href="/faq">FAQ</a>
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
