"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CONTA_EVENT, contaConfigurada, sessaoAtual } from "@/lib/conta";

// Link do cabeçalho: "Entrar" para visitantes e "Minha conta" para quem já entrou.
// Só aparece quando o cadastro de clientes está configurado.
export function AccountLink() {
  const [estado, setEstado] = useState<"oculto" | "visitante" | "logado">("oculto");

  useEffect(() => {
    if (!contaConfigurada()) return;
    const atualizar = () => setEstado(sessaoAtual() ? "logado" : "visitante");
    atualizar();
    window.addEventListener(CONTA_EVENT, atualizar);
    window.addEventListener("storage", atualizar);
    return () => {
      window.removeEventListener(CONTA_EVENT, atualizar);
      window.removeEventListener("storage", atualizar);
    };
  }, []);

  if (estado === "oculto") return null;

  return (
    <Link href="/conta" className="hd__icon" aria-label={estado === "logado" ? "Minha conta" : "Entrar"}>
      <span className="hd__icon-img">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
          <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      <span className="hd__icon-label">{estado === "logado" ? "Minha conta" : "Entrar"}</span>
    </Link>
  );
}
