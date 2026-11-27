// Formulário de frete para o cliente preencher (dados do destinatário).
// A Compass cria o link pelo painel (conector MCP), o cliente preenche em /frete/<id>
// e a mensagem sai no formato que a Expresso São Miguel pede para cotação.
import { randomBytes } from "crypto";
import { redis, redisGetJSON } from "@/lib/redis";

export interface Volume { qtd: string; c: string; l: string; a: string; peso: string }
export interface Destinatario { nome: string; doc: string; email?: string; cep: string; endereco: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string; contato: string; telefone: string }
export interface FormFrete {
  id: string;
  criadoEm: string;
  status: "aguardando_cliente" | "preenchido" | "enviado" | "cancelado";
  clienteNome: string; // como a Compass identifica o pedido (ex.: nome do cliente/empresa)
  pedido: string;
  tomador: "remetente" | "destinatario";
  valorNF: string;
  produto: string;
  volumes: Volume[];
  pesoTotal: string;
  autoEnviar?: boolean;
  whatsCliente?: string;
  /** criado pelo atendimento automático do WhatsApp (lib/agente-leads) */
  agente?: boolean;
  /** pedido de dados do cliente feito pelo painel (botão "Pedir dados"): não vai sozinho para a transportadora */
  pedidoDados?: boolean;
  /** cotação montada no painel (cliente já cadastrado): texto pronto, conferido lá */
  texto?: string;
  origem?: "link" | "painel";
  dest?: Destinatario;
  preenchidoEm?: string;
  enviadoEm?: string;
  obsCliente?: string;
  auto?: { status: string; em: string; obs?: string; protocolo?: string; atendente?: string; msgId?: string; valor?: number; prazo?: string; numero?: string };
}

const CHAVE = (id: string) => `compass:frete:${id}`;
const LISTA = "compass:fretes";
const VALIDADE = 60 * 60 * 24 * 45; // 45 dias

export const REMETENTE = { nome: "Compass Brindes", doc: "26123176000124", end: "Rua padre José anchieta 116 centro", cidade: "Irai RS", cep: "98460-000" };

export async function criarFormFrete(d: Partial<FormFrete>): Promise<FormFrete> {
  const id = randomBytes(6).toString("base64url");
  const f: FormFrete = {
    id,
    criadoEm: new Date().toISOString(),
    status: d.texto ? "preenchido" : "aguardando_cliente",
    clienteNome: String(d.clienteNome || "").slice(0, 120),
    pedido: String(d.pedido || "").slice(0, 60),
    tomador: d.tomador === "destinatario" ? "destinatario" : "remetente",
    valorNF: String(d.valorNF || "").slice(0, 30),
    produto: String(d.produto || "produto personalizado/caixa de papelão").slice(0, 200),
    volumes: (Array.isArray(d.volumes) ? d.volumes : []).slice(0, 30).map((v: any) => ({ qtd: String(v.qtd || "1"), c: String(v.c || ""), l: String(v.l || ""), a: String(v.a || ""), peso: String(v.peso || "") })),
    pesoTotal: String(d.pesoTotal || "").slice(0, 20),
    autoEnviar: d.autoEnviar !== false && !d.pedidoDados && !d.agente,
    ...(d.texto ? { texto: String(d.texto).slice(0, 4000), origem: "painel" as const } : { origem: "link" as const }),
    ...(d.agente ? { agente: true } : {}),
    ...(d.pedidoDados ? { pedidoDados: true } : {}),
    whatsCliente: String(d.whatsCliente || "").replace(/\D/g, "").replace(/^(\d{10,11})$/, "55$1").slice(0, 13),
    ...(d.dest ? { dest: d.dest } : {}),
  };
  await redis(["SET", CHAVE(id), JSON.stringify(f), "EX", VALIDADE]);
  await redis(["LPUSH", LISTA, id]);
  await redis(["LTRIM", LISTA, 0, 299]);
  return f;
}

export const lerFormFrete = (id: string) => (/^[\w-]{6,20}$/.test(id) ? redisGetJSON<FormFrete>(CHAVE(id)) : Promise.resolve(null));

export async function salvarFormFrete(f: FormFrete) {
  await redis(["SET", CHAVE(f.id), JSON.stringify(f), "EX", VALIDADE]);
}

export async function listarFormFrete(limite = 50): Promise<FormFrete[]> {
  const ids = await redis<string[]>(["LRANGE", LISTA, 0, Math.max(0, limite - 1)]);
  const out: FormFrete[] = [];
  for (const id of ids || []) { const f = await lerFormFrete(id); if (f) out.push(f); }
  return out;
}

const so = (s: string) => String(s || "").replace(/\D/g, "");
export function textoCotacaoSaoMiguel(f: FormFrete): string {
  if (f.origem === "painel" && f.texto) return f.texto.startsWith("*Compass") ? f.texto : "*Compass Brindes Corporativos:*\n" + f.texto;
  const d = f.dest;
  const r = REMETENTE;
  const vols = (f.volumes || []).filter((v) => v.c || v.l || v.a || v.peso);
  const nVol = vols.reduce((a, v) => a + (parseInt(v.qtd, 10) || 1), 0) || 1;
  const linhasVol = vols.map((v) => `${v.qtd || 1} vol ${v.c || "?"}x${v.l || "?"}x${v.a || "?"}${v.peso ? " " + v.peso.replace(".", ",") + "kg" : ""}`);
  const cepFmt = (c: string) => { const x = so(c); return x.length === 8 ? x.slice(0, 5) + "-" + x.slice(5) : c; };
  const endDest = d ? [`${d.endereco}${d.numero ? ", " + d.numero : ""}${d.complemento ? " - " + d.complemento : ""}`, d.bairro, `${d.cidade} ${d.uf}`.trim(), cepFmt(d.cep)].filter(Boolean) : [];
  return [
    "*Compass Brindes Corporativos:*",
    "✅CNPJ / CPF Remetente , nome e endereço : ", r.nome, r.doc, r.end, r.cidade, r.cep, "",
    "✅CNPJ / CPF  Destinatário, nome e endereço: ", d ? so(d.doc) : "", d ? d.nome : "", ...endDest, "",
    "✅Informar quem será o tomador (pagador do frete) , se remetente ou destinatário : *" + f.tomador + "*", "",
    "✅Valor da Nota Fiscal : " + (f.valorNF ? "R$ " + f.valorNF.replace(/^R\$\s*/, "") : ""), "",
    "✅Medidas de cada volume : (comprimento x largura x altura x peso) ", ...linhasVol, "",
    ...(f.pesoTotal ? ["Peso total " + f.pesoTotal.replace(".", ",").replace(/\s*kg$/i, "") + "kg", ""] : []),
    "✅Quantidade de volumes : " + nVol, "",
    "✅Informar o que é o produto e como está embalado : " + (f.produto || ""),
  ].join("\n");
}

/** Dados que o cliente pode ver (sem nada interno). */
export function publico(f: FormFrete) {
  return { id: f.id, status: f.status, clienteNome: f.clienteNome, valorNF: f.valorNF, volumes: f.volumes, pesoTotal: f.pesoTotal, produto: f.produto, dest: f.dest || null, soDados: !!(f.agente || f.pedidoDados) };
}

export const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
/** Tudo que a São Miguel exige para cotar (senão devolvem a cotação). */
export function completo(f: FormFrete): boolean {
  if (f.origem === "painel") return !!(f.texto && /Destinat/i.test(f.texto) && f.dest && f.dest.nome && [11, 14].includes(String(f.dest.doc || "").replace(/\D/g, "").length));
  const d = f.dest;
  const so = (s: string) => String(s || "").replace(/\D/g, "");
  const vols = (f.volumes || []).filter((v) => v.c || v.l || v.a || v.peso);
  return !!(d && d.nome && [11, 14].includes(so(d.doc).length) && so(d.cep).length === 8 && d.endereco && d.numero && d.bairro && d.cidade && UFS.includes(d.uf)
    && f.valorNF && f.produto && vols.length && vols.every((v) => v.c && v.l && v.a && v.peso));
}

/** Apaga de vez um formulário (só os cancelados). */
export async function apagarFormFrete(id: string) {
  const f = await lerFormFrete(id);
  if (!f || f.status !== "cancelado") return false;
  await redis(["DEL", CHAVE(id)]);
  await redis(["LREM", LISTA, 0, id]);
  return true;
}
