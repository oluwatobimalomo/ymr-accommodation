/**
 * ============================================================================
 *  YMR THEME - THE ONLY FILE THAT NEEDS EDITING TO REBRAND
 * ============================================================================
 *  Colors are sampled from the official YMR/RCCG flame-and-dove logo
 *  (public/ymr-mark.png). Geist is loaded in the root layout and used
 *  throughout the interface.
 *
 *  Keep font family assignments here aligned with the root layout variables.
 * ============================================================================
 */
export const theme = {
  color: {
    // Sampled from the official YMR/RCCG flame-and-dove mark.
    brand: "#E8720E",
    brandStrong: "#B85709",
    onBrand: "#FFFFFF",
    // Secondary accents from the seal itself, used sparingly (dividers, tags, small flourishes) — never for body text or as the only signal of meaning.
    navy: "#282068",
    emerald: "#0F8A3E",
    ink: "#1C1917",
    inkMuted: "#57534E",
    textSubtle: "#6A746F",
    forest: "#173F34",
    surface: "#FFFFFF",
    surfaceSubtle: "#F8FAF8",
    canvas: "#F7F5F2",
    canvasAdmin: "#F3F6F4",
    line: "#D6D3D1",
    borderSubtle: "#E3E9E5",
    borderStrong: "#BDCEC4",
    focus: "#1D4ED8",
    // Semantic status colors (never the only signal; see components/Bedspace)
    success: "#166534",
    successSoft: "#DCFCE7",
    warning: "#92400E",
    warningSoft: "#FEF3C7",
    danger: "#991B1B",
    dangerSoft: "#FEE2E2",
    info: "#1E40AF",
    infoSoft: "#DBEAFE",
  },
  font: {
    display: 'var(--font-geist-sans), system-ui, sans-serif',
    body: 'var(--font-geist-sans), system-ui, sans-serif',
    mono: 'var(--font-geist-mono), ui-monospace, monospace',
  },
  type: {
    display: "clamp(2.25rem, 5vw, 3.75rem)",
    pageTitle: "clamp(1.625rem, 1.35rem + 1.15vw, 2.25rem)",
    section: "clamp(1.2rem, 1.08rem + .55vw, 1.5rem)",
    card: "1rem",
    body: "1rem",
    meta: ".875rem",
    label: ".875rem",
    navigation: ".9375rem",
    button: ".875rem",
    eyebrow: ".7rem",
    tableHeader: ".75rem",
    price: "1.125rem",
  },
  radius: { sm: "6px", md: "12px", lg: "20px", pill: "999px" },
  space: { 1: "4px", 2: "8px", 3: "12px", 4: "16px", 5: "24px", 6: "32px", 7: "48px", 8: "72px" },
  shadow: {
    card: "0 8px 24px rgb(29 55 42 / 5%)",
    cardHover: "0 14px 30px rgb(29 55 42 / 9%)",
    overlay: "0 28px 90px rgb(12 30 23 / 24%)",
  },
  layout: { maxWidth: "1240px", adminMaxWidth: "1600px", tapTarget: "44px" },
} as const;

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());

/** Flattens the theme into CSS custom properties. */
export function themeCss(): string {
  const lines: string[] = [];
  for (const [group, values] of Object.entries(theme)) {
    for (const [key, value] of Object.entries(values)) {
      lines.push(`--${group}-${kebab(key)}:${value};`);
    }
  }
  return `:root{${lines.join("")}}`;
}

export const MAIN_SITE_URL = process.env.MAIN_SITE_URL ?? "https://ymrglobal.org";
