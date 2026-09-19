import { cache } from "react";
import type { Product, SupplierSyncResult } from "@/lib/types";
import { connectors } from "@/lib/suppliers";

export interface CatalogSnapshot {
  products: Product[];
  results: SupplierSyncResult[];
}

/**
 * Busca os produtos de todos os fornecedores configurados (ou os produtos de
 * exemplo, para quem ainda não tem credenciais) e devolve um catálogo único.
 * `cache()` evita repetir a busca várias vezes na mesma renderização.
 */
export const getCatalog = cache(async (): Promise<CatalogSnapshot> => {
  const settled = await Promise.all(connectors.map((connector) => connector.fetchProducts()));

  const products = settled.flatMap((s) => s.products);
  const results = settled.map((s) => s.result);

  return { products, results };
});

export async function getAllProducts(): Promise<Product[]> {
  const { products } = await getCatalog();
  return products;
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  const products = await getAllProducts();
  return products.find((p) => p.slug === slug);
}

export async function getCategories(): Promise<string[]> {
  const products = await getAllProducts();
  return Array.from(new Set(products.map((p) => p.category))).sort();
}

export async function getProductsByCategory(category: string): Promise<Product[]> {
  const products = await getAllProducts();
  return products.filter((p) => p.category === category);
}
