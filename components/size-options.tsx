"use client";

import { useState } from "react";
import type { SizeOption } from "@/lib/types";
import { slugify } from "@/lib/suppliers/shared";
import { AddToQuote } from "@/components/add-to-quote";
import { ProductGallery } from "@/components/product-gallery";

// Página de produto com tamanhos (ex.: copo 350ml / 500ml): ao trocar o
// tamanho, mudam as fotos, a descrição com medidas, o código e as cores.
export function SizedProduct({
  productId,
  name,
  supplierName,
  slug,
  description,
  images,
  sizes,
  minQuantity,
}: {
  productId: string;
  name: string;
  supplierName: string;
  slug: string;
  description?: string;
  images: string[];
  sizes: SizeOption[];
  minQuantity?: number;
}) {
  const [index, setIndex] = useState(0);
  const size = sizes[index] ?? sizes[0];
  const fotos = size.images?.length ? size.images : images;

  return (
    <>
      <div>
        <ProductGallery key={size.code} images={fotos} alt={`${name} ${size.label}`} />
      </div>
      <div>
        <span className="badge">{supplierName}</span>
        <h1>{name}</h1>

        <div style={{ margin: "4px 0 14px" }}>
          <p style={{ fontWeight: 700, margin: "0 0 8px" }}>Tamanho</p>
          <div className="apparel__sizes" role="radiogroup" aria-label="Tamanho">
            {sizes.map((s, i) => (
              <button
                key={s.code}
                type="button"
                role="radio"
                aria-checked={i === index}
                className={"apparel__size" + (i === index ? " is-active" : "")}
                onClick={() => setIndex(i)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <p>{size.description ?? description}</p>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#16a34a", margin: "0 0 12px" }}>
          Código: {size.code}
        </p>

        {size.colors && size.colors.length > 0 && (
          <div className="variant-swatches">
            {size.colors.map((c) => (
              <span key={c} className="variant-swatch">
                {c}
              </span>
            ))}
          </div>
        )}

        <p>
          Preço sob consulta
          {minQuantity ? ` · pedido mínimo de ${minQuantity} unidades` : ""}
        </p>

        <AddToQuote
          key={size.code}
          productId={`${productId}__${slugify(size.label)}`}
          name={`${name.replace(/\s*\d+\s*ml\s*e\s*\d+\s*ml/i, "").trim()} ${size.label.replace(" ", "")} (${size.code})`}
          supplierName={supplierName}
          slug={slug}
          minQuantity={minQuantity}
        />
      </div>
    </>
  );
}
