export function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "brand" | "navy" }) {
  const cls = tone === "default" ? "badge" : `badge badge-${tone}`;
  return <span className={cls}>{children}</span>;
}
