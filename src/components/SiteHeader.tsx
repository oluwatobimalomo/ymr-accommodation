"use client";

import Image from "next/image";
import { useState } from "react";
import { MAIN_SITE_URL } from "@/theme/tokens";

const LINKS: [string, string][] = [
  ["/accommodation", "Accommodation"],
  ["/check-booking", "Check my booking"],
  ["/support", "Support"],
  [MAIN_SITE_URL, "YMR Global"],
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="wrap site-header-row">
        <a className="brand" href="/">
          <Image src="/ymr-mark.png" alt="" width={32} height={48} priority style={{ height: "36px", width: "auto" }} />
          <span>YMR Accommodation</span>
        </a>

        {/* Desktop nav: hidden on narrow screens via CSS, never wraps raggedly */}
        <nav className="nav nav-desktop" aria-label="Main">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href}>
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
            <a key={href} href={href} onClick={() => setOpen(false)}>
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
        Part of <a href={MAIN_SITE_URL}>YMR Global</a>. <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/faq">FAQ</a>
      </div>
    </footer>
  );
}
