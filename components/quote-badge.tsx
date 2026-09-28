"use client";

// Número de peças no orçamento, ao lado de "Meu orçamento" no menu.
import { useEffect, useState } from "react";
import { getQuoteItems } from "@/lib/quote-storage";

export function QuoteBadge() {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const atualizar = () => setTotal(getQuoteItems().reduce((acc, i) => acc + i.quantity, 0));
    atualizar();
    window.addEventListener("compass-brindes-quote-updated", atualizar);
    window.addEventListener("storage", atualizar);
    return () => {
      window.removeEventListener("compass-brindes-quote-updated", atualizar);
      window.removeEventListener("storage", atualizar);
    };
  }, []);

  if (total <= 0) return null;
  return (
    <span className="quote-badge" aria-label={total + " peças no orçamento"}>
      {total}
    </span>
  );
}
