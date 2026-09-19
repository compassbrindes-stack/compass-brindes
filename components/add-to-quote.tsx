"use client";

import { useState } from "react";
import { addQuoteItem } from "@/lib/quote-storage";

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
  const [quantity, setQuantity] = useState(minQuantity ?? 1);
  const [added, setAdded] = useState(false);

  return (
    <div>
      <div className="form-field" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <label htmlFor="quantity">Quantidade</label>
        <input
          id="quantity"
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          style={{ width: 90 }}
        />
      </div>
      <button
        className="btn btn-primary"
        onClick={() => {
          addQuoteItem({ productId, name, supplierName, slug }, quantity);
          setAdded(true);
        }}
      >
        {added ? "Adicionado ✓" : "Adicionar ao orçamento"}
      </button>
    </div>
  );
}
