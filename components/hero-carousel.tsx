"use client";

import { useEffect, useState } from "react";

type Slide = {
  src: string;
  alt: string;
};

const SLIDES: Slide[] = [
  { src: "/carousel/hero-post-1.jpg", alt: "Brinde corporativo personalizado Compass — garrafa e frasco com a marca do cliente" },
  { src: "/carousel/hero-post-2.jpg", alt: "Brinde corporativo personalizado Compass Brindes" },
];

export function HeroCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActive((current) => (current + 1) % SLIDES.length);
    }, 4500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hero-carousel">
      {SLIDES.map((slide, index) => (
        <img
          key={slide.src}
          src={slide.src}
          alt={slide.alt}
          className="hero-carousel-img"
          style={{ opacity: index === active ? 1 : 0 }}
        />
      ))}

      {SLIDES.length > 1 && (
        <div className="hero-carousel-dots">
          {SLIDES.map((slide, index) => (
            <button
              key={slide.src}
              type="button"
              aria-label={`Ver imagem ${index + 1}`}
              className={"hero-carousel-dot" + (index === active ? " is-active" : "")}
              onClick={() => setActive(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
