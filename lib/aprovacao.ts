// Aprovação de layout pelo cliente (18/11/2026).
// O painel manda o layout pelo WhatsApp com um link /aprovar/<id>. O cliente aprova (ou pede ajuste)
// pelo link OU respondendo "APROVO" no WhatsApp. O painel lê as respostas (tool aprovacoes) e marca
// "Layout aprovado" no pedido da produção.
import { randomBytes } from "crypto";
import { redis, redisGetJSON } from "@/lib/redis";

export type StatusAprov = "pendente" | "aprovado" | "ajuste" | "duvida" | "cancelado";
export interface Aprovacao {
  id: string;
  criadoEm: string;
  num: string; // WhatsApp do cliente (55 + DDD + número)
  cliente: string;
  pedido: string; // nº do pedido no Bling (ou proposta)
  producaoId: string; // id do pedido na produção do painel
  layoutId: string; // id do layout (versão) no painel
  versao: number;
  produto: string;
  status: StatusAprov;
  via?: "link" | "whatsapp";
  respondidoEm?: string;
  comentario?: string; // pedido de ajuste ou texto ambíguo recebido
  aplicadoEm?: string; // quando o painel marcou no pedido
  opcoes?: { layoutId: string; versao: number }[]; // 19/11: várias opções numeradas (1, 2, 3) para o cliente escolher uma
  escolha?: number; // nº da opção escolhida (1 = primeira)
}

const CHAVE = (id: string) => `compass:aprov:${id}`;
const IMG = (id: string, n = 0) => (n > 0 ? `compass:aprov:img:${id}:${n}` : `compass:aprov:img:${id}`);
const LISTA = "compass:aprovs";
const POR_NUM = (num: string) => `compass:aprov:num:${num}`;
const VALIDADE = 60 * 60 * 24 * 60; // 60 dias

export async function criarAprovacao(d: Partial<Aprovacao>, imagemB64: string, imagemMime: string, opcoes?: { layoutId: string; versao: number; imagem: string; mime: string }[]): Promise<Aprovacao> {
  const id = randomBytes(6).toString("base64url");
  const a: Aprovacao = {
    id,
    criadoEm: new Date().toISOString(),
    num: String(d.num || "").replace(/\D/g, ""),
    cliente: String(d.cliente || "").slice(0, 200),
    pedido: String(d.pedido || "").slice(0, 40),
    producaoId: String(d.producaoId || "").slice(0, 80),
    layoutId: String(d.layoutId || "").slice(0, 80),
    versao: Number(d.versao) || 1,
    produto: String(d.produto || "").slice(0, 600),
    status: "pendente",
  };
  if (opcoes && opcoes.length > 1) a.opcoes = opcoes.map((o) => ({ layoutId: String(o.layoutId || "").slice(0, 80), versao: Number(o.versao) || 1 }));
  await redis(["SET", CHAVE(id), JSON.stringify(a), "EX", VALIDADE]);
  if (imagemB64) await redis(["SET", IMG(id), JSON.stringify({ mime: imagemMime || "image/jpeg", b64: imagemB64 }), "EX", VALIDADE]);
  if (a.opcoes) for (let i = 0; i < opcoes!.length; i++) await redis(["SET", IMG(id, i + 1), JSON.stringify({ mime: opcoes![i].mime || "image/jpeg", b64: opcoes![i].imagem }), "EX", VALIDADE]);
  await redis(["LPUSH", LISTA, id]);
  await redis(["LTRIM", LISTA, 0, 499]);
  // a resposta "APROVO" no WhatsApp vale para a última aprovação pendente desse número
  if (a.num) await redis(["SET", POR_NUM(a.num), id, "EX", VALIDADE]);
  return a;
}

export const lerAprovacao = (id: string) => redisGetJSON<Aprovacao>(CHAVE(id));
export async function salvarAprovacao(a: Aprovacao) {
  await redis(["SET", CHAVE(a.id), JSON.stringify(a), "EX", VALIDADE]);
}
export async function imagemAprovacao(id: string, n = 0): Promise<{ mime: string; b64: string } | null> {
  return redisGetJSON<{ mime: string; b64: string }>(IMG(id, n));
}
export async function listarAprovacoes(limite = 100): Promise<Aprovacao[]> {
  const ids = await redis<string[]>(["LRANGE", LISTA, 0, Math.max(0, limite - 1)]);
  if (!ids || !ids.length) return [];
  const brutos = await redis<(string | null)[]>(["MGET", ...ids.map(CHAVE)]);
  return brutos.map((x) => { try { return x ? (JSON.parse(x) as Aprovacao) : null; } catch { return null; } }).filter((x): x is Aprovacao => !!x);
}

export async function responderAprovacao(id: string, status: "aprovado" | "ajuste", via: "link" | "whatsapp", comentario?: string, escolha?: number): Promise<Aprovacao | null> {
  const a = await lerAprovacao(id);
  if (!a || a.status === "cancelado") return null;
  if (a.status === "aprovado" && status === "aprovado") return a;
  if (status === "aprovado" && a.opcoes) {
    if (!escolha || escolha < 1 || escolha > a.opcoes.length) return null;
    a.escolha = escolha;
    a.layoutId = a.opcoes[escolha - 1].layoutId;
    a.versao = a.opcoes[escolha - 1].versao;
  }
  a.status = status;
  a.via = via;
  a.respondidoEm = new Date().toISOString();
  if (comentario) a.comentario = comentario.slice(0, 1000);
  await salvarAprovacao(a);
  if (a.num) await redis(["DEL", POR_NUM(a.num)]).catch(() => {});
  return a;
}

const SIM = /^(aprov(o|ado|ada|amos)|t[aá] aprovad[oa]|pode (fazer|produzir|seguir|mandar)|liberad[oa]|est[aá] (ok|[oó]timo|perfeito)|perfeito,? pode)/i;
const OK_SOLTO = /^(ok|okay|blz|beleza|show|top|certo|sim|👍|✅)[.!]*$/i;

/** Mensagem do cliente no WhatsApp: se há aprovação pendente para o número, entende "APROVO". */
export async function mensagemAprovacao(num: string, texto: string): Promise<Aprovacao | null> {
  const t = String(texto || "").trim();
  if (!t || !num) return null;
  const id = await redis<string | null>(["GET", POR_NUM(num)]).catch(() => null);
  if (!id) return null;
  const a = await lerAprovacao(id);
  if (!a || a.status !== "pendente") return null;
  const limpo = t.normalize("NFC").replace(/\s+/g, " ");
  if (a.opcoes) {
    // várias opções: vale "2", "opção 2", "a 2", "quero a 3", "aprovo a 1", "a segunda"…
    const n = numeroOpcao(limpo, a.opcoes.length);
    if (n) return responderAprovacao(id, "aprovado", "whatsapp", limpo, n);
    if (SIM.test(limpo) || OK_SOLTO.test(limpo)) { a.status = "duvida"; a.comentario = limpo; a.respondidoEm = new Date().toISOString(); await salvarAprovacao(a); return a; }
    return null;
  }
  if (SIM.test(limpo)) return responderAprovacao(id, "aprovado", "whatsapp", limpo);
  if (OK_SOLTO.test(limpo)) {
    // resposta curta e ambígua: o painel pergunta à Compass antes de marcar
    a.status = "duvida";
    a.comentario = limpo;
    a.respondidoEm = new Date().toISOString();
    await salvarAprovacao(a);
    return a;
  }
  return null;
}

const ORDINAIS = ["primeir", "segund", "terceir", "quart", "quint", "sext"];
export function numeroOpcao(t: string, max: number): number {
  const x = t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (x.length > 60) return 0;
  const m = /^(?:(?:aprovo|aprovado|quero|prefiro|escolho|fico com|pode ser|vamos de|vai)\s+)?(?:(?:a|o|na|no)\s+)?(?:op(?:cao|c)?\.?\s*|opcao\s*|n(?:umero|o|º)?\.?\s*|layout\s*|modelo\s*|versao\s*|v)?(\d)\b[.!\s]*(?:👍|✅)?[.!\s]*$/.exec(x);
  if (m) { const n = +m[1]; return n >= 1 && n <= max ? n : 0; }
  for (let i = 0; i < Math.min(max, ORDINAIS.length); i++) if (new RegExp(`^(?:(?:aprovo|quero|prefiro|escolho|fico com|pode ser|vamos de)\\s+)?(?:a|o)?\\s*${ORDINAIS[i]}[ao](?:\\s+(?:opcao|op[cç]ao|layout|modelo))?[.!\\s]*$`).test(x)) return i + 1;
  return 0;
}

export function textoPedidoAprovacao(a: Aprovacao, link: string) {
  if (a.opcoes) return [
    `Olá! Aqui é da *Compass Brindes Corporativos*.`,
    ``,
    `Seguem ${a.opcoes.length} opções de layout${a.pedido ? ` do pedido ${a.pedido}` : ""} (numeradas de 1 a ${a.opcoes.length}).`,
    a.produto ? `Produto: ${a.produto}` : "",
    ``,
    `👉 Para escolher, abra: ${link}`,
    `Ou responda aqui só com o *número* da opção (ex.: *2*).`,
    ``,
    `A produção só começa depois da sua escolha.`,
  ].filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n");
  return [
    `Olá! Aqui é da *Compass Brindes Corporativos*.`,
    ``,
    `Segue o layout${a.pedido ? ` do pedido ${a.pedido}` : ""}${a.versao > 1 ? ` (versão ${a.versao})` : ""} para sua aprovação.`,
    a.produto ? `Produto: ${a.produto}` : "",
    ``,
    `👉 Para aprovar ou pedir ajuste, abra: ${link}`,
    `Ou responda *APROVO* aqui mesmo.`,
    ``,
    `A produção só começa depois da sua aprovação.`,
  ].filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n");
}

export function publicoAprovacao(a: Aprovacao) {
  return { id: a.id, cliente: a.cliente, pedido: a.pedido, versao: a.versao, produto: a.produto, status: a.status, respondidoEm: a.respondidoEm || null, comentario: a.status === "ajuste" ? a.comentario || "" : "", opcoes: a.opcoes ? a.opcoes.length : 0, escolha: a.escolha || 0 };
}
