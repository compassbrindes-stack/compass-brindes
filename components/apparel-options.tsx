"use client";

// Escolha de cor, tamanho e quantidade para itens de vestuário, no estilo
// "vai colocando no carrinho": o cliente adiciona uma combinação, continua na
// mesma página e vai completando até chegar no pedido mínimo do modelo.
// Cada combinação (cor + tamanho) vira uma linha do orçamento, por exemplo
// "Babylook ... — Rosa, tam. M". O mínimo vale para o modelo inteiro.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  addQuoteItem,
  getQuoteItems,
  removeQuoteItem,
  type QuoteItem,
} from "@/lib/quote-storage";
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
  minQuantity,
}: {
  productId: string;
  name: string;
  supplierName: string;
  productSlug: string;
  apparel: ApparelInfo;
  /** Pedido mínimo do modelo, somando todas as cores e tamanhos. */
  minQuantity?: number;
}) {
  const minimo = minQuantity ?? 1;
  const [color, setColor] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [linhas, setLinhas] = useState<QuoteItem[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const topoRef = useRef<HTMLDivElement>(null);

  // Linhas deste modelo que já estão no orçamento (todas as cores e tamanhos).
  useEffect(() => {
    const carregar = () =>
      setLinhas(getQuoteItems().filter((i) => i.productId.startsWith(productId + "__")));
    carregar();
    window.addEventListener("compass-brindes-quote-updated", carregar);
    return () => window.removeEventListener("compass-brindes-quote-updated", carregar);
  }, [productId]);

  const total = linhas.reduce((acc, i) => acc + i.quantity, 0);
  const faltam = Math.max(0, minimo - total);
  const atingiu = total >= minimo;
  const pronto = Boolean(color && size && quantity >= 1);

  // Sugere na quantidade o que falta para o mínimo (ou 1, se já atingiu).
  useEffect(() => {
    setQuantity(faltam > 0 ? faltam : 1);
  }, [faltam]);

  function adicionar() {
    if (!color || !size || quantity < 1) return;
    const label = color + ", tam. " + size;
    addQuoteItem(
      {
        productId: productId + "__" + slug(color) + "__" + slug(size),
        name: name + " — " + label,
        supplierName,
        slug: productSlug,
        groupId: productId,
        groupName: name,
        groupMin: minimo > 1 ? minimo : undefined,
      },
      quantity
    );
    setAviso(quantity + (quantity === 1 ? " peça adicionada: " : " peças adicionadas: ") + label);
    setSize(null);
  }

  function adicionarMais() {
    setAviso(null);
    topoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const porcentagem = minimo > 1 ? Math.min(100, Math.round((total / minimo) * 100)) : 100;

  return (
    <div className="apparel" ref={topoRef}>
      {minimo > 1 && (
        <div className={"apparel__progress" + (atingiu ? " is-done" : "")}>
          <div className="apparel__progress-text">
            {atingiu ? (
              <strong>Pedido mínimo atingido ✓ ({total} peças)</strong>
            ) : (
              <>
                <strong>
                  {total} de {minimo} peças
                </strong>{" "}
                · faltam {faltam} para o pedido mínimo
              </>
            )}
          </div>
          <div
            className="apparel__progress-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={minimo}
            aria-valuenow={Math.min(total, minimo)}
          >
            <span style={{ width: porcentagem + "%" }} />
          </div>
          <p className="apparel__hint" style={{ margin: "6px 0 0" }}>
            Misture cores e tamanhos à vontade: o mínimo vale para o modelo inteiro.
          </p>
        </div>
      )}

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

      <div className="apparel__group">
        <p className="apparel__label">Quantidade</p>
        <div className="qty-stepper">
          <button
            type="button"
            aria-label="Diminuir"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          >
            −
          </button>
          <input
            aria-label="Quantidade"
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
          <button type="button" aria-label="Aumentar" onClick={() => setQuantity((q) => q + 1)}>
            +
          </button>
          <button type="button" className="qty-quick" onClick={() => setQuantity((q) => q + 5)}>
            +5
          </button>
          <button type="button" className="qty-quick" onClick={() => setQuantity((q) => q + 10)}>
            +10
          </button>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary apparel__add"
        disabled={!pronto}
        style={!pronto ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
        onClick={adicionar}
      >
        Adicionar ao orçamento
      </button>
      {!pronto && <p className="apparel__hint">Escolha a cor e o tamanho para adicionar.</p>}

      {aviso && (
        <div className="apparel__toast" role="status">
          <span>✓ {aviso}</span>
          {!atingiu && (
            <button type="button" className="btn btn-outline" onClick={adicionarMais}>
              Adicionar mais peças
            </button>
          )}
        </div>
      )}

      {linhas.length > 0 && (
        <div className="apparel__cart">
          <p className="apparel__label" style={{ marginBottom: 6 }}>
            Deste modelo no seu orçamento
          </p>
          <ul>
            {linhas.map((l) => (
              <li key={l.productId}>
                <span>{l.name.replace(name + " — ", "")}</span>
                <span className="apparel__cart-qty">{l.quantity} un.</span>
                <button
                  type="button"
                  className="apparel__cart-remove"
                  aria-label={"Remover " + l.name}
                  onClick={() => removeQuoteItem(l.productId)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="apparel__cart-actions">
            {atingiu ? (
              <Link className="btn btn-primary" href="/orcamento">
                Finalizar orçamento
              </Link>
            ) : (
              <button type="button" className="btn btn-primary" onClick={adicionarMais}>
                Adicionar mais peças ({faltam} faltando)
              </button>
            )}
            <Link className="btn btn-outline" href="/produtos">
              Continuar comprando
            </Link>
          </div>
        </div>
      )}

      <p className="apparel__hint" style={{ marginTop: 14 }}>
        Prazo e personalização sob consulta.
      </p>
    </div>
  );
}
