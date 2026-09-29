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

/** Linha de vestuário: cores com amostra, tamanhos e tabela de medidas opcional. */
export interface ApparelColor {
  name: string;
  hex: string;
}

export interface ApparelSizeChart {
  columns: string[];
  rows: { size: string; values: string[] }[];
  note?: string;
}

export interface ApparelInfo {
  tipo?: string;
  /** Divide a aba Vestuário em Masculino e Feminino. */
  genero?: "Masculino" | "Feminino";
  colors: ApparelColor[];
  sizes: string[];
  sizeChart?: ApparelSizeChart;
}

export interface Product {
  id: string;
  supplier: SupplierId;
  supplierName: string;
  supplierSku: string;
  name: string;
  slug: string;
  category: string;
  /** Outras abas em que o produto também aparece (ex.: canivetes também em Agro). */
  extraCategories?: string[];
  /** Sub-aba dentro da categoria (ex.: Térmicos → Copos, Canecas, Garrafas). */
  subcategory?: string;
  description?: string;
  images: string[];
  variants: ProductVariant[];
  minQuantity?: number;
  priceFrom?: number;
  material?: string;
  /** Código do produto no site do fornecedor (ex.: código XBZ), para referência/pedido. */
  supplierCode?: string;
  /** Presente apenas nos itens de vestuário (camisetas, babylooks...). */
  apparel?: ApparelInfo;
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
