/**
 * ============================================================================
 *  YMR THEME - THE ONLY FILE THAT NEEDS EDITING TO REBRAND
 * ============================================================================
 *  Colors are sampled from the official YMR/RCCG flame-and-dove logo
 *  (public/ymr-mark.png). Typography pairs a warm editorial serif with a
 *  clean system sans stack so the site remains fast and works offline.
 *
 *  The font stacks intentionally use locally available system fonts.
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
    surface: "#FFFFFF",
    canvas: "#F7F5F2",
    line: "#D6D3D1",
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
    display: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
  },
  radius: { sm: "6px", md: "12px", lg: "20px", pill: "999px" },
  space: { 1: "4px", 2: "8px", 3: "12px", 4: "16px", 5: "24px", 6: "32px", 7: "48px", 8: "72px" },
  layout: { maxWidth: "1240px", tapTarget: "44px" },
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
