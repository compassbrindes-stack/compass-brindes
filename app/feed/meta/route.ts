import { NextResponse } from "next/server";
import { getAllProducts } from "@/lib/products";

export const dynamic = "force-dynamic";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Feed de produtos no formato do Catálogo do Gerenciador de Comércio da Meta
 * (Facebook/Instagram Shopping). Cadastre esta URL como fonte de dados do
 * catálogo: https://<seu-dominio>/feed/meta
 *
 * Atenção: a Meta exige um preço numérico por produto. Como os produtos hoje
 * são "sob consulta", este feed usa o `priceFrom` de cada item; produtos sem
 * preço de referência ficam de fora do feed até terem um valor definido.
 */
export async function GET() {
  const products = await getAllProducts();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://catalogo-compass.vercel.app";

  const header = [
    "id",
    "title",
    "description",
    "availability",
    "condition",
    "price",
    "link",
    "image_link",
    "brand",
  ];

  const rows = products
    .filter((p) => Boolean(p.priceFrom))
    .map((p) =>
      [
        p.id,
        p.name,
        p.description ?? p.name,
        "in stock",
        "new",
        `${p.priceFrom!.toFixed(2)} BRL`,
        `${siteUrl}/produtos/${p.slug}`,
        p.images[0] ?? "",
        "Compass Brindes",
      ]
        .map((v) => csvEscape(String(v)))
        .join(",")
    );

  const csv = [header.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
