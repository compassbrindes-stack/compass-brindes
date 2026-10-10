// Registro das conversas individuais do WhatsApp da Compass (via webhook da uazapi).
// Guarda, por número: nome, última mensagem, data e quem falou por último,
// e as últimas 100 mensagens. O painel lê isso pelo conector /api/mcp/[chave].

import { redis } from "@/lib/redis";

export interface Contato {
  num: string; // só dígitos, com 55
  nome?: string;
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

export async function registrarMensagem(o: { num: string; nome?: string; texto: string; tipo: string; deCompass: boolean; quando: number; id: string }) {
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
    nome: !o.deCompass && o.nome ? o.nome : c.nome,
    ultima: resumo,
    ultimaEm: em,
    ultimaDe: o.deCompass ? "compass" : "cliente",
    primeiraEm: c.primeiraEm || em,
    total: (c.total || 0) + 1,
  };
  await redis(["SET", K_CONTATO(o.num), JSON.stringify(c)]);
  await redis(["ZADD", K_ATIV, Date.parse(em), o.num]);
  await redis(["LPUSH", K_MSGS(o.num), JSON.stringify({ em, de: c.ultimaDe, texto: resumo, id: o.id })]);
  await redis(["LTRIM", K_MSGS(o.num), 0, 99]);
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

export async function historico(num: string, limite = 30) {
  const n = String(num || "").replace(/\D/g, "");
  const itens = await redis<string[]>(["LRANGE", K_MSGS(n), 0, Math.max(0, Math.min(limite, 100) - 1)]);
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
