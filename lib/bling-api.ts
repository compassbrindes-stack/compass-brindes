// Cliente da API v3 do Bling usado pelo servidor do site.
//
// A autorização é OAuth2: a Compass cria um aplicativo no Bling (Central de
// Extensões → Área do integrador) e coloca BLING_CLIENT_ID e
// BLING_CLIENT_SECRET nas variáveis de ambiente da Vercel. Depois abre
// /api/bling/conectar?key=<LEADS_ADMIN_SECRET> uma vez e autoriza. Os tokens
// ficam no Redis e são renovados sozinhos. Nada disso aparece no código.

import { redis, redisGetJSON, redisSetJSON } from "@/lib/redis";

const API = "https://api.bling.com.br/Api/v3";
const OAUTH = "https://www.bling.com.br/Api/v3/oauth";
const CHAVE_TOKENS = "compass:bling:tokens";
const CHAVE_STATE = "compass:bling:state";

interface Tokens {
  access_token: string;
  refresh_token: string;
  expira: number; // epoch ms
}

function credenciais() {
  const id = process.env.BLING_CLIENT_ID;
  const secret = process.env.BLING_CLIENT_SECRET;
  if (!id || !secret) throw new Error("BLING_CLIENT_ID / BLING_CLIENT_SECRET não configurados na Vercel.");
  return { id, secret, basic: Buffer.from(`${id}:${secret}`).toString("base64") };
}

export async function urlAutorizacao(): Promise<string> {
  const { id } = credenciais();
  const state = crypto.randomUUID();
  await redis(["SET", CHAVE_STATE, state, "EX", 900]);
  return `${OAUTH}/authorize?response_type=code&client_id=${encodeURIComponent(id)}&state=${state}`;
}

async function pedirToken(body: Record<string, string>): Promise<Tokens> {
  const { basic } = credenciais();
  const res = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "1.0",
    },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Bling recusou o token (${res.status}): ${data?.error?.description || data?.error?.message || data?.error || "sem detalhe"}`);
  }
  const t: Tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expira: Date.now() + (Number(data.expires_in) || 21600) * 1000,
  };
  await redisSetJSON(CHAVE_TOKENS, t);
  return t;
}

export async function concluirAutorizacao(code: string, state: string) {
  const esperado = await redis<string | null>(["GET", CHAVE_STATE]);
  if (!esperado || esperado !== state) throw new Error("Link de autorização expirado. Abra /api/bling/conectar de novo.");
  await redis(["DEL", CHAVE_STATE]);
  await pedirToken({ grant_type: "authorization_code", code });
}

async function tokenValido(): Promise<string> {
  const t = await redisGetJSON<Tokens>(CHAVE_TOKENS);
  if (!t) throw new Error("Bling não conectado no servidor. Abra /api/bling/conectar.");
  if (t.expira - Date.now() > 5 * 60_000) return t.access_token;
  const novo = await pedirToken({ grant_type: "refresh_token", refresh_token: t.refresh_token });
  return novo.access_token;
}

export async function blingConectado(): Promise<{ conectado: boolean; expira?: string }> {
  const t = await redisGetJSON<Tokens>(CHAVE_TOKENS);
  return t ? { conectado: true, expira: new Date(t.expira).toISOString() } : { conectado: false };
}

export async function bling<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await tokenValido();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json", ...(init.headers || {}) },
    cache: "no-store",
  });
  const txt = await res.text();
  const data = txt ? JSON.parse(txt) : {};
  if (!res.ok) {
    const msg = data?.error?.description || data?.error?.message || res.statusText;
    throw new Error(`Bling ${res.status}: ${msg}`);
  }
  return data as T;
}

export interface ContaReceber {
  id: number;
  situacao: number; // 1 aberto, 2 pago, 3 parcial
  vencimento: string;
  valor: number;
  contato?: { id: number; nome: string };
  origem?: { id: number; numero: string; tipoOrigem: string };
  contaContabil?: { id: number; descricao: string };
}

/** Contas a receber em aberto (ou parciais) de um pedido de venda, pelo número do pedido. */
export async function contasDoPedido(numeroPedido: string): Promise<ContaReceber[]> {
  const hoje = new Date();
  const ini = new Date(hoje.getTime() - 365 * 86400000).toISOString().slice(0, 10);
  const fim = new Date(hoje.getTime() + 2 * 86400000).toISOString().slice(0, 10);
  const todas: ContaReceber[] = [];
  for (let pagina = 1; pagina <= 5; pagina++) {
    const q = `?pagina=${pagina}&limite=100&situacoes[]=1&situacoes[]=3&tipoFiltroData=E&dataInicial=${ini}&dataFinal=${fim}`;
    const r = await bling<{ data: ContaReceber[] }>(`/contas/receber${q}`);
    todas.push(...(r.data || []));
    if (!r.data || r.data.length < 100) break;
  }
  return todas
    .filter((c) => c.origem && c.origem.tipoOrigem === "venda" && String(c.origem.numero) === String(numeroPedido))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

/** Dá baixa numa conta a receber usando a conta financeira e a categoria já cadastradas nela. */
export async function baixarConta(conta: ContaReceber, valor: number, data: string, historico: string) {
  const det = await bling<{ data: any }>(`/contas/receber/${conta.id}`);
  const d = det.data || {};
  const portador = d.portador?.id || conta.contaContabil?.id || Number(process.env.BLING_PORTADOR_ID) || 0;
  const categoria = d.categoria?.id || Number(process.env.BLING_CATEGORIA_RECEITA_ID) || 0;
  if (!portador) throw new Error("A conta não tem conta financeira (portador) e BLING_PORTADOR_ID não está configurado.");
  if (!categoria) throw new Error("A conta não tem categoria e BLING_CATEGORIA_RECEITA_ID não está configurado.");
  await bling(`/contas/receber/${conta.id}/baixar`, {
    method: "POST",
    body: JSON.stringify({
      data,
      usarDataVencimento: false,
      portador: { id: portador },
      categoria: { id: categoria },
      historico,
      valorRecebido: valor,
    }),
  });
}
