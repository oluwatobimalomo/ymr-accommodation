import Image from "next/image";
import { MAIN_SITE_URL } from "@/theme/tokens";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="wrap">
        <a className="brand" href="/">
          <Image src="/ymr-mark.png" alt="" width={32} height={48} priority style={{ height: "36px", width: "auto" }} />
          <span>YMR Accommodation</span>
        </a>
        <nav className="nav" aria-label="Main">
          <a href="/accommodation">Accommodation</a>
          <a href="/check-booking">Check my booking</a>
          <a href="/support">Support</a>
          <a href={MAIN_SITE_URL}>YMR Global</a>
        </nav>
      </div>
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
