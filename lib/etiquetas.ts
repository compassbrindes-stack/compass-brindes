// Etiquetas de volume (28/11): dados da NF para a etiqueta de transporte.
// A NF da API v3 do Bling vem com transporte.volumes vazio; a quantidade certa está
// no XML da nota (<vol><qVol>) e, se o XML falhar, no pedido de venda ligado a ela.
import { bling } from "@/lib/bling-api";

export interface DadosEtiqueta {
  nf: string;
  serie?: number;
  nome: string;
  doc: string;
  fone: string;
  rua: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  transp: string;
  vol: number;
  volBling: number;
  origemVol: "xml" | "pedido" | "";
  pedido: string;
  peso?: number;
}

const num6 = (s: unknown) => {
  const d = String(s ?? "").replace(/\D/g, "");
  return d ? d.padStart(6, "0") : "";
};
const fone = (f: unknown) => {
  const d = String(f ?? "").replace(/\D/g, "");
  return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : d;
};
const diaBR = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function volumesDoXml(url: string): Promise<{ vol: number; peso: number } | null> {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !/(^|\.)bling\.com\.br$/i.test(u.hostname)) return null;
    const r = await fetch(u.toString(), { cache: "no-store" });
    if (!r.ok) return null;
    const xml = await r.text();
    const vols = Array.from(xml.matchAll(/<qVol>\s*(\d+)\s*<\/qVol>/g)).reduce((s, m) => s + Number(m[1]), 0);
    const peso = Array.from(xml.matchAll(/<pesoB>\s*([\d.]+)\s*<\/pesoB>/g)).reduce((s, m) => s + Number(m[1]), 0);
    return vols ? { vol: vols, peso } : null;
  } catch {
    return null;
  }
}

export async function dadosEtiquetaNf(numero: string): Promise<DadosEtiqueta> {
  const alvo = num6(numero);
  if (!alvo) throw new Error("Informe o número da NF.");
  const ini = diaBR(Date.now() - 120 * 864e5) + " 00:00:00";
  let achou: any = null;
  for (let pag = 1; pag <= 5 && !achou; pag++) {
    const r: any = await bling(`/nfe?tipo=1&limite=100&pagina=${pag}&dataEmissaoInicial=${encodeURIComponent(ini)}`);
    const l: any[] = r?.data || [];
    achou = l.find((n) => num6(n.numero) === alvo && String(n.situacao) !== "2");
    if (l.length < 100) break;
  }
  if (!achou) throw new Error(`NF ${alvo} não encontrada no Bling (últimos 120 dias).`);
  const nf: any = (await bling(`/nfe/${achou.id}`))?.data || {};
  const c = nf.contato || {}, e = c.endereco || {}, t = nf.transporte || {}, et = t.etiqueta || {};
  const end = et.endereco && et.municipio ? et : e;

  let vol = (t.volumes || []).length, origemVol: DadosEtiqueta["origemVol"] = vol ? "xml" : "", pedido = "", peso = 0;
  if (nf.xml) {
    const x = await volumesDoXml(nf.xml);
    if (x) { vol = x.vol; peso = x.peso; origemVol = "xml"; }
  }
  // pedido de venda ligado à NF: dá o número do pedido e, sem XML, a quantidade de volumes
  if (c.id) {
    try {
      const d0 = diaBR(new Date(String(nf.dataEmissao || "").slice(0, 10) + "T12:00:00").getTime() - 90 * 864e5);
      const peds: any[] = (await bling(`/pedidos/vendas?idContato=${c.id}&dataInicial=${d0}&limite=20`))?.data || [];
      for (const pd of peds.slice(0, 8)) {
        const o: any = (await bling(`/pedidos/vendas/${pd.id}`))?.data || {};
        if (o.notaFiscal && String(o.notaFiscal.id) === String(nf.id)) {
          pedido = String(o.numero || pd.numero || "");
          if (!vol) { vol = Number(o.transporte?.quantidadeVolumes) || 0; origemVol = vol ? "pedido" : ""; }
          break;
        }
      }
    } catch {}
  }
  return {
    nf: num6(nf.numero),
    serie: nf.serie,
    nome: (et.endereco && et.nome) || c.nome || "",
    doc: c.numeroDocumento || "",
    fone: fone(c.telefone),
    rua: [end.endereco, end.numero].filter(Boolean).join(", ") + (end.complemento ? " - " + end.complemento : ""),
    bairro: end.bairro || "",
    cidade: end.municipio || "",
    uf: end.uf || "",
    cep: String(end.cep || "").replace(/\D/g, ""),
    transp: t.transportador?.nome || "",
    vol: Math.max(1, vol || 1),
    volBling: vol,
    origemVol,
    pedido,
    peso,
  };
}
