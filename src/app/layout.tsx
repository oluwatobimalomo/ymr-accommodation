import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { themeCss } from "@/theme/tokens";

const configuredOrigin = process.env.APP_ORIGIN?.trim();
const vercelOrigin = process.env.VERCEL_URL?.trim();

const appOrigin =
  configuredOrigin ||
  (vercelOrigin ? `https://${vercelOrigin}` : "http://localhost:3000");

export const metadata: Metadata = {
  title: {
    default: "YMR 2026 Accommodation",
    template: "%s | YMR Accommodation",
  },
  description: "Official accommodation booking for the Young Ministers Retreat.",
  metadataBase: new URL(appOrigin),
  icons: {
    icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
      </head>
      <body>
        <a className="skip" href="#content">
          Skip to content
        </a>

        <SiteHeader />

        <main id="content">
          <div className="wrap">{children}</div>
        </main>

        <SiteFooter />
      </body>
    </html>
  );
}