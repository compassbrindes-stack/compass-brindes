import type { ApparelInfo, Product, ProductVariant, SupplierId } from "@/lib/types";

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
  extraCategories?: string[];
  subcategory?: string;
  description?: string;
  images: string[];
  colors?: string[];
  minQuantity?: number;
  priceFrom?: number;
  /** Código do produto no site do fornecedor (ex.: código XBZ), para referência/pedido. */
  supplierCode?: string;
  apparel?: ApparelInfo;
}

// Tira o código (ex.: "C082B450") do nome exibido, já que ele aparece
// separado, depois da descrição. O endereço da página (slug) continua usando
// o nome original, para não quebrar links já compartilhados.
function nameWithoutCode(name: string, code?: string): string {
  if (!code) return name;
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cleaned = name
    .replace(new RegExp(`\\s*\\b${escaped}\\b`, "gi"), "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || name;
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
    name: nameWithoutCode(item.name, item.supplierCode),
    slug: `${slugify(item.name)}-${slugify(item.sku)}`,
    category: item.category,
    extraCategories: item.extraCategories,
    subcategory: item.subcategory,
    description: item.description,
    images: item.images,
    variants,
    minQuantity: item.minQuantity,
    priceFrom: item.priceFrom,
    material: undefined,
    supplierCode: item.supplierCode,
    apparel: item.apparel,
    updatedAt: new Date().toISOString(),
  };
}
