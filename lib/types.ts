// Formato único de produto usado pelo site, independente do fornecedor de origem.
// Cada conector (lib/suppliers/*.ts) é responsável por traduzir o retorno
// da API do fornecedor para este formato.

export type SupplierId = "xbz" | "asia" | "spot" | "compassapp";

export interface ProductVariant {
  sku: string;
  color?: string;
  size?: string;
  stock?: number;
}

export interface Product {
  id: string;
  supplier: SupplierId;
  supplierName: string;
  supplierSku: string;
  name: string;
  slug: string;
  category: string;
  description?: string;
  images: string[];
  variants: ProductVariant[];
  minQuantity?: number;
  priceFrom?: number;
  material?: string;
  /** Código do produto no site do fornecedor (ex.: código XBZ), para referência/pedido. */
  supplierCode?: string;
  updatedAt: string;
}

export interface SupplierSyncResult {
  supplier: SupplierId;
  ok: boolean;
  mode: "api" | "mock";
  productCount: number;
  error?: string;
}

export interface SupplierConnector {
  id: SupplierId;
  name: string;
  isConfigured: () => boolean;
  fetchProducts: () => Promise<{ products: Product[]; result: SupplierSyncResult }>;
}
