// Compras feitas pela Compass nos fornecedores (ex.: pedidos XBZ "P7302075").
// O painel Compass Gestão manda a lista das compras pelo conector (registrar_compras)
// e lê de volta quais foram pagas (compras_pagas). O grupo Compass Recibos usa esta
// lista para reconhecer o pagamento pelo número do pedido ou pelo valor.

import { redis } from "@/lib/redis";

export interface Compra {
  pedido: string; // "P7302075"
  fornecedor: string;
  valor: number | null;
  itens?: string;
  feitoEm?: string; // AAAA-MM-DD
  pago?: boolean;
  pagoEm?: string;
  contaBling?: number;
  pagoPor?: string; // legenda/arquivo que deu a baixa
}

const K = "compass:compras";

export const normPedido = (s: string) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Números de pedido de fornecedor no texto: "P7302075", "p 7302075", "P-7302075". */
export function pedidosNoTexto(texto: string): string[] {
  const out = new Set<string>();
  for (const m of String(texto || "").matchAll(/\bP\s?-?\s?(\d{6,9})\b/gi)) out.add("P" + m[1]);
  return [...out];
}

export async function todasCompras(): Promise<Compra[]> {
  const h = await redis<string[] | null>(["HGETALL", K]);
  const lista: Compra[] = [];
  for (let i = 0; h && i < h.length; i += 2) {
    try {
      lista.push(JSON.parse(h[i + 1]));
    } catch {
      /* ignora */
    }
  }
  return lista;
}

/** Atualiza as compras vindas do painel sem apagar a informação de pagamento já registrada. */
export async function registrarCompras(novas: Partial<Compra>[]) {
  const atuais = new Map((await todasCompras()).map((c) => [c.pedido, c]));
  let n = 0;
  for (const x of novas) {
    const pedido = normPedido(x.pedido || "");
    if (!pedido) continue;
    const ant = atuais.get(pedido);
    const c: Compra = {
      pedido,
      fornecedor: String(x.fornecedor || ant?.fornecedor || ""),
      valor: typeof x.valor === "number" && isFinite(x.valor) ? x.valor : ant?.valor ?? null,
      itens: x.itens ?? ant?.itens,
      feitoEm: x.feitoEm ?? ant?.feitoEm,
      ...(ant?.pago
        ? { pago: true, pagoEm: ant.pagoEm, contaBling: ant.contaBling, pagoPor: ant.pagoPor }
        : x.pago
          ? { pago: true, pagoEm: x.pagoEm, pagoPor: "marcado no painel" }
          : {}),
    };
    await redis(["HSET", K, pedido, JSON.stringify(c)]);
    n++;
  }
  return n;
}

export async function marcarPagas(pedidos: string[], info: { pagoEm: string; contaBling?: number; pagoPor?: string }) {
  const atuais = new Map((await todasCompras()).map((c) => [c.pedido, c]));
  for (const p of pedidos) {
    const c = atuais.get(p) || { pedido: p, fornecedor: "", valor: null };
    await redis(["HSET", K, p, JSON.stringify({ ...c, pago: true, ...info })]);
  }
}

const igual = (a: number, b: number) => Math.abs(a - b) < 0.01;

/**
 * Acha as compras pagas por um comprovante. Puro, para poder testar.
 * - com números de pedido: só esses pedidos (o valor tem de bater com a soma, se as compras tiverem valor);
 * - sem número: uma compra em aberto com o mesmo valor, ou um grupo de compras do mesmo
 *   fornecedor feitas no mesmo dia cuja soma dá o valor (a XBZ cobra vários pedidos num pagamento só).
 */
export function acharCompras(
  abertas: Compra[],
  pedidos: string[],
  valor: number | null,
  op: { valores?: number[]; usaSaldo?: boolean } = {}
): { compras: Compra[]; motivo?: string; credito?: number } {
  const emAberto = abertas.filter((c) => !c.pago);
  // vários valores na legenda ("pago xbz 1440,00 / pago xbz 600,00"): uma compra para cada valor
  if (!pedidos.length && op.valores && op.valores.length > 1) {
    const usadas: Compra[] = [];
    for (const v of op.valores) {
      const c = emAberto.filter((x) => x.valor != null && igual(x.valor, v) && !usadas.includes(x));
      if (c.length !== 1) return { compras: [], motivo: c.length ? `há mais de uma compra de ${brl(v)} em aberto (${c.map((x) => x.pedido).join(", ")}). Mande os números dos pedidos` : `não achei compra em aberto de ${brl(v)}` };
      usadas.push(c[0]);
    }
    pedidos = usadas.map((c) => c.pedido);
    const soma = usadas.reduce((s, c) => s + (c.valor || 0), 0);
    if (valor == null || igual(valor, op.valores[0])) valor = soma;
  }
  if (pedidos.length) {
    const achadas = pedidos.map((p) => abertas.find((c) => c.pedido === p)).filter(Boolean) as Compra[];
    const faltam = pedidos.filter((p) => !achadas.some((c) => c.pedido === p));
    if (faltam.length) return { compras: [], motivo: `não encontrei ${faltam.join(", ")} nas compras do painel (Compras no fornecedor)` };
    const jaPagas = achadas.filter((c) => c.pago);
    if (jaPagas.length === achadas.length) return { compras: [], motivo: `${achadas.map((c) => c.pedido).join(", ")} já ${achadas.length > 1 ? "estão pagos" : "está pago"}` };
    const soma = achadas.reduce((s, c) => s + (c.valor || 0), 0);
    if (valor != null && achadas.every((c) => c.valor != null) && !igual(soma, valor)) {
      // pago menos que o total usando saldo/crédito que a Compass tinha no fornecedor
      if (op.usaSaldo && valor < soma) return { compras: achadas.filter((c) => !c.pago), credito: Math.round((soma - valor) * 100) / 100 };
      return { compras: [], motivo: `o comprovante é de ${brl(valor)}, mas ${achadas.map((c) => `${c.pedido} ${brl(c.valor || 0)}`).join(" + ")} somam ${brl(soma)}. Se a diferença foi saldo/crédito no fornecedor, escreva "saldo" na legenda` };
    }
    return { compras: achadas.filter((c) => !c.pago) };
  }
  if (valor == null) return { compras: [] };
  const uma = emAberto.filter((c) => c.valor != null && igual(c.valor, valor));
  if (uma.length === 1) return { compras: uma };
  if (uma.length > 1) return { compras: [], motivo: `há ${uma.length} compras de ${brl(valor)} em aberto (${uma.map((c) => c.pedido).join(", ")}). Mande o número do pedido na legenda` };
  const grupos = new Map<string, Compra[]>();
  for (const c of emAberto) {
    if (c.valor == null) continue;
    const k = `${c.fornecedor.toLowerCase()}|${c.feitoEm || ""}`;
    grupos.set(k, [...(grupos.get(k) || []), c]);
  }
  const bate = [...grupos.values()].filter((g) => g.length > 1 && igual(g.reduce((s, c) => s + (c.valor || 0), 0), valor));
  if (bate.length === 1) return { compras: bate[0] };
  return { compras: [] };
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
