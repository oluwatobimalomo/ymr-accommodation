"use client";

import { useState } from "react";

export function ImageCarousel({ images, alt, className = "" }: { images: string[]; alt: string; className?: string }) {
  const [index, setIndex] = useState(0);
  const photos = images.filter(Boolean);
  if (!photos.length) {
    return <div className={`apartment-carousel empty ${className}`} aria-label="No photos available"><img src="/ymr-mark.png" alt="" /></div>;
  }
  const move = (direction: number) => setIndex((current) => (current + direction + photos.length) % photos.length);
  return (
    <div className={`apartment-carousel ${className}`}>
      <img src={photos[index]} alt={`${alt}, photo ${index + 1} of ${photos.length}`} />
      {photos.length > 1 && <>
        <button type="button" className="carousel-arrow previous" aria-label="Previous photo" onClick={(event) => { event.stopPropagation(); move(-1); }}>‹</button>
        <button type="button" className="carousel-arrow next" aria-label="Next photo" onClick={(event) => { event.stopPropagation(); move(1); }}>›</button>
        <div className="carousel-counter" aria-live="polite">{index + 1} / {photos.length}</div>
      </>}
    </div>
  );
}
