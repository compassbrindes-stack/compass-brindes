// Registro de quem baixou o catálogo em PDF, usando o mesmo banco Redis
// (Upstash) já configurado para os pedidos. Funciona apenas no servidor.

const CHAVE_LISTA = "compass:catalogo:leads";

export interface CatalogLeadInput {
  nome: string;
  sobrenome: string;
  empresa: string;
  email: string;
  telefone: string;
}

export interface CatalogLead extends CatalogLeadInput {
  id: string;
  createdAt: string;
}

async function redisCommand<T = unknown>(command: (string | number)[]): Promise<T> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Banco de dados não configurado (KV_REST_API_URL / KV_REST_API_TOKEN ausentes)."
    );
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(String(data.error));
  }
  return data.result as T;
}

export async function saveCatalogLead(input: CatalogLeadInput): Promise<CatalogLead> {
  const lead: CatalogLead = {
    id: `LEAD${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...input,
  };

  await redisCommand(["RPUSH", CHAVE_LISTA, JSON.stringify(lead)]);

  return lead;
}

// Lista todos os leads salvos, mais recentes primeiro. Usado apenas pela
// página/rota de administração (protegida por LEADS_ADMIN_SECRET).
export async function listCatalogLeads(): Promise<CatalogLead[]> {
  const raw = await redisCommand<string[]>(["LRANGE", CHAVE_LISTA, 0, -1]);

  const leads = (raw ?? [])
    .map((item) => {
      try {
        return JSON.parse(item) as CatalogLead;
      } catch {
        return null;
      }
    })
    .filter((lead): lead is CatalogLead => lead !== null);

  return leads.reverse();
}
