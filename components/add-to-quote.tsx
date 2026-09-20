"use client";

import { useState } from "react";
import { addQuoteItem } from "@/lib/quote-storage";

const QUANTIDADE_MINIMA_PADRAO = 10;

export function AddToQuote({
  productId,
  name,
  supplierName,
  slug,
  minQuantity,
}: {
  productId: string;
  name: string;
  supplierName: string;
  slug: string;
  minQuantity?: number;
}) {
  const minimo = Math.max(minQuantity ?? QUANTIDADE_MINIMA_PADRAO, QUANTIDADE_MINIMA_PADRAO);
  const [quantity, setQuantity] = useState(minimo);
  const [added, setAdded] = useState(false);

  return (
    <div>
      <div className="form-field" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <label htmlFor="quantity">Quantidade</label>
        <input
          id="quantity"
          type="number"
          min={minimo}
          step={1}
          value={quantity}
          onChange={(e) => {
            const value = Number(e.target.value);
            setQuantity(Number.isNaN(value) ? minimo : value);
          }}
          onBlur={() => {
            if (quantity < minimo) setQuantity(minimo);
          }}
          style={{ width: 90 }}
        />
      </div>
      <p style={{ fontSize: 13, color: "var(--color-dark-2, #4a5c60)", margin: "4px 0 12px" }}>
        Pedido mínimo de {minimo} unidades.
      </p>
      <button
        className="btn btn-primary"
        onClick={() => {
          const quantidadeFinal = quantity < minimo ? minimo : quantity;
          addQuoteItem({ productId, name, supplierName, slug }, quantidadeFinal);
          setAdded(true);
        }}
      >
        {added ? "Adicionado ✓" : "Adicionar ao orçamento"}
      </button>
    </div>
  );
}
