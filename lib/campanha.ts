// Campanhas de WhatsApp (ex.: OdontoTop fim de ano, 24/11/2026).
// Fila no Redis: uma mensagem por vez, só em horário comercial (seg–sex, faixas do dia),
// com intervalo aleatório entre envios e limite por dia, para não arriscar o número.
// Marca quem leu (evento de leitura da uazapi) e quem respondeu (mensagem do cliente depois do envio).
import { redis } from "@/lib/redis";
import { enviarMidia, enviarTexto } from "@/lib/uazapi";
import { historico, registrarMensagem } from "@/lib/conversas";

export type ItemCampanha = {
  num: string;
  unidade: string;
  cidade: string;
  cliente?: boolean;
  status: "pendente" | "enviado" | "erro" | "pulado";
  enviadoEm?: string;
  msgId?: string;
  erro?: string;
  lidoEm?: string;
  respondeuEm?: string;
};

export type Campanha = {
  id: string;
  nome: string;
  ativa: boolean;
  criadaEm: string;
  imagemUrl?: string; // link público da imagem (vai junto, com o texto como legenda)
  textoNovo: string; // {cidade} vira o nome da cidade
  textoCliente?: string; // para quem já é cliente (se vazio, usa textoNovo)
  limiteDia: number;
  intervaloMin: number; // minutos
  intervaloMax: number;
  faixas: [string, string][]; // horário de Brasília, ex.: [["09:00","11:30"],["14:00","17:00"]]
  inicioEm?: string; // não envia antes disso
  proximoEm?: string;
  itens: ItemCampanha[];
  avisarGrupo?: boolean; // avisa o grupo quando alguém responde
};

const K = (id: string) => `compass:campanha:${id}`;
const K_LISTA = "compass:campanhas";
const K_OPTOUT = "compass:wa:optout";
const K_NUMS = "compass:campanha:nums"; // números que receberam campanha: o atendimento automático não responde
const K_LIDO_MSG = (id: string) => `compass:wa:lido:${id}`;
const K_LIDO_CHAT = (num: string) => `compass:wa:lidochat:${num}`;
const so = (s: unknown) => String(s || "").replace(/\D/g, "");

export async function lerCampanha(id: string): Promise<Campanha | null> {
  const raw = await redis<string | null>(["GET", K(id)]).catch(() => null);
  try {
    return raw ? (JSON.parse(raw) as Campanha) : null;
  } catch {
    return null;
  }
}
async function gravar(c: Campanha) {
  await redis(["SET", K(c.id), JSON.stringify(c)]);
  await redis(["SADD", K_LISTA, c.id]);
}

export async function criarCampanha(o: Partial<Campanha> & { id: string; nome: string; textoNovo: string; itens: Partial<ItemCampanha>[] }) {
  if (await lerCampanha(o.id)) throw new Error("já existe campanha com esse id");
  const vistos = new Set<string>();
  const itens: ItemCampanha[] = [];
  for (const i of o.itens) {
    const num = so(i.num);
    if (num.length < 10 || vistos.has(num)) continue;
    vistos.add(num);
    itens.push({ num, unidade: String(i.unidade || ""), cidade: String(i.cidade || i.unidade || ""), cliente: Boolean(i.cliente), status: "pendente" });
  }
  const c: Campanha = {
    id: o.id,
    nome: o.nome,
    ativa: o.ativa ?? false,
    criadaEm: new Date().toISOString(),
    imagemUrl: o.imagemUrl || "",
    textoNovo: o.textoNovo,
    textoCliente: o.textoCliente || "",
    limiteDia: Math.max(1, Math.min(40, Number(o.limiteDia) || 20)),
    intervaloMin: Math.max(2, Number(o.intervaloMin) || 4),
    intervaloMax: Math.max(3, Number(o.intervaloMax) || 9),
    faixas: Array.isArray(o.faixas) && o.faixas.length ? o.faixas : [["09:00", "11:30"], ["14:00", "17:00"]],
    inicioEm: o.inicioEm || "",
    itens,
    avisarGrupo: o.avisarGrupo ?? true,
  };
  await gravar(c);
  for (let k = 0; k < itens.length; k += 100) await redis(["SADD", K_NUMS, ...itens.slice(k, k + 100).map((x) => x.num)]).catch(() => {});
  return c;
}

export async function alterarCampanha(id: string, mud: Partial<Campanha>) {
  const c = await lerCampanha(id);
  if (!c) throw new Error("campanha não encontrada");
  const permitidos: (keyof Campanha)[] = ["ativa", "nome", "imagemUrl", "textoNovo", "textoCliente", "limiteDia", "intervaloMin", "intervaloMax", "faixas", "inicioEm", "avisarGrupo"];
  for (const k of permitidos) if (mud[k] !== undefined) (c as any)[k] = mud[k];
  await gravar(c);
  return c;
}

/** Hora de Brasília: dia da semana (0=dom) e minutos do dia. */
function agoraBR(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || "";
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dia: dias[g("weekday")] ?? 0, min: (Number(g("hour")) % 24) * 60 + Number(g("minute")), data: `${g("year")}-${g("month")}-${g("day")}` };
}
const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
// feriados nacionais que caem em dia útil no período das campanhas
const FERIADOS = new Set(["2026-12-25", "2027-01-01"]);

function dentroDoHorario(c: Campanha, d = new Date()) {
  const { dia, min, data } = agoraBR(d);
  if (dia === 0 || dia === 6 || FERIADOS.has(data)) return false;
  return c.faixas.some(([a, b]) => min >= minutos(a) && min < minutos(b));
}

function textoPara(c: Campanha, i: ItemCampanha) {
  const base = i.cliente && c.textoCliente ? c.textoCliente : c.textoNovo;
  return base.replace(/\{cidade\}/g, i.cidade || "").replace(/ {2,}/g, " ");
}

/** Envia o próximo da fila de cada campanha ativa (no máximo 1 por campanha por chamada). */
export async function tickCampanhas() {
  const livre = await redis<string | null>(["SET", "compass:campanha:tick", "1", "NX", "EX", 45]).catch(() => null);
  if (livre !== "OK") return { rodou: false };
  const ids = (await redis<string[]>(["SMEMBERS", K_LISTA]).catch(() => [])) || [];
  const feitos: any[] = [];
  for (const id of ids) {
    const c = await lerCampanha(id);
    if (!c || !c.ativa) continue;
    const agora = new Date();
    if (c.inicioEm && agora < new Date(c.inicioEm)) continue;
    if (!dentroDoHorario(c, agora)) continue;
    if (c.proximoEm && agora < new Date(c.proximoEm)) continue;
    const hoje = agoraBR(agora).data;
    const enviadosHoje = c.itens.filter((i) => i.enviadoEm && agoraBR(new Date(i.enviadoEm)).data === hoje).length;
    if (enviadosHoje >= c.limiteDia) continue;
    const optout = new Set((await redis<string[]>(["SMEMBERS", K_OPTOUT]).catch(() => [])) || []);
    const i = c.itens.find((x) => x.status === "pendente");
    if (!i) {
      c.ativa = false;
      await gravar(c);
      feitos.push({ id, fim: true });
      continue;
    }
    if (optout.has(i.num)) {
      i.status = "pulado";
      i.erro = "pediu para sair";
      await gravar(c);
      continue;
    }
    const texto = textoPara(c, i);
    try {
      const r: any = c.imagemUrl ? await enviarMidia(i.num, "image", c.imagemUrl, texto) : await enviarTexto(i.num, texto);
      i.status = "enviado";
      i.enviadoEm = new Date().toISOString();
      i.msgId = String(r?.messageid || r?.id || r?.key?.id || "");
      await redis(["SADD", K_NUMS, i.num]).catch(() => {});
      await registrarMensagem({ num: i.num, texto: c.imagemUrl ? "[foto] " + texto : texto, tipo: "campanha", deCompass: true, quando: Date.now(), id: i.msgId || `campanha-${c.id}-${i.num}` }).catch(() => {});
      feitos.push({ id, num: i.num, ok: true });
    } catch (e: any) {
      i.status = "erro";
      i.erro = String(e?.message || e).slice(0, 200);
      feitos.push({ id, num: i.num, erro: i.erro });
    }
    const espera = c.intervaloMin + Math.random() * Math.max(0, c.intervaloMax - c.intervaloMin);
    c.proximoEm = new Date(Date.now() + espera * 60000).toISOString();
    await gravar(c);
  }
  return { rodou: true, feitos };
}

/** Evento de leitura da uazapi (messages_update): guarda quando a mensagem / a conversa foi lida. */
export async function registrarLeitura(ids: string[], num: string | null) {
  const em = new Date().toISOString();
  for (const id of ids.filter(Boolean)) await redis(["SET", K_LIDO_MSG(id), em, "EX", 60 * 86400]).catch(() => {});
  if (num) await redis(["SET", K_LIDO_CHAT(num), em, "EX", 60 * 86400]).catch(() => {});
}

/** Mensagem do cliente: "SAIR" tira da lista; resposta a uma campanha avisa o grupo uma vez. */
export async function respostaCampanha(num: string, texto: string, avisar: (t: string) => Promise<void>) {
  const n = so(num);
  if (/^\s*(sair|parar|pare|stop|descadastrar)\s*[.!]?\s*$/i.test(texto || "")) {
    await redis(["SADD", K_OPTOUT, n]).catch(() => {});
    await enviarTexto(n, "Pronto, não vamos mais enviar este tipo de mensagem. Obrigado! 😊").catch(() => {});
    await registrarMensagem({ num: n, texto: "Pronto, não vamos mais enviar este tipo de mensagem. Obrigado! 😊", tipo: "campanha", deCompass: true, quando: Date.now(), id: `optout-${Date.now()}` }).catch(() => {});
    return { optout: true };
  }
  const ids = (await redis<string[]>(["SMEMBERS", K_LISTA]).catch(() => [])) || [];
  for (const id of ids) {
    const c = await lerCampanha(id);
    const i = c?.itens.find((x) => x.num === n && x.status === "enviado" && !x.respondeuEm);
    if (!c || !i) continue;
    i.respondeuEm = new Date().toISOString();
    await gravar(c);
    if (c.avisarGrupo) await avisar(`📣 *${i.unidade}* respondeu a campanha "${c.nome}": ${String(texto || "[mídia]").slice(0, 200)}`).catch(() => {});
  }
  return { optout: false };
}

/** Situação: totais e, por número, enviado / lido / respondeu (confere o histórico também). */
export async function statusCampanha(id: string) {
  const c = await lerCampanha(id);
  if (!c) throw new Error("campanha não encontrada");
  const optout = new Set((await redis<string[]>(["SMEMBERS", K_OPTOUT]).catch(() => [])) || []);
  for (const i of c.itens) {
    if (i.status !== "enviado" || !i.enviadoEm) continue;
    if (!i.lidoEm) {
      const porMsg = i.msgId ? await redis<string | null>(["GET", K_LIDO_MSG(i.msgId)]).catch(() => null) : null;
      const porChat = await redis<string | null>(["GET", K_LIDO_CHAT(i.num)]).catch(() => null);
      const lido = porMsg || (porChat && porChat >= i.enviadoEm ? porChat : null);
      if (lido) i.lidoEm = lido;
    }
    if (!i.respondeuEm) {
      const h = await historico(i.num, 40, 0).catch(() => []);
      const r = (h as any[]).find((m) => m.de === "cliente" && String(m.em) > String(i.enviadoEm));
      if (r) i.respondeuEm = r.em;
    }
  }
  await gravar(c);
  const conta = (f: (i: ItemCampanha) => boolean) => c.itens.filter(f).length;
  return {
    id: c.id,
    nome: c.nome,
    ativa: c.ativa,
    proximoEm: c.proximoEm || null,
    dentroDoHorarioAgora: dentroDoHorario(c),
    totais: {
      total: c.itens.length,
      pendentes: conta((i) => i.status === "pendente"),
      enviados: conta((i) => i.status === "enviado"),
      erros: conta((i) => i.status === "erro"),
      pulados: conta((i) => i.status === "pulado"),
      lidos: conta((i) => Boolean(i.lidoEm)),
      responderam: conta((i) => Boolean(i.respondeuEm)),
      saiu: conta((i) => optout.has(i.num)),
    },
    config: { limiteDia: c.limiteDia, intervalo: [c.intervaloMin, c.intervaloMax], faixas: c.faixas, inicioEm: c.inicioEm, imagemUrl: c.imagemUrl, textoNovo: c.textoNovo, textoCliente: c.textoCliente },
    itens: c.itens,
  };
}

export async function listarCampanhas() {
  const ids = (await redis<string[]>(["SMEMBERS", K_LISTA]).catch(() => [])) || [];
  const out = [];
  for (const id of ids) {
    const c = await lerCampanha(id);
    if (c) out.push({ id: c.id, nome: c.nome, ativa: c.ativa, total: c.itens.length, enviados: c.itens.filter((i) => i.status === "enviado").length, criadaEm: c.criadaEm });
  }
  return out;
}

/** true se o número recebeu (ou vai receber) campanha: o atendimento automático fica de fora, a equipe responde. */
export async function numeroEmCampanha(num: string) {
  if ((await redis<number>(["SISMEMBER", K_NUMS, so(num)]).catch(() => 0)) === 1) return true;
  // números de teste ficam fora do atendimento automático só por 3 dias (depois voltam a testar o agente)
  return Boolean(await redis<string | null>(["GET", `compass:campanha:teste:${so(num)}`]).catch(() => null));
}

/** Envio de teste imediato (fora da fila e do horário), para conferir texto e imagem. */
export async function testeCampanha(id: string, numeros: string[], cidade = "Teste", cliente = false) {
  const c = await lerCampanha(id);
  if (!c) throw new Error("campanha não encontrada");
  const out = [];
  for (const n of numeros.map(so).filter((x) => x.length >= 10)) {
    await redis(["SET", `compass:campanha:teste:${n}`, "1", "EX", 3 * 86400]).catch(() => {});
    const i: ItemCampanha = { num: n, unidade: "Teste", cidade, cliente, status: "pendente" };
    const texto = textoPara(c, i);
    try {
      const r: any = c.imagemUrl ? await enviarMidia(n, "image", c.imagemUrl, texto) : await enviarTexto(n, texto);
      await registrarMensagem({ num: n, texto: c.imagemUrl ? "[foto] " + texto : texto, tipo: "campanha", deCompass: true, quando: Date.now(), id: String(r?.messageid || r?.id || `teste-${Date.now()}`) }).catch(() => {});
      out.push({ num: n, ok: true, msgId: String(r?.messageid || r?.id || "") });
    } catch (e: any) {
      out.push({ num: n, ok: false, erro: String(e?.message || e).slice(0, 200) });
    }
  }
  return out;
}
