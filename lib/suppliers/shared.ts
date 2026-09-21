import type { Product, ProductVariant, SupplierId } from "@/lib/types";

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Formato dos arquivos data/sample-*.json usados enquanto não há credenciais. */
export interface MockSupplierItem {
  sku: string;
  name: string;
  category: string;
  description?: string;
  images: string[];
  colors?: string[];
  minQuantity?: number;
  priceFrom?: number;
  /** Código do produto no site do fornecedor (ex.: código XBZ), para referência/pedido. */
  supplierCode?: string;
}

export function mockItemToProduct(
  item: MockSupplierItem,
  supplier: SupplierId,
  supplierName: string
): Product {
  const variants: ProductVariant[] = (item.colors ?? [undefined]).map((color) => ({
    sku: color ? `${item.sku}-${slugify(color)}` : item.sku,
    color,
  }));

  return {
    id: `${supplier}-${item.sku}`,
    supplier,
    supplierName,
    supplierSku: item.sku,
    name: item.name,
    slug: `${slugify(item.name)}-${slugify(item.sku)}`,
    category: item.category,
    description: item.description,
    images: item.images,
    variants,
    minQuantity: item.minQuantity,
    priceFrom: item.priceFrom,
    material: undefined,
    supplierCode: item.supplierCode,
    updatedAt: new Date().toISOString(),
  };
}
