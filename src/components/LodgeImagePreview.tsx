"use client";

import { useEffect, useRef, useState } from "react";

export function LodgeImagePreview({ images, fallback, alt }: { images: string[]; fallback: string | null; alt: string }) {
  const photos = images.length ? images : fallback ? [fallback] : [];
  const previewRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!window.matchMedia("(hover: none), (pointer: coarse)").matches || photos.length < 2) return;
    const element = previewRef.current;
    if (!element || !("IntersectionObserver" in window)) {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setActive(Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.35)), { threshold: [0, 0.35] });
    observer.observe(element);
    return () => observer.disconnect();
  }, [photos.length]);

  useEffect(() => {
    if (!active || photos.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % photos.length), 4000);
    return () => window.clearInterval(timer);
  }, [active, photos.length]);

  return (
    <div ref={previewRef} className="lodge-image-preview" onPointerEnter={() => setActive(true)} onPointerLeave={() => setActive(false)} onFocus={() => setActive(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setActive(false); }}>
      {photos[index] ? <img key={photos[index]} className="lodge-slideshow-image" src={photos[index]} alt={alt} loading="lazy" decoding="async" /> : <img className="lodge-image-placeholder" src="/ymr-mark.png" alt="" />}
      {photos.length > 1 && <span className="lodge-photo-count" aria-hidden="true">{index + 1} / {photos.length}</span>}
    </div>
  );
}
