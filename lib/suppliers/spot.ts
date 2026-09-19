import type { Product, SupplierConnector, SupplierSyncResult } from "@/lib/types";
import { checkBusinessHours } from "@/lib/business-hours";
import { mockItemToProduct, type MockSupplierItem } from "@/lib/suppliers/shared";
import mockData from "@/data/sample-spot.json";

const SUPPLIER_NAME = "Spot Gifts";

// TODO: a Spot exige cadastro/login de revendedor (área reservada). Depois de
// aprovados, preencher no .env:
//   SPOT_API_BASE_URL, SPOT_API_TOKEN

function isConfigured(): boolean {
  return Boolean(process.env.SPOT_API_BASE_URL && process.env.SPOT_API_TOKEN);
}

async function fetchFromApi(): Promise<Product[]> {
  const baseUrl = process.env.SPOT_API_BASE_URL;
  const token = process.env.SPOT_API_TOKEN;

  const response = await fetch(`${baseUrl}/produtos`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Spot Gifts respondeu ${response.status}`);
  }

  const raw = (await response.json()) as unknown;
  // TODO: mapear o formato real de retorno da Spot Gifts.
  const items = Array.isArray(raw) ? (raw as MockSupplierItem[]) : [];
  return items.map((item) => mockItemToProduct(item, "spot", SUPPLIER_NAME));
}

async function fetchProducts(): Promise<{ products: Product[]; result: SupplierSyncResult }> {
  if (!isConfigured()) {
    const products = (mockData as MockSupplierItem[]).map((item) =>
      mockItemToProduct(item, "spot", SUPPLIER_NAME)
    );
    return {
      products,
      result: {
        supplier: "spot",
        ok: true,
        mode: "mock",
        productCount: products.length,
        error: "Credenciais da Spot Gifts ainda não configuradas — usando produtos de exemplo.",
      },
    };
  }

  const { isBusinessHours } = checkBusinessHours();
  if (!isBusinessHours) {
    return {
      products: [],
      result: {
        supplier: "spot",
        ok: false,
        mode: "api",
        productCount: 0,
        error: "Fora do horário comercial (seg–sex, 08h–18h) — sincronização adiada.",
      },
    };
  }

  try {
    const products = await fetchFromApi();
    return {
      products,
      result: { supplier: "spot", ok: true, mode: "api", productCount: products.length },
    };
  } catch (error) {
    return {
      products: [],
      result: {
        supplier: "spot",
        ok: false,
        mode: "api",
        productCount: 0,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      },
    };
  }
}

export const spotConnector: SupplierConnector = {
  id: "spot",
  name: SUPPLIER_NAME,
  isConfigured,
  fetchProducts,
};
