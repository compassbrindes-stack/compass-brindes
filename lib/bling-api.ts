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
  // renova uma vez só: o Bling troca o refresh token a cada renovação,
  // então mensagens que chegam juntas esperam a primeira terminar
  const trava = await redis<string | null>(["SET", "compass:bling:renovando", "1", "NX", "EX", 30]);
  if (trava === "OK") {
    try {
      const novo = await pedirToken({ grant_type: "refresh_token", refresh_token: t.refresh_token });
      return novo.access_token;
    } catch (e) {
      // outra execução pode ter renovado antes
      const depois = await redisGetJSON<Tokens>(CHAVE_TOKENS);
      if (depois && depois.refresh_token !== t.refresh_token) return depois.access_token;
      throw e;
    } finally {
      await redis(["DEL", "compass:bling:renovando"]).catch(() => {});
    }
  }
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 750));
    const d = await redisGetJSON<Tokens>(CHAVE_TOKENS);
    if (d && d.expira - Date.now() > 5 * 60_000) return d.access_token;
  }
  throw new Error("a renovação da autorização do Bling demorou; tente de novo em instantes");
}

export async function blingConectado(): Promise<{ conectado: boolean; expira?: string }> {
  const t = await redisGetJSON<Tokens>(CHAVE_TOKENS);
  return t ? { conectado: true, expira: new Date(t.expira).toISOString() } : { conectado: false };
}

export async function bling<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await tokenValido();
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // o Bling aceita 3 requisições por segundo: espaça as chamadas e repete quando vier 429
  let res: Response = new Response(null, { status: 429 });
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    await espera(tentativa ? 1200 * tentativa : 350);
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json", ...(init.headers || {}) },
      cache: "no-store",
    });
    if (res.status !== 429) break;
  }
  const txt = await res.text();
  const data = txt ? JSON.parse(txt) : {};
  if (!res.ok) {
    const msg = data?.error?.description || data?.error?.message || res.statusText;
    throw new Error(`Bling ${res.status} em ${(init.method || "GET")} ${path.split("?")[0].replace(/\/\d{5,}/g, "/{id}")}: ${msg}`);
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
/** Todas as contas a receber em aberto (ou parciais) dos últimos 360 dias. */
export async function contasReceberAbertas(): Promise<ContaReceber[]> {
  const hoje = new Date();
  const ini = new Date(hoje.getTime() - 360 * 86400000).toISOString().slice(0, 10);
  const fim = new Date(hoje.getTime() + 2 * 86400000).toISOString().slice(0, 10);
  const todas: ContaReceber[] = [];
  for (let pagina = 1; pagina <= 5; pagina++) {
    const q = `?pagina=${pagina}&limite=100&situacoes[]=1&situacoes[]=3&tipoFiltroData=E&dataInicial=${ini}&dataFinal=${fim}`;
    const r = await bling<{ data: ContaReceber[] }>(`/contas/receber${q}`);
    todas.push(...(r.data || []));
    if (!r.data || r.data.length < 100) break;
  }
  return todas;
}

export async function contasDoPedido(numeroPedido: string): Promise<ContaReceber[]> {
  const hoje = new Date();
  const ini = new Date(hoje.getTime() - 360 * 86400000).toISOString().slice(0, 10);
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

/** Categoria de receita ativa do Bling para baixas sem categoria: prefere a de vendas. Guardada no Redis por 1 dia. */
async function categoriaReceitaPadrao(): Promise<number> {
  const CHAVE = "compass:bling:categoria-receita";
  const salva = Number(await redis<string | null>(["GET", CHAVE]));
  if (salva) return salva;
  const r = await bling<{ data: { id: number; descricao: string; tipo?: number }[] }>(`/categorias/receitas-despesas?tipo=2&situacao=1&limite=100`);
  const lista = r.data || [];
  const escolhida =
    lista.find((c) => /venda/i.test(c.descricao) && !/devolu/i.test(c.descricao)) ||
    lista.find((c) => /receita|recebimento|servi/i.test(c.descricao)) ||
    lista[0];
  if (!escolhida) return 0;
  await redis(["SET", CHAVE, String(escolhida.id), "EX", 86400]);
  return escolhida.id;
}

/** Dá baixa numa conta a receber usando a conta financeira e a categoria já cadastradas nela. */
export async function baixarConta(conta: ContaReceber, valor: number, data: string, historico: string) {
  const det = await bling<{ data: any }>(`/contas/receber/${conta.id}`);
  const d = det.data || {};
  const portador = d.portador?.id || conta.contaContabil?.id || Number(process.env.BLING_PORTADOR_ID) || 0;
  const categoria = d.categoria?.id || Number(process.env.BLING_CATEGORIA_RECEITA_ID) || (await categoriaReceitaPadrao());
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

// ---------------------------------------------------------------- contas a pagar

export interface ContaPagar {
  id: number;
  situacao: number; // 1 aberto, 2 pago
  vencimento: string;
  valor: number;
  contato?: { id: number; nome?: string };
  historico?: string;
  numeroDocumento?: string;
}

/** Conta financeira padrão para baixas de contas a pagar ("Caixa" da Compass, ou BLING_PORTADOR_ID). */
const PORTADOR_PADRAO = () => Number(process.env.BLING_PORTADOR_ID) || 14891685159;

/** Contas a pagar em aberto com vencimento entre 120 dias atrás e 120 dias à frente. */
export async function contasPagarAbertas(): Promise<ContaPagar[]> {
  const hoje = Date.now();
  const ini = new Date(hoje - 120 * 86400000).toISOString().slice(0, 10);
  const fim = new Date(hoje + 120 * 86400000).toISOString().slice(0, 10);
  const todas: ContaPagar[] = [];
  for (let pagina = 1; pagina <= 5; pagina++) {
    const r = await bling<{ data: ContaPagar[] }>(`/contas/pagar?pagina=${pagina}&limite=100&situacao=1&dataVencimentoInicial=${ini}&dataVencimentoFinal=${fim}`);
    todas.push(...(r.data || []));
    if (!r.data || r.data.length < 100) break;
  }
  return todas.filter((c) => c.situacao === 1 || c.situacao === 3);
}

export async function detalheContaPagar(id: number): Promise<any> {
  return (await bling<{ data: any }>(`/contas/pagar/${id}`)).data || {};
}

export async function nomeContato(id: number): Promise<string> {
  try {
    const d = (await bling<{ data: any }>(`/contatos/${id}`)).data || {};
    return [d.nome, d.fantasia].filter(Boolean).join(" / ");
  } catch {
    return "";
  }
}

/** Categoria de despesa do Bling que combina com o texto (frete, internet, telefone, sistema…). Cache de 1 dia. */
export async function categoriaDespesa(texto: string): Promise<number> {
  const CHAVE = "compass:bling:categorias-despesa";
  let lista: { id: number; descricao: string }[] | null = null;
  const salvo = await redis<string | null>(["GET", CHAVE]);
  if (salvo) {
    try {
      lista = JSON.parse(salvo);
    } catch {
      lista = null;
    }
  }
  if (!lista) {
    const r = await bling<{ data: { id: number; descricao: string }[] }>(`/categorias/receitas-despesas?tipo=1&situacao=1&limite=100`);
    lista = (r.data || []).map((c) => ({ id: c.id, descricao: c.descricao }));
    await redis(["SET", CHAVE, JSON.stringify(lista), "EX", 86400]);
  }
  const t = (texto || "").toLowerCase();
  const grupos: [RegExp, RegExp][] = [
    [/frete|transport|ct-?e|s[aã]o miguel|ouro e prata|viopex|braspress|correio/, /frete|transport/],
    [/internet|provedor|tch[eê]turbo/, /internet|telecom|comunica/],
    [/telefone|celular|m[oó]vel|linha/, /telefone|telecom|comunica/],
    [/bling|uazapi|sistema|software|assinatura|whatsapp/, /sistema|software|tecnologia|assinatura/],
    [/t[aá]xi|uber|combust|gasolina|ped[aá]gio/, /transporte|combust|viagem|deslocamento/],
    [/fornecedor|mercadoria|produto|brinde|compra/, /compra|mercadoria|fornecedor|custo/],
    [/aluguel/, /aluguel/],
    [/energia|luz|[aá]gua/, /energia|[aá]gua|utilidade/],
  ];
  for (const [quando, cat] of grupos) {
    if (quando.test(t)) {
      const c = lista.find((x) => cat.test(x.descricao.toLowerCase()));
      if (c) return c.id;
    }
  }
  const geral = lista.find((x) => /despesa|geral|outras/i.test(x.descricao)) || lista[0];
  return geral ? geral.id : 0;
}

export async function baixarContaPagar(conta: ContaPagar, valor: number, data: string, historico: string, textoCategoria: string, categoriaId?: number) {
  const d = await detalheContaPagar(conta.id);
  const portador = d.portador?.id || PORTADOR_PADRAO();
  const categoria = d.categoria?.id || categoriaId || (await categoriaDespesa(`${textoCategoria} ${String(d.historico || "").replace(/whatsapp|compass recibos/gi, "")}`));
  if (!categoria) throw new Error("não encontrei categoria de despesa no Bling");
  await bling(`/contas/pagar/${conta.id}/baixar`, {
    method: "POST",
    body: JSON.stringify({ data, usarDataVencimento: false, portador: { id: portador }, categoria: { id: categoria }, historico, valorRecebido: valor }),
  });
}

/** Procura o contato pelo CNPJ/CPF ou nome; se não existir, cria como fornecedor. */
export async function contatoFornecedor(nome: string, doc?: string): Promise<number> {
  const digitos = (doc || "").replace(/\D/g, "");
  if (digitos.length === 11 || digitos.length === 14) {
    const r = await bling<{ data: { id: number }[] }>(`/contatos?numeroDocumento=${digitos}&limite=1`);
    if (r.data && r.data[0]) return r.data[0].id;
  }
  if (nome) {
    const r = await bling<{ data: { id: number; nome: string }[] }>(`/contatos?pesquisa=${encodeURIComponent(nome.slice(0, 40))}&limite=5`);
    if (r.data && r.data[0]) return r.data[0].id;
  }
  const novo = await bling<{ data: { id: number } }>(`/contatos`, {
    method: "POST",
    body: JSON.stringify({
      nome: (nome || "Fornecedor sem nome").toUpperCase().slice(0, 120),
      situacao: "A",
      tipo: digitos.length === 11 ? "F" : "J",
      ...(digitos.length === 11 || digitos.length === 14 ? { numeroDocumento: digitos } : {}),
    }),
  });
  return novo.data.id;
}

/** Lança uma despesa já paga (cria a conta a pagar e dá baixa). */
export async function lancarDespesaPaga(o: { contatoId: number; valor: number; data: string; historico: string; textoCategoria: string; documento?: string }) {
  const categoria = await categoriaDespesa(o.textoCategoria);
  const criada = await bling<{ data: { id: number } }>(`/contas/pagar`, {
    method: "POST",
    body: JSON.stringify({
      vencimento: o.data,
      competencia: o.data,
      dataEmissao: o.data,
      valor: o.valor,
      contato: { id: o.contatoId },
      historico: o.historico,
      numeroDocumento: o.documento || "Comprovante WhatsApp",
      ocorrencia: { tipo: "1" },
      ...(categoria ? { categoria: { id: categoria } } : {}),
    }),
  });
  const conta: ContaPagar = { id: criada.data.id, situacao: 1, vencimento: o.data, valor: o.valor };
  await baixarContaPagar(conta, o.valor, o.data, o.historico, o.textoCategoria, categoria || undefined);
  return criada.data.id;
}
