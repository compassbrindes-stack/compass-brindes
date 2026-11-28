// Registro das conversas individuais do WhatsApp da Compass (via webhook da uazapi).
// Guarda, por número: nome, última mensagem, data e quem falou por último,
// e as últimas 100 mensagens. O painel lê isso pelo conector /api/mcp/[chave].

import { redis } from "@/lib/redis";

export interface Contato {
  num: string; // só dígitos, com 55
  nome?: string;
  agenda?: string; // nome salvo na agenda do celular da Compass
  ultima?: string;
  ultimaEm?: string; // ISO
  ultimaDe?: "cliente" | "compass";
  primeiraEm?: string;
  total?: number;
}

const K_CONTATO = (num: string) => `compass:wa:c:${num}`;
const K_MSGS = (num: string) => `compass:wa:m:${num}`;
const K_ATIV = "compass:wa:atividade";

/** "5549999990000@s.whatsapp.net" → "5549999990000". Ignora grupos, canais e @lid sem número. */
export function numeroDoChat(chatid: string, alternativo?: string | null): string | null {
  const tenta = (s?: string | null) => {
    const m = /^(\d{10,15})@s\.whatsapp\.net$/.exec(String(s || ""));
    return m ? m[1] : null;
  };
  return tenta(chatid) || tenta(alternativo) || null;
}

export async function registrarMensagem(o: { num: string; nome?: string; agenda?: string; texto: string; tipo: string; deCompass: boolean; quando: number; id: string }) {
  const em = new Date(o.quando > 1e12 ? o.quando : o.quando * 1000 || Date.now()).toISOString();
  const atual = await redis<string | null>(["GET", K_CONTATO(o.num)]);
  let c: Contato = { num: o.num };
  if (atual) {
    try {
      c = JSON.parse(atual);
    } catch {
      /* recomeça */
    }
  }
  const resumo = o.texto ? o.texto.replace(/\s+/g, " ").slice(0, 300) : `[${o.tipo.replace(/Message$/, "").toLowerCase() || "mídia"}]`;
  c = {
    ...c,
    num: o.num,
    // 27/11: nome salvo na agenda do celular da Compass (vem também nas mensagens enviadas pela Compass);
    // usado quando o cliente não tem nome (ex.: só a Compass escreveu, ou o WhatsApp não mandou o nome do perfil)
    nome: !o.deCompass && o.nome ? o.nome : c.nome || (o.agenda ? o.agenda.trim() : c.nome),
    ...(o.agenda && o.agenda.trim() ? { agenda: o.agenda.trim() } : {}),
    ultima: resumo,
    ultimaEm: em,
    ultimaDe: o.deCompass ? "compass" : "cliente",
    primeiraEm: c.primeiraEm || em,
    total: (c.total || 0) + 1,
  };
  await redis(["SET", K_CONTATO(o.num), JSON.stringify(c)]);
  await redis(["ZADD", K_ATIV, Date.parse(em), o.num]);
  const completo = o.texto ? o.texto.slice(0, 4000) : resumo;
  await redis(["LPUSH", K_MSGS(o.num), JSON.stringify({ em, de: c.ultimaDe, texto: completo, id: o.id, tipo: o.tipo })]);
  await redis(["LTRIM", K_MSGS(o.num), 0, 9999]); // guarda até 10 mil mensagens por número (ficha do cliente)
}

/** Contatos com conversa desde a data (ISO), mais recentes primeiro. */
export async function conversasDesde(desde?: string, limite = 300): Promise<Contato[]> {
  const min = desde ? Date.parse(desde) || 0 : 0;
  const nums = await redis<string[]>(["ZREVRANGEBYSCORE", K_ATIV, "+inf", String(min), "LIMIT", 0, Math.min(limite, 1000)]);
  if (!nums || !nums.length) return [];
  const brutos = await redis<(string | null)[]>(["MGET", ...nums.map(K_CONTATO)]);
  return brutos
    .map((x) => {
      try {
        return x ? (JSON.parse(x) as Contato) : null;
      } catch {
        return null;
      }
    })
    .filter((x): x is Contato => !!x);
}

export async function totalMensagens(num: string): Promise<number> {
  const n = String(num || "").replace(/\D/g, "");
  return Number(await redis<number>(["LLEN", K_MSGS(n)])) || 0;
}

/** Mensagens de um número, das mais novas para trás: pula `offset` e traz `limite` (máx. 500), em ordem cronológica. */
export async function historico(num: string, limite = 30, offset = 0) {
  const n = String(num || "").replace(/\D/g, "");
  const ini = Math.max(0, Math.floor(offset) || 0);
  const itens = await redis<string[]>(["LRANGE", K_MSGS(n), ini, ini + Math.max(0, Math.min(limite, 500) - 1)]);
  return (itens || [])
    .map((x) => {
      try {
        return JSON.parse(x);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse();
}
