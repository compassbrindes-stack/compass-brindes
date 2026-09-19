// Formato único de produto usado pelo site, independente do fornecedor de origem.
// Cada conector (lib/suppliers/*.ts) é responsável por traduzir o retorno
// da API do fornecedor para este formato.

export type SupplierId = "xbz" | "asia" | "spot";

export interface ProductVariant {
  sku: string;
  color?: string;
  size?: string;
  stock?: number;
}

export interface Product {
  /** Identificador único no site: `${supplier}-${supplierSku}` */
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
  /** Preço de referência ("a partir de"), quando o fornecedor informa. */
  priceFrom?: number;
  material?: string;
  updatedAt: string; // ISO 8601
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
  /** true quando as credenciais reais (token/CNPJ/etc.) estão configuradas. */
  isConfigured: () => boolean;
  /** Busca e normaliza os produtos. Usa dados de exemplo se não configurado. */
  fetchProducts: () => Promise<{ products: Product[]; result: SupplierSyncResult }>;
}
