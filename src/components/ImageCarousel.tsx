"use client";

import { useEffect, useState } from "react";

export function ImageCarousel({
  images,
  alt,
  className = "",
  autoAdvanceMs = 0,
  advanceOnHover = false,
  showControls = true,
}: {
  images: string[];
  alt: string;
  className?: string;
  autoAdvanceMs?: number;
  advanceOnHover?: boolean;
  showControls?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const photos = images.filter(Boolean);
  const photoCount = photos.length;

  useEffect(() => {
    if (photoCount < 2 || autoAdvanceMs <= 0 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % photoCount), autoAdvanceMs);
    return () => window.clearInterval(timer);
  }, [autoAdvanceMs, paused, photoCount]);

  if (!photos.length) {
    return <div className={`apartment-carousel empty ${className}`} aria-label="No photos available"><img src="/ymr-mark.png" alt="" /></div>;
  }
  const move = (direction: number) => setIndex((current) => (current + direction + photos.length) % photos.length);
  return (
    <div
      className={`apartment-carousel ${className}`}
      aria-label={`${alt}, photo ${index + 1} of ${photos.length}`}
      onMouseEnter={() => {
        setPaused(true);
        if (advanceOnHover && photos.length > 1) setIndex((current) => (current + 1) % photos.length);
      }}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <img className={autoAdvanceMs > 0 ? "lodge-slideshow-image" : undefined} key={photos[index]} src={photos[index]} alt={`${alt}, photo ${index + 1} of ${photos.length}`} />
      {photos.length > 1 && showControls && <>
        <button type="button" className="carousel-arrow previous" aria-label="Previous photo" onClick={(event) => { event.stopPropagation(); move(-1); }}>‹</button>
        <button type="button" className="carousel-arrow next" aria-label="Next photo" onClick={(event) => { event.stopPropagation(); move(1); }}>›</button>
        <div className="carousel-counter" aria-hidden="true">{index + 1} / {photos.length}</div>
      </>}
      {photos.length > 1 && !showControls && <div className="carousel-counter" aria-hidden="true">{index + 1} / {photos.length}</div>}
    </div>
  );
}
