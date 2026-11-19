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
}

const CHAVE = (id: string) => `compass:aprov:${id}`;
const IMG = (id: string) => `compass:aprov:img:${id}`;
const LISTA = "compass:aprovs";
const POR_NUM = (num: string) => `compass:aprov:num:${num}`;
const VALIDADE = 60 * 60 * 24 * 60; // 60 dias

export async function criarAprovacao(d: Partial<Aprovacao>, imagemB64: string, imagemMime: string): Promise<Aprovacao> {
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
  await redis(["SET", CHAVE(id), JSON.stringify(a), "EX", VALIDADE]);
  if (imagemB64) await redis(["SET", IMG(id), JSON.stringify({ mime: imagemMime || "image/jpeg", b64: imagemB64 }), "EX", VALIDADE]);
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
export async function imagemAprovacao(id: string): Promise<{ mime: string; b64: string } | null> {
  return redisGetJSON<{ mime: string; b64: string }>(IMG(id));
}
export async function listarAprovacoes(limite = 100): Promise<Aprovacao[]> {
  const ids = await redis<string[]>(["LRANGE", LISTA, 0, Math.max(0, limite - 1)]);
  if (!ids || !ids.length) return [];
  const brutos = await redis<(string | null)[]>(["MGET", ...ids.map(CHAVE)]);
  return brutos.map((x) => { try { return x ? (JSON.parse(x) as Aprovacao) : null; } catch { return null; } }).filter((x): x is Aprovacao => !!x);
}

export async function responderAprovacao(id: string, status: "aprovado" | "ajuste", via: "link" | "whatsapp", comentario?: string): Promise<Aprovacao | null> {
  const a = await lerAprovacao(id);
  if (!a || a.status === "cancelado") return null;
  if (a.status === "aprovado" && status === "aprovado") return a;
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

export function textoPedidoAprovacao(a: Aprovacao, link: string) {
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
  return { id: a.id, cliente: a.cliente, pedido: a.pedido, versao: a.versao, produto: a.produto, status: a.status, respondidoEm: a.respondidoEm || null, comentario: a.status === "ajuste" ? a.comentario || "" : "" };
}
