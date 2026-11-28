// 27/11/2026: conta o gasto estimado de cada chamada ao Claude (a resposta traz os tokens usados).
// O Console é individual (sem Admin API), então o gestor mostra: saldo anotado − gasto desde a anotação.
// É ESTIMATIVA pelos preços de tabela; o saldo oficial continua em platform.claude.com.
import { redis } from "@/lib/redis";

const K_LOG = "compass:claude:gasto:log"; // lista (mais recente primeiro) de {em, modelo, origem, custo, ent, sai, cw, cr}
const K_TOTAL = "compass:claude:gasto:total";
const K_DIA = (d: string) => `compass:claude:gasto:dia:${d}`; // hash origem → US$

// US$ por milhão de tokens [entrada, saída]. Escrita de cache = 1,25× entrada; leitura de cache = 0,1× entrada.
const PRECOS: [RegExp, number, number][] = [
  [/haiku/i, 1, 5],
  [/opus/i, 5, 25],
  [/sonnet/i, 2, 10],
];
function preco(modelo: string): [number, number] {
  for (const [re, e, s] of PRECOS) if (re.test(modelo)) return [e, s];
  return [2, 10];
}

export function custoUso(modelo: string, u: any): number {
  if (!u) return 0;
  const [pe, ps] = preco(modelo);
  const ent = Number(u.input_tokens) || 0, sai = Number(u.output_tokens) || 0;
  const cw = Number(u.cache_creation_input_tokens) || 0, cr = Number(u.cache_read_input_tokens) || 0;
  return (ent * pe + sai * ps + cw * pe * 1.25 + cr * pe * 0.1) / 1e6;
}

/** Chamar logo depois de cada resposta da API (nunca derruba a chamada principal). */
export async function registrarUsoClaude(modelo: string, usage: any, origem: string) {
  try {
    if (!usage) return;
    const custo = custoUso(modelo, usage);
    const agora = new Date();
    const dia = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const item = JSON.stringify({ em: agora.toISOString(), modelo, origem, custo: Math.round(custo * 1e6) / 1e6, ent: usage.input_tokens || 0, sai: usage.output_tokens || 0, cw: usage.cache_creation_input_tokens || 0, cr: usage.cache_read_input_tokens || 0 });
    await redis(["LPUSH", K_LOG, item]);
    await redis(["LTRIM", K_LOG, 0, 19999]);
    await redis(["INCRBYFLOAT", K_TOTAL, String(custo)]);
    await redis(["HINCRBYFLOAT", K_DIA(dia), origem, String(custo)]);
    await redis(["EXPIRE", K_DIA(dia), 60 * 60 * 24 * 400]);
  } catch {
    /* contador é só estimativa */
  }
}

/** Gasto estimado desde uma data/hora ISO (padrão: tudo o que foi contado). */
export async function gastoClaude(desde?: string) {
  const min = desde ? Date.parse(desde) || 0 : 0;
  const lista = ((await redis<string[]>(["LRANGE", K_LOG, 0, 19999]).catch(() => [])) || []);
  let total = 0, chamadas = 0, primeira = "";
  const porOrigem: Record<string, number> = {};
  const porDia: Record<string, number> = {};
  for (const x of lista) {
    let j: any; try { j = JSON.parse(x); } catch { continue; }
    const t = Date.parse(j.em) || 0;
    if (t < min) break; // a lista vem da mais recente para a mais antiga
    total += Number(j.custo) || 0; chamadas++; primeira = j.em;
    porOrigem[j.origem || "?"] = (porOrigem[j.origem || "?"] || 0) + (Number(j.custo) || 0);
    const d = new Date(t).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    porDia[d] = (porDia[d] || 0) + (Number(j.custo) || 0);
  }
  const r2 = (n: number) => Math.round(n * 10000) / 10000;
  Object.keys(porOrigem).forEach((k) => (porOrigem[k] = r2(porOrigem[k])));
  Object.keys(porDia).forEach((k) => (porDia[k] = r2(porDia[k])));
  const totalGeral = Number((await redis<string | null>(["GET", K_TOTAL]).catch(() => null)) || 0);
  return { desde: desde || null, totalUSD: r2(total), chamadas, contandoDesde: primeira || null, porOrigem, porDia, totalGeralUSD: r2(totalGeral), aviso: "Estimativa pelos preços de tabela (tokens de cada resposta). O saldo oficial fica em platform.claude.com." };
}
