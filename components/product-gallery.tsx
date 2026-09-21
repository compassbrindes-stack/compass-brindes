"use client";

import { useState } from "react";

export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const safeImages = images.length > 0 ? images : [];
  const current = safeImages[active] ?? safeImages[0];

  return (
    <div className="product-gallery">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={current} alt={alt} className="product-gallery__main" />

      {safeImages.length > 1 && (
        <div className="product-gallery__thumbs">
          {safeImages.map((src, index) => (
            <button
              key={src + index}
              type="button"
              className={
                "product-gallery__thumb" +
                (index === active ? " product-gallery__thumb--active" : "")
              }
              onClick={() => setActive(index)}
              aria-label={`Ver foto ${index + 1} de ${alt}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
