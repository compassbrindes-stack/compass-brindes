import type { Product, SupplierConnector, SupplierSyncResult } from "@/lib/types";
import { checkBusinessHours } from "@/lib/business-hours";
import { mockItemToProduct, type MockSupplierItem } from "@/lib/suppliers/shared";
import mockData from "@/data/sample-xbz.json";

const SUPPLIER_NAME = "XBZ Brindes";

// TODO: confirmar com a XBZ o formato exato da API de revenda (REST/XML,
// autenticação por token ou CNPJ) e preencher estas variáveis no .env:
//   XBZ_API_BASE_URL, XBZ_API_TOKEN
// A XBZ bloqueia acesso automatizado ao site institucional, então os dados
// de acesso precisam vir diretamente do time comercial deles.

function isConfigured(): boolean {
  return Boolean(process.env.XBZ_API_BASE_URL && process.env.XBZ_API_TOKEN);
}

async function fetchFromApi(): Promise<Product[]> {
  const baseUrl = process.env.XBZ_API_BASE_URL;
  const token = process.env.XBZ_API_TOKEN;

  // Estrutura de exemplo — ajustar assim que a XBZ enviar a documentação real.
  const response = await fetch(`${baseUrl}/produtos`, {
    headers: { Authorization: `Bearer ${token}` },
    // A API de fornecedores só deve ser chamada em horário comercial.
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`XBZ respondeu ${response.status}`);
  }

  const raw = (await response.json()) as unknown;
  // TODO: mapear o formato real de retorno da XBZ para MockSupplierItem/Product.
  const items = Array.isArray(raw) ? (raw as MockSupplierItem[]) : [];
  return items.map((item) => mockItemToProduct(item, "xbz", SUPPLIER_NAME));
}

async function fetchProducts(): Promise<{ products: Product[]; result: SupplierSyncResult }> {
  if (!isConfigured()) {
    const products = (mockData as MockSupplierItem[]).map((item) =>
      mockItemToProduct(item, "xbz", SUPPLIER_NAME)
    );
    return {
      products,
      result: {
        supplier: "xbz",
        ok: true,
        mode: "mock",
        productCount: products.length,
        error: "Credenciais da XBZ ainda não configuradas — usando produtos de exemplo.",
      },
    };
  }

  const { isBusinessHours } = checkBusinessHours();
  if (!isBusinessHours) {
    return {
      products: [],
      result: {
        supplier: "xbz",
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
      result: { supplier: "xbz", ok: true, mode: "api", productCount: products.length },
    };
  } catch (error) {
    return {
      products: [],
      result: {
        supplier: "xbz",
        ok: false,
        mode: "api",
        productCount: 0,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      },
    };
  }
}

export const xbzConnector: SupplierConnector = {
  id: "xbz",
  name: SUPPLIER_NAME,
  isConfigured,
  fetchProducts,
};
