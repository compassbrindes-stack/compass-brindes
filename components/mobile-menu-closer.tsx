"use client";

// Fecha o menu do celular depois que a pessoa toca num link ou faz uma busca.
// O menu é aberto/fechado por um checkbox (#menu-toggle) no cabeçalho; como a
// navegação do Next não recarrega a página, o checkbox continuaria marcado.

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function fechar() {
  const toggle = document.getElementById("menu-toggle") as HTMLInputElement | null;
  if (toggle) toggle.checked = false;
}

export function MobileMenuCloser() {
  const pathname = usePathname();

  useEffect(() => {
    fechar();
  }, [pathname]);

  useEffect(() => {
    const menu = document.getElementById("site-menu");
    if (!menu) return;
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("a")) fechar();
    };
    menu.addEventListener("click", onClick);
    menu.addEventListener("submit", fechar);
    return () => {
      menu.removeEventListener("click", onClick);
      menu.removeEventListener("submit", fechar);
    };
  }, []);

  return null;
}
