"use client";

import { useEffect, useState } from "react";

// Seta "voltar ao topo": aparece depois que a pessoa rola a página para baixo
// e, ao tocar, sobe suavemente até o início. Fica no canto esquerdo para não
// disputar espaço com o botão do WhatsApp (canto direito).
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      className={`back-to-top${visible ? " is-visible" : ""}`}
      aria-label="Voltar ao topo"
      title="Voltar ao topo"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          d="M12 19V5M5 12l7-7 7 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
