/** Format stored minor units (kobo) as a readable Nigerian Naira amount. */
export function formatNaira(amountMinor: number): string {
  const amountNaira = amountMinor / 100;
  const hasKobo = amountMinor % 100 !== 0;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: hasKobo ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amountNaira);
}
