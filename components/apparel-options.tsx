"use client";

// Escolha de cor, tamanho e quantidade para itens de vestuário.
// Cada combinação (cor + tamanho) entra no orçamento como uma linha separada,
// com o nome já dizendo a cor e o tamanho (ex.: "Babylook ... — Rosa, tam. M").

import { useState } from "react";
import Link from "next/link";
import { addQuoteItem } from "@/lib/quote-storage";
import type { ApparelInfo } from "@/lib/types";

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

export function ApparelOptions({
  productId,
  name,
  supplierName,
  productSlug,
  apparel,
}: {
  productId: string;
  name: string;
  supplierName: string;
  productSlug: string;
  apparel: ApparelInfo;
}) {
  const [color, setColor] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(10);
  const [added, setAdded] = useState<string[]>([]);

  const pronto = Boolean(color && size && quantity >= 1);

  function adicionar() {
    if (!color || !size || quantity < 1) return;
    const label = color + ", tam. " + size;
    addQuoteItem(
      {
        productId: productId + "__" + slug(color) + "__" + slug(size),
        name: name + " — " + label,
        supplierName,
        slug: productSlug,
      },
      quantity
    );
    setAdded((prev) => [...prev, label + " (" + quantity + " un.)"]);
    setSize(null);
  }

  return (
    <div className="apparel">
      <div className="apparel__group">
        <p className="apparel__label">
          Cor{color ? ": " : ""}
          {color && <strong>{color}</strong>}
        </p>
        <div className="apparel__colors" role="radiogroup" aria-label="Cor">
          {apparel.colors.map((c) => (
            <button
              key={c.name}
              type="button"
              role="radio"
              aria-checked={color === c.name}
              aria-label={c.name}
              title={c.name}
              className={"apparel__color" + (color === c.name ? " is-active" : "")}
              onClick={() => setColor(c.name)}
            >
              <span className="apparel__swatch" style={{ background: c.hex }} />
              <span className="apparel__color-name">{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="apparel__group">
        <p className="apparel__label">
          Tamanho{size ? ": " : ""}
          {size && <strong>{size}</strong>}
        </p>
        <div className="apparel__sizes" role="radiogroup" aria-label="Tamanho">
          {apparel.sizes.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={size === s}
              className={"apparel__size" + (size === s ? " is-active" : "")}
              onClick={() => setSize(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="apparel__group apparel__qty">
        <label htmlFor="apparel-qty" className="apparel__label">
          Quantidade
        </label>
        <input
          id="apparel-qty"
          type="number"
          min={1}
          step={1}
          value={quantity}
          onChange={(e) => {
            const value = Number(e.target.value);
            setQuantity(Number.isNaN(value) ? 1 : value);
          }}
          onBlur={() => {
            if (quantity < 1) setQuantity(1);
          }}
        />
      </div>
      <p className="apparel__hint">Quantidade mínima, prazo e personalização sob consulta.</p>

      <button
        type="button"
        className="btn btn-primary"
        disabled={!pronto}
        style={!pronto ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
        onClick={adicionar}
      >
        Adicionar ao orçamento
      </button>
      {!pronto && <p className="apparel__hint">Escolha a cor e o tamanho para adicionar.</p>}

      {added.length > 0 && (
        <div className="apparel__added">
          <p>
            <strong>Adicionado ao orçamento ✓</strong>
          </p>
          <ul>
            {added.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
          <p className="apparel__hint">Quer outra cor ou tamanho? Escolha acima e adicione de novo.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            <Link className="btn btn-primary" href="/orcamento">
              Finalizar orçamento
            </Link>
            <Link className="btn btn-outline" href="/produtos">
              Voltar para produtos
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
