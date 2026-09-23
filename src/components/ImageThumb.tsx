interface Props {
  src?: string | null;
  alt: string;
  aspect?: string; // CSS aspect-ratio, e.g. "16/10"
}

/** Plain <img>, not next/image: our images are data URIs (see src/lib/uploads.ts), which next/image's optimizer doesn't handle. */
export function ImageThumb({ src, alt, aspect = "4/3" }: Props) {
  if (src) {
    return (
      <div style={{ aspectRatio: aspect, overflow: "hidden", borderRadius: "var(--radius-md)", background: "var(--color-line)" }}>
        <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
    );
  }
  return (
    <div
      style={{
        aspectRatio: aspect,
        borderRadius: "var(--radius-md)",
        background: "var(--color-canvas)",
        border: "1px dashed var(--color-line)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      aria-hidden="true"
    >
      <img src="/ymr-mark.png" alt="" style={{ height: "40%", opacity: 0.25 }} />
    </div>
  );
}
