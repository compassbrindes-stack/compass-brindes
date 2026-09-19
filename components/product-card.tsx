import Link from "next/link";
import type { Product } from "@/lib/types";

function formatPrice(value?: number) {
  if (!value) return "Sob consulta";
  return `A partir de ${value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
}

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link className="product-card" href={`/produtos/${product.slug}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={product.images[0]} alt={product.name} loading="lazy" />
      <div className="product-card__body">
        <span className="product-card__supplier">{product.supplierName}</span>
        <span className="product-card__name">{product.name}</span>
        <span className="product-card__price">{formatPrice(product.priceFrom)}</span>
      </div>
    </Link>
  );
}
