"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MAIN_SITE_URL } from "@/theme/tokens";

const LINKS: [string, string][] = [
  ["/", "Accommodation"],
  ["/check-booking", "Check Booking"],
  ["/support", "Support"],
  [MAIN_SITE_URL, "YMR Global"],
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  function isCurrent(href: string) {
    return href.startsWith("/") && (pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)));
  }

  return (
    <header className="site-header">
      <div className="wrap site-header-row">
        <a className="brand" href="/" aria-label="YMR Accommodation home">
          <Image src="/ymr-mark.png" alt="" width={32} height={48} priority style={{ height: "42px", width: "auto" }} />
          <span className="brand-copy">
            <span className="brand-name">YMR Accommodation</span>
            <span className="brand-caption">Young Ministers Retreat</span>
          </span>
        </a>

        {/* Desktop nav: hidden on narrow screens via CSS, never wraps raggedly */}
        <nav className="nav nav-desktop" aria-label="Main">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href} className={`nav-tab${href === "/check-booking" ? " nav-booking-link" : ""}${isCurrent(href) ? " nav-current" : ""}`} aria-current={isCurrent(href) ? "page" : undefined}>
              {label}
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
          {LINKS.map(([href, label]) => (
            <a key={href} href={href} className={`nav-tab${isCurrent(href) ? " nav-current" : ""}`} aria-current={isCurrent(href) ? "page" : undefined} onClick={() => setOpen(false)}>
              {label}
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
            <p className="footer-trademark">© {new Date().getFullYear()} YMR Global. All rights reserved.</p>
          </div>
          <nav className="footer-links" aria-label="Footer">
            <a href="/faq">FAQ</a>
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
