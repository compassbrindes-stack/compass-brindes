import type { Product, SupplierConnector, SupplierSyncResult } from "@/lib/types";
import { mockItemToProduct, type MockSupplierItem } from "@/lib/suppliers/shared";
import mockData from "@/data/catalogo-app.json";

const SUPPLIER_NAME = "Compass Brindes (catálogo próprio)";

// Catálogo próprio da Compass, extraído de catalogoapp.mobi/compassbrindes.
// Não depende de credenciais de fornecedor externo: os produtos, categorias
// e descrições ficam em data/catalogo-app.json (sem valores/preços).

function isConfigured(): boolean {
  return true;
}

async function fetchProducts(): Promise<{ products: Product[]; result: SupplierSyncResult }> {
  const products = (mockData as MockSupplierItem[]).map((item) =>
    mockItemToProduct(item, "compassapp", SUPPLIER_NAME)
  );

  return {
    products,
    result: {
      supplier: "compassapp",
      ok: true,
      mode: "mock",
      productCount: products.length,
    },
  };
}

export const compassappConnector: SupplierConnector = {
  id: "compassapp",
  name: SUPPLIER_NAME,
  isConfigured,
  fetchProducts,
};
