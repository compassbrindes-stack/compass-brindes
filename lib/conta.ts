// Conta do cliente (cadastro opcional), usando o Supabase.
// Tudo roda no navegador, com a chave pública (anon) do Supabase e regras de
// segurança (RLS) no banco: cada cliente só enxerga e altera os próprios dados.
// Não usamos a biblioteca do Supabase para não adicionar dependências: são
// chamadas diretas à API REST.
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   NEXT_PUBLIC_SUPABASE_URL       ex.: https://xxxx.supabase.co
//   NEXT_PUBLIC_SUPABASE_ANON_KEY  chave "anon public" do projeto
// Sem elas, o site funciona normalmente e a área "Minha conta" fica desativada.

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const STORAGE_KEY = "compass-conta-sessao";
export const CONTA_EVENT = "compass-conta-atualizada";

export function contaConfigurada(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

export interface Sessao {
  access_token: string;
  refresh_token: string;
  expires_at: number; // segundos (epoch)
  user: { id: string; email: string };
}

export interface Cliente {
  id: string;
  email: string | null;
  nome: string | null;
  sobrenome: string | null;
  empresa: string | null;
  cnpj: string | null;
  telefone: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  cidade: string | null;
  estado: string | null;
  consentimento_lgpd: boolean;
  aceita_novidades: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface OrcamentoSalvo {
  id: string;
  numero_pedido: string | null;
  itens: { nome: string; quantidade: number; slug?: string }[];
  forma_pagamento: string | null;
  created_at: string;
}

// ---------- sessão (guardada no navegador) ----------

function lerSessao(): Sessao | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Sessao) : null;
  } catch {
    return null;
  }
}

function gravarSessao(s: Sessao | null) {
  try {
    if (s) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // navegador sem armazenamento: a pessoa só precisará entrar de novo
  }
  window.dispatchEvent(new Event(CONTA_EVENT));
}

function sessaoDaResposta(data: any): Sessao | null {
  if (!data?.access_token || !data?.user?.id) return null;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    user: { id: data.user.id, email: data.user.email ?? "" },
  };
}

function mensagemDeErro(data: any, padrao: string): string {
  const msg: string = data?.msg || data?.error_description || data?.message || data?.error || "";
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Este e-mail já tem conta. Use a opção Entrar.";
  if (m.includes("password should be at least") || m.includes("weak password"))
    return "Senha muito curta. Use pelo menos 8 caracteres.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
  if (m.includes("invalid") && m.includes("email")) return "E-mail inválido.";
  return msg ? `${padrao} (${msg})` : padrao;
}

async function authFetch(path: string, body: unknown, token?: string, method = "POST") {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export function sessaoAtual(): Sessao | null {
  if (typeof window === "undefined" || !contaConfigurada()) return null;
  return lerSessao();
}

// Devolve uma sessão válida, renovando o token se estiver para vencer.
export async function sessaoValida(): Promise<Sessao | null> {
  const s = sessaoAtual();
  if (!s) return null;
  const agora = Math.floor(Date.now() / 1000);
  if (s.expires_at - agora > 60) return s;
  const { ok, data } = await authFetch("token?grant_type=refresh_token", { refresh_token: s.refresh_token });
  const nova = ok ? sessaoDaResposta(data) : null;
  gravarSessao(nova);
  return nova;
}

export interface DadosCadastro {
  nome: string;
  sobrenome: string;
  empresa: string;
  cnpj: string;
  telefone: string;
  consentimento_lgpd: boolean;
  aceita_novidades: boolean;
}

export async function criarConta(email: string, senha: string, dados: DadosCadastro) {
  const { ok, data } = await authFetch("signup", { email, password: senha, data: dados });
  if (!ok) return { erro: mensagemDeErro(data, "Não foi possível criar a conta.") };
  const s = sessaoDaResposta(data);
  if (s) {
    gravarSessao(s);
    return { ok: true as const };
  }
  // Projeto com confirmação de e-mail ligada: a conta foi criada, mas precisa confirmar.
  return { confirmarEmail: true as const };
}

export async function entrar(email: string, senha: string) {
  const { ok, data } = await authFetch("token?grant_type=password", { email, password: senha });
  if (!ok) return { erro: mensagemDeErro(data, "Não foi possível entrar.") };
  const s = sessaoDaResposta(data);
  if (!s) return { erro: "Não foi possível entrar." };
  gravarSessao(s);
  return { ok: true as const };
}

export async function sair() {
  const s = sessaoAtual();
  if (s) await authFetch("logout", {}, s.access_token).catch(() => undefined);
  gravarSessao(null);
}

export async function pedirNovaSenha(email: string) {
  const redirect = `${window.location.origin}/conta`;
  const { ok, data } = await authFetch(`recover?redirect_to=${encodeURIComponent(redirect)}`, { email });
  if (!ok) return { erro: mensagemDeErro(data, "Não foi possível enviar o e-mail.") };
  return { ok: true as const };
}

// Link de "esqueci minha senha": o Supabase volta para /conta com os tokens no endereço.
export function lerRetornoDoEmail(): "recuperacao" | "login" | null {
  if (typeof window === "undefined") return null;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const access_token = hash.get("access_token");
  const refresh_token = hash.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  let user = { id: "", email: "" };
  try {
    const payload = JSON.parse(atob(access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    user = { id: payload.sub, email: payload.email ?? "" };
  } catch {
    return null;
  }
  const expires_at = Number(hash.get("expires_at")) || Math.floor(Date.now() / 1000) + Number(hash.get("expires_in") || 3600);
  gravarSessao({ access_token, refresh_token, expires_at, user });
  window.history.replaceState(null, "", window.location.pathname);
  return hash.get("type") === "recovery" ? "recuperacao" : "login";
}

export async function trocarSenha(novaSenha: string) {
  const s = await sessaoValida();
  if (!s) return { erro: "Sua sessão expirou. Entre novamente." };
  const { ok, data } = await authFetch("user", { password: novaSenha }, s.access_token, "PUT");
  if (!ok) return { erro: mensagemDeErro(data, "Não foi possível trocar a senha.") };
  return { ok: true as const };
}

// ---------- dados do cliente ----------

async function restFetch(
  path: string,
  opts: { token: string; method?: string; body?: string; headers?: Record<string, string> }
) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: opts.method ?? "GET",
    body: opts.body,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
}

export async function buscarCliente(): Promise<Cliente | null> {
  const s = await sessaoValida();
  if (!s) return null;
  const res = await restFetch(`clientes?select=*&id=eq.${s.user.id}`, { token: s.access_token });
  if (!res.ok) return null;
  const rows = (await res.json()) as Cliente[];
  return rows[0] ?? null;
}

export async function salvarCliente(dados: Partial<Omit<Cliente, "id">>) {
  const s = await sessaoValida();
  if (!s) return { erro: "Sua sessão expirou. Entre novamente." };
  const res = await restFetch("clientes", {
    token: s.access_token,
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ ...dados, id: s.user.id, email: s.user.email, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) return { erro: "Não foi possível salvar seus dados. Tente novamente." };
  window.dispatchEvent(new Event(CONTA_EVENT));
  return { ok: true as const };
}

export async function registrarOrcamento(o: {
  numero_pedido: string;
  itens: { nome: string; quantidade: number; slug?: string }[];
  forma_pagamento: string;
}) {
  const s = await sessaoValida();
  if (!s) return;
  await restFetch("orcamentos", {
    token: s.access_token,
    method: "POST",
    body: JSON.stringify({ ...o, cliente_id: s.user.id }),
  }).catch(() => undefined);
}

export async function listarOrcamentos(): Promise<OrcamentoSalvo[]> {
  const s = await sessaoValida();
  if (!s) return [];
  const res = await restFetch(
    `orcamentos?select=id,numero_pedido,itens,forma_pagamento,created_at&cliente_id=eq.${s.user.id}&order=created_at.desc`,
    { token: s.access_token }
  );
  if (!res.ok) return [];
  return (await res.json()) as OrcamentoSalvo[];
}
