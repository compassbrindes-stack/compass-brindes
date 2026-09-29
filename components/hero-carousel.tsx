"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// Carrossel de banners do topo da página inicial.
// Para trocar/editar um banner, basta mudar a lista SLIDES abaixo.
// As fotos ficam em /public (fotos reais de trabalhos entregues).

type Slide = {
  id: string;
  theme: "brand" | "rosa" | "laser" | "agro";
  eyebrow: string;
  title: string;
  highlight: string;
  text: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  photos: { src: string; alt: string }[];
};

const SLIDES: Slide[] = [
  {
    id: "marca",
    theme: "brand",
    eyebrow: "Personalização que vira presença",
    title: "Brindes que fazem sua marca",
    highlight: "ser lembrada.",
    text: "Curadoria de produtos corporativos para empresas que querem presentear com intenção.",
    primary: { label: "Explorar catálogo", href: "/produtos" },
    secondary: { label: "Meu orçamento", href: "/orcamento" },
    photos: [
      { src: "/trabalho-garrafas-nomes.webp", alt: "Garrafas térmicas gravadas com o nome de cada colaborador" },
      { src: "/trabalho-powerbank-alvorada.webp", alt: "Power banks personalizados com a marca do cliente" },
    ],
  },
  {
    id: "outubro-rosa",
    theme: "rosa",
    eyebrow: "Campanha do mês",
    title: "Outubro",
    highlight: "Rosa",
    text: "Brindes de autocuidado e bem-estar para campanhas de conscientização sobre a saúde da mulher.",
    primary: { label: "Ver brindes do Outubro Rosa", href: "/produtos?tema=outubro-rosa" },
    photos: [],
  },
  {
    id: "laser",
    theme: "laser",
    eyebrow: "Gravação a laser",
    title: "Sua marca gravada",
    highlight: "com acabamento premium.",
    text: "Facas, canivetes, garrafas e canetas com gravação definitiva, que não desbota com o uso.",
    primary: { label: "Pedir orçamento", href: "/orcamento" },
    secondary: { label: "Ver canivetes", href: "/produtos?categoria=Canivetes" },
    photos: [
      { src: "/trabalho-facas-erm-tech.webp", alt: "Facas gravadas a laser com a marca do cliente" },
      { src: "/trabalho-canivetes-supratick.webp", alt: "Canivetes de inox gravados a laser" },
    ],
  },
  {
    id: "agro",
    theme: "agro",
    eyebrow: "Brindes para o campo",
    title: "Brindes",
    highlight: "Agro.",
    text: "Ferramentas, canivetes e térmicos resistentes para quem vive o dia a dia no campo.",
    primary: { label: "Ver brindes Agro", href: "/produtos?tema=brindes-agro" },
    photos: [
      { src: "/produtos/canivete-premium-hunter-clip-1.jpg", alt: "Canivete de inox em plantação de girassóis ao pôr do sol" },
      { src: "/trabalho-kit-churrasco-cresol.webp", alt: "Kit churrasco personalizado com a marca do cliente" },
    ],
  },
];

const INTERVAL_MS = 6000;

function RibbonArt() {
  // Laço rosa desenhado em SVG (sem foto), para o banner do Outubro Rosa.
  return (
    <svg className="hc-ribbon" viewBox="0 0 200 260" aria-hidden="true">
      <path
        d="M100 30c-26 0-44 20-44 46 0 22 12 44 28 68L40 230l30 12 30-58 30 58 30-12-44-86c16-24 28-46 28-68 0-26-18-46-44-46zm0 24c12 0 20 10 20 22 0 14-8 30-20 48-12-18-20-34-20-48 0-12 8-22 20-22z"
        fill="currentColor"
      />
    </svg>
  );
}

export function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const total = SLIDES.length;

  const go = useCallback((i: number) => setIndex((i + total) % total), [total]);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => go(index + 1), INTERVAL_MS);
    return () => clearTimeout(t);
  }, [index, paused, go]);

  return (
    <section
      className="hc"
      aria-roledescription="carrossel"
      aria-label="Destaques"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
        setPaused(true);
      }}
      onTouchEnd={(e) => {
        if (touchX.current !== null) {
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
        }
        touchX.current = null;
        setPaused(false);
      }}
    >
      <div className="container">
        <div className="hc__frame">
          {SLIDES.map((s, i) => (
            <div
              key={s.id}
              className={`hc__slide hc__slide--${s.theme}${i === index ? " is-active" : ""}`}
              aria-hidden={i !== index}
              role="group"
              aria-roledescription="banner"
              aria-label={`${i + 1} de ${total}`}
            >
              <div className="hc__text">
                <p className="hc__eyebrow">{s.eyebrow}</p>
                {i === 0 ? (
                  <h1 className="hc__title">
                    {s.title} <em>{s.highlight}</em>
                  </h1>
                ) : (
                  <h2 className="hc__title">
                    {s.title} <em>{s.highlight}</em>
                  </h2>
                )}
                <p className="hc__lede">{s.text}</p>
                <div className="hc__actions">
                  <Link className="hc__btn hc__btn--primary" href={s.primary.href} tabIndex={i === index ? 0 : -1}>
                    {s.primary.label}
                  </Link>
                  {s.secondary && (
                    <Link className="hc__btn hc__btn--ghost" href={s.secondary.href} tabIndex={i === index ? 0 : -1}>
                      {s.secondary.label}
                    </Link>
                  )}
                </div>
              </div>
              <div className="hc__art">
                {s.photos.length > 0 ? (
                  s.photos.map((p, k) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={p.src}
                      src={p.src}
                      alt={p.alt}
                      className={`hc__photo hc__photo--${k + 1}`}
                      loading={i === 0 ? "eager" : "lazy"}
                    />
                  ))
                ) : (
                  <RibbonArt />
                )}
              </div>
            </div>
          ))}

          <button type="button" className="hc__arrow hc__arrow--prev" aria-label="Banner anterior" onClick={() => go(index - 1)}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className="hc__arrow hc__arrow--next" aria-label="Próximo banner" onClick={() => go(index + 1)}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="hc__dots">
            {SLIDES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`hc__dot${i === index ? " is-active" : ""}`}
                aria-label={`Ir para o banner ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
