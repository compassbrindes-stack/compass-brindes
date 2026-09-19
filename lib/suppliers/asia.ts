import type { Product, SupplierConnector, SupplierSyncResult } from "@/lib/types";
import { checkBusinessHours } from "@/lib/business-hours";
import { mockItemToProduct, type MockSupplierItem } from "@/lib/suppliers/shared";
import mockData from "@/data/sample-asia.json";

const SUPPLIER_NAME = "Asia Import";

// TODO: confirmar com a Asia Import o endpoint e a autenticação da API de
// revenda (o site tem login de "Gestor da Conta") e preencher no .env:
//   ASIA_API_BASE_URL, ASIA_API_TOKEN

function isConfigured(): boolean {
  return Boolean(process.env.ASIA_API_BASE_URL && process.env.ASIA_API_TOKEN);
}

async function fetchFromApi(): Promise<Product[]> {
  const baseUrl = process.env.ASIA_API_BASE_URL;
  const token = process.env.ASIA_API_TOKEN;

  const response = await fetch(`${baseUrl}/produtos`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Asia Import respondeu ${response.status}`);
  }

  const raw = (await response.json()) as unknown;
  // TODO: mapear o formato real de retorno da Asia Import.
  const items = Array.isArray(raw) ? (raw as MockSupplierItem[]) : [];
  return items.map((item) => mockItemToProduct(item, "asia", SUPPLIER_NAME));
}

async function fetchProducts(): Promise<{ products: Product[]; result: SupplierSyncResult }> {
  if (!isConfigured()) {
    const products = (mockData as MockSupplierItem[]).map((item) =>
      mockItemToProduct(item, "asia", SUPPLIER_NAME)
    );
    return {
      products,
      result: {
        supplier: "asia",
        ok: true,
        mode: "mock",
        productCount: products.length,
        error: "Credenciais da Asia Import ainda não configuradas — usando produtos de exemplo.",
      },
    };
  }

  const { isBusinessHours } = checkBusinessHours();
  if (!isBusinessHours) {
    return {
      products: [],
      result: {
        supplier: "asia",
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
      result: { supplier: "asia", ok: true, mode: "api", productCount: products.length },
    };
  } catch (error) {
    return {
      products: [],
      result: {
        supplier: "asia",
        ok: false,
        mode: "api",
        productCount: 0,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      },
    };
  }
}

export const asiaConnector: SupplierConnector = {
  id: "asia",
  name: SUPPLIER_NAME,
  isConfigured,
  fetchProducts,
};
