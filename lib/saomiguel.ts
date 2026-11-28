// Envio automático da cotação para a Expresso São Miguel (WhatsApp com robô).
// Fluxo testado em 16/11/2026: "Oi" → botão do CNPJ → lista de localização (IRAI) →
// "Como podemos ajudar?" (Cotações) → protocolo / "Chat iniciado com <atendente>" → manda o texto
// da cotação → a atendente responde com uma imagem com o valor → lida e guardada no formulário.
// Uma cotação por vez (fila em Redis). Nada é enviado se o formulário estiver incompleto.
import { registrarUsoClaude } from "@/lib/claude-gasto";
import { redis, redisGetJSON } from "@/lib/redis";
import { enviarTexto, baixarMidia } from "@/lib/uazapi";
import { registrarMensagem, historico } from "@/lib/conversas";
import { lerFormFrete, salvarFormFrete, textoCotacaoSaoMiguel, completo, type FormFrete } from "@/lib/frete";

export const NUM_SAO_MIGUEL = process.env.SAO_MIGUEL_WHATS || "554933616666";
const CNPJ = "26123176000124";
const LOCAL = "IRAI";
const OPCAO = "Cotações";
const FLUXO = "compass:sm:fluxo";
const FILA = "compass:sm:fila";
const LOTE = "compass:sm:lote"; // cotações separadas pela Compass para mandar juntas numa conversa só
const LIMITE_ROBO_MS = 15 * 60 * 1000; // sem resposta do robô em 15 min → erro
const LIMITE_ATENDENTE_MS = 4 * 60 * 60 * 1000; // aguardando atendente/valor até 4 h

type Passo = "oi" | "cnpj" | "local" | "opcao" | "atendente" | "enviado";
interface Fluxo { formId: string; passo: Passo; inicio: number; ultimo: number; protocolo?: string; atendente?: string; pausado?: boolean; lote?: string[] }

/** Horário da São Miguel: seg–sex 08:00–12:00 e 13:30–18:00; sáb 08:00–11:30 (Brasília).
 *  Começa um envio só com folga de 15 min antes de fechar. */
// feriados nacionais (sem expediente na transportadora)
const FERIADOS = new Set([
  "2026-01-01","2026-02-16","2026-02-17","2026-04-03","2026-04-21","2026-05-01","2026-06-04","2026-09-07","2026-10-12","2026-11-02","2026-11-15","2026-11-20","2026-12-25",
  "2027-01-01","2027-02-08","2027-02-09","2027-03-26","2027-04-21","2027-05-01","2027-05-27","2027-09-07","2027-10-12","2027-11-02","2027-11-15","2027-11-20","2027-12-25",
]);
const JANELAS = (dia: number) => (dia >= 1 && dia <= 5 ? [[480, 720], [810, 1080]] : dia === 6 ? [[480, 690]] : []);
export function abertoSaoMiguel(d = new Date(), folgaMin = 15): boolean {
  const br = new Date(d.getTime() - 3 * 3600 * 1000);
  if (FERIADOS.has(br.toISOString().slice(0, 10))) return false;
  const dia = br.getUTCDay();
  const m = br.getUTCHours() * 60 + br.getUTCMinutes();
  return JANELAS(dia).some(([a, b]) => m >= a && m < b - folgaMin);
}

/** Próxima abertura da São Miguel a partir de agora (horário de Brasília), em texto: "hoje às 13h30", "segunda-feira (23/11) às 08h00". */
export function proximaAbertura(d = new Date()): string {
  const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const agoraBr = new Date(d.getTime() - 3 * 3600 * 1000);
  for (let k = 0; k < 15; k++) {
    const dia = new Date(Date.UTC(agoraBr.getUTCFullYear(), agoraBr.getUTCMonth(), agoraBr.getUTCDate() + k));
    if (FERIADOS.has(dia.toISOString().slice(0, 10))) continue;
    const mAgora = k === 0 ? agoraBr.getUTCHours() * 60 + agoraBr.getUTCMinutes() : -1;
    const ini = JANELAS(dia.getUTCDay()).map(([a]) => a).find((a) => a > mAgora);
    if (ini == null) continue;
    const hh = String(Math.floor(ini / 60)).padStart(2, "0") + "h" + String(ini % 60).padStart(2, "0");
    const dd = `${String(dia.getUTCDate()).padStart(2, "0")}/${String(dia.getUTCMonth() + 1).padStart(2, "0")}`;
    return k === 0 ? `hoje às ${hh}` : k === 1 ? `amanhã (${dd}) às ${hh}` : `${DIAS[dia.getUTCDay()]} (${dd}) às ${hh}`;
  }
  return "no próximo dia útil";
}
export const HORARIO_SM = "de segunda a sexta, das 8h às 12h e das 13h30 às 18h, e aos sábados das 8h às 11h30";

async function mandar(texto: string) {
  await enviarTexto(NUM_SAO_MIGUEL, texto);
  const q = Date.now();
  await registrarMensagem({ num: NUM_SAO_MIGUEL, texto, tipo: "conversation", deCompass: true, quando: q, id: "auto-" + q }).catch(() => {});
}

async function marcar(id: string, campos: Partial<FormFrete>) {
  const f = await lerFormFrete(id);
  if (f) await salvarFormFrete({ ...f, ...campos });
}

/** Coloca a cotação na fila e começa se não houver outra em andamento. */
export async function enfileirarSaoMiguel(formId: string, opts: { segurar?: boolean } = {}) {
  const f = await lerFormFrete(formId);
  if (!f || !completo(f)) return { ok: false, motivo: "incompleto" };
  if (f.status === "enviado" || (f.auto && !["erro", "sem_resposta", "no_lote"].includes(f.auto.status))) return { ok: false, motivo: "já enviada ou em andamento" };
  if (opts.segurar) {
    // separa para o lote: não começa ainda, espera "Enviar lote"
    await redis(["LREM", LOTE, 0, formId]);
    await redis(["RPUSH", LOTE, formId]);
    await marcar(formId, { auto: { status: "no_lote", em: new Date().toISOString() } });
    const n = await redis<number>(["LLEN", LOTE]);
    return { ok: true, noLote: n };
  }
  await redis(["LREM", LOTE, 0, formId]);
  await redis(["LREM", FILA, 0, formId]);
  await redis(["RPUSH", FILA, formId]);
  const aberto = abertoSaoMiguel();
  const previsao = aberto ? "" : proximaAbertura();
  await marcar(formId, { auto: aberto ? { status: "na_fila", em: new Date().toISOString() } : { status: "aguardando_horario", em: new Date().toISOString(), obs: "envio previsto " + previsao } });
  // avisa o cliente pelo WhatsApp (se a Compass informou o número ao criar o link)
  const wc = String(f.whatsCliente || "").replace(/\D/g, "");
  if (wc.length >= 12) {
    const txt = aberto
      ? `Olá! Recebemos os dados de entrega ✅ Já estamos cotando o frete com a transportadora e retornamos com o valor em seguida.`
      : `Olá! Recebemos os dados de entrega ✅ A transportadora atende ${HORARIO_SM}. Sua cotação será enviada ${previsao} e retornamos com o valor assim que eles responderem.`;
    await enviarTexto(wc, txt).catch(() => {});
    const q = Date.now();
    await registrarMensagem({ num: wc, texto: txt, tipo: "conversation", deCompass: true, quando: q, id: "auto-" + q }).catch(() => {});
  }
  await proximo();
  return { ok: true, aberto, previsao };
}

/** Manda à São Miguel todas as cotações separadas no lote, numa conversa só. */
export async function iniciarLoteSaoMiguel() {
  const ids = (await redis<string[]>(["LRANGE", LOTE, 0, -1])) || [];
  await redis(["DEL", LOTE]);
  const aberto = abertoSaoMiguel();
  const previsao = aberto ? "" : proximaAbertura();
  let n = 0;
  for (const id of ids) {
    const f = await lerFormFrete(id);
    if (!f || !completo(f) || f.status === "enviado") continue;
    await redis(["LREM", FILA, 0, id]);
    await redis(["RPUSH", FILA, id]);
    await marcar(id, { auto: aberto ? { status: "na_fila", em: new Date().toISOString(), obs: "lote" } : { status: "aguardando_horario", em: new Date().toISOString(), obs: "lote · envio previsto " + previsao } });
    n++;
  }
  await proximo();
  return { ok: n > 0, enviadas: n, aberto, previsao };
}
export async function tirarDoLote(formId: string) {
  await redis(["LREM", LOTE, 0, formId]);
  await marcar(formId, { auto: undefined as any });
  return { ok: true };
}

/** Todas as cotações do fluxo já têm o valor (respondidas)? */
async function todasRespondidas(fl: Fluxo): Promise<boolean> {
  for (const id of fl.lote && fl.lote.length ? fl.lote : [fl.formId]) {
    const f = await lerFormFrete(id);
    if (f && f.status !== "cancelado" && f.auto?.status !== "respondida") return false;
  }
  return true;
}

async function proximo(): Promise<void> {
  const atual = await redisGetJSON<Fluxo>(FLUXO);
  if (atual) {
    if (atual.pausado) { if (Date.now() - atual.ultimo < 20 * 3600 * 1000) return; }
    const parado = Date.now() - atual.ultimo;
    const limite = atual.passo === "atendente" || atual.passo === "enviado" ? LIMITE_ATENDENTE_MS : LIMITE_ROBO_MS;
    if (atual.passo === "enviado") await recuperarImagens(atual);
    // tudo respondido: libera a fila na hora (antes ficava travada até 4 h esperando, 25/11)
    if (atual.passo === "enviado" && (await todasRespondidas(atual))) { await redis(["DEL", FLUXO]); }
    else if (parado < limite) return; // ainda em andamento
    else {
    for (const id of atual.lote && atual.lote.length ? atual.lote : [atual.formId]) {
      const f = await lerFormFrete(id);
      if (f && f.auto?.status !== "respondida") await salvarFormFrete({ ...f, auto: { ...(f.auto || {}), status: atual.passo === "enviado" ? "sem_resposta" : "erro", em: new Date().toISOString(), obs: `parou no passo "${atual.passo}"` } });
    }
    await redis(["DEL", FLUXO]);
    }
  }
  if (!abertoSaoMiguel()) {
    // fora do horário: fica na fila e começa sozinho quando abrir (qualquer mensagem no WhatsApp ou o painel aberto dispara)
    const ids = await redis<string[]>(["LRANGE", FILA, 0, -1]);
    for (const i of ids || []) { const f = await lerFormFrete(i); if (f && f.auto?.status !== "aguardando_horario") await salvarFormFrete({ ...f, auto: { status: "aguardando_horario", em: new Date().toISOString(), obs: "envio previsto " + proximaAbertura() } }); }
    return;
  }
  // pula cancelados, já enviados e incompletos (ex.: cliques repetidos no botão verde)
  let id: string | null = null;
  for (let k = 0; k < 30 && !id; k++) {
    const x = await redis<string | null>(["LPOP", FILA]);
    if (!x) return;
    const f = await lerFormFrete(x);
    if (f && completo(f) && f.status !== "enviado" && f.status !== "cancelado") id = x;
  }
  if (!id) return;
  const fl: Fluxo = { formId: id, passo: "oi", inicio: Date.now(), ultimo: Date.now() };
  await redis(["SET", FLUXO, JSON.stringify(fl), "EX", 60 * 60 * 6]);
  const pessoa = await atendenteAberto();
  if (pessoa) return enviarCotacoes({ ...fl, passo: "atendente", atendente: pessoa }, pessoa);
  await marcar(id, { auto: { status: "falando_com_robo", em: new Date().toISOString() } });
  await mandar("Oi");
}


// frases do robô (o resto, em texto livre, é uma pessoa)
const ROBO = /boas-vindas|selecione|escolha uma op|protocolo|aguarde enquanto|transfiro|hor[aá]rio de atendimento|atendimento (encerrado|finalizado)|pesquisa de satisfa|como voc[eê] avalia|deseja continuar|agradecemos seu contato|localizei seu cadastro|chat iniciado/i;

/** Manda a cotação do fluxo e as outras da fila, numa conversa só, para a atendente. */
async function enviarCotacoes(fl: Fluxo, atendente: string): Promise<void> {
  const forms: FormFrete[] = [];
  const f0 = await lerFormFrete(fl.formId);
  if (f0 && f0.status !== "enviado" && f0.status !== "cancelado" && completo(f0)) forms.push(f0);
  for (let k = 0; k < 15; k++) {
    const id = await redis<string | null>(["LPOP", FILA]);
    if (!id) break;
    const f = await lerFormFrete(id);
    if (f && completo(f) && f.status !== "enviado" && f.status !== "cancelado" && !forms.some((x) => x.id === f.id)) forms.push(f);
  }
  if (!forms.length) { await redis(["DEL", FLUXO]); return proximo(); }
  await salvarFluxo({ ...fl, passo: "enviado", atendente, lote: forms.map((f) => f.id) });
  await new Promise((r) => setTimeout(r, 2000));
  const h = (new Date().getUTCHours() + 21) % 24;
  await mandar(`*Compass Brindes Corporativos:*\n${h < 12 ? "Bom dia" : "Boa tarde"}, ${forms.length > 1 ? `seguem ${forms.length} cotações:` : "segue cotação:"}`);
  for (let i = 0; i < forms.length; i++) {
    const f = forms[i];
    const t = textoCotacaoSaoMiguel(f);
    await mandar(forms.length > 1 ? `*Cotação ${i + 1} de ${forms.length}*\n` + t : t);
    if (forms.length > 1) await new Promise((r) => setTimeout(r, 1200));
    await salvarFormFrete({ ...f, status: "enviado", enviadoEm: new Date().toISOString(), auto: { status: "aguardando_valor", em: new Date().toISOString(), protocolo: fl.protocolo, atendente, ...(forms.length > 1 ? { obs: `cotação ${i + 1} de ${forms.length}` } : {}) } });
  }
}

/** Conversa com atendente ainda aberta? (último "Chat iniciado" depois do último "encerrado", nas últimas 10 h) */
async function atendenteAberto(): Promise<string | null> {
  const msgs: any[] = await historico(NUM_SAO_MIGUEL, 60).catch(() => []);
  let aberto: string | null = null, quando = 0;
  for (const m of msgs) {
    if (m.de !== "cliente") continue;
    const t = String(m.texto || "");
    const c = /Chat iniciado com (.+?) em /i.exec(t);
    if (c) { aberto = c[1].trim(); quando = Date.parse(m.em) || 0; }
    else if (/atendimento (encerrado|finalizado)|agradecemos seu contato/i.test(t)) aberto = null;
  }
  return aberto && Date.now() - quando < 10 * 3600 * 1000 ? aberto : null;
}

/** Já há uma pessoa na conversa: manda as cotações agora, sem passar pelo robô. */
export async function forcarEnvioSaoMiguel() {
  let fl = await redisGetJSON<Fluxo>(FLUXO);
  if (!fl) {
    const id = await redis<string | null>(["LPOP", FILA]);
    if (!id) return { ok: false, motivo: "nada na fila" };
    fl = { formId: id, passo: "atendente", inicio: Date.now(), ultimo: Date.now() };
  }
  if (fl.passo === "enviado") return { ok: false, motivo: "já enviado" };
  await enviarCotacoes(fl, fl.atendente || "atendente");
  return { ok: true };
}

const salvarFluxo = (fl: Fluxo) => redis(["SET", FLUXO, JSON.stringify({ ...fl, ultimo: Date.now() }), "EX", 60 * 60 * 6]);

/** Chamado pelo webhook para cada mensagem recebida da São Miguel. */
export async function mensagemSaoMiguel(msg: any) {
  const fl = await redisGetJSON<Fluxo>(FLUXO);
  if (!fl) return;
  const tipo = String(msg.messageType || "");
  const c = typeof msg.content === "object" && msg.content ? msg.content : {};
  const texto = String(msg.text || c.text || c.contentText || c.description || "");
  const botoes: string[] = (c.buttons || []).map((b: any) => String(b?.buttonText?.displayText || b?.buttonID || ""));
  const linhas: string[] = (c.sections || []).flatMap((s: any) => (s.rows || []).map((r: any) => String(r.title || "")));
  const tem = (lista: string[], alvo: string) => lista.find((x) => x.trim().toLowerCase() === alvo.toLowerCase());

  // robô
  if (botoes.length && tem(botoes, CNPJ) && ["oi", "cnpj"].includes(fl.passo)) { await mandar(CNPJ); return salvarFluxo({ ...fl, passo: "cnpj" }); }
  if (/hor[aá]rio de atendimento [eé] de/i.test(texto)) {
    // a São Miguel está fora do horário: espera reabrir (eles mesmos retomam a conversa)
    await marcar(fl.formId, { auto: { status: "aguardando_horario", em: new Date().toISOString(), obs: "São Miguel fora do horário; retoma quando abrirem" } });
    return salvarFluxo({ ...fl, pausado: true });
  }
  if (botoes.length && /continuar com a tratativa|contato anterior/i.test(texto)) {
    // se o atendimento anterior é ESTA cotação (já pedimos "Cotações"), continua; senão começa um novo
    const continuar = fl.pausado || ["opcao", "atendente"].includes(fl.passo);
    const esc = continuar ? botoes.find((b) => /^sim\b|continuar/i.test(b)) : botoes.find((b) => /^n[aã]o\b|novo|nova/i.test(b));
    if (esc) { await mandar(esc); if (continuar) await marcar(fl.formId, { auto: { status: "falando_com_robo", em: new Date().toISOString(), obs: "retomado após o horário" } }); return salvarFluxo({ ...fl, pausado: false }); }
    await marcar(fl.formId, { auto: { status: "erro", em: new Date().toISOString(), obs: "robô perguntou sobre atendimento anterior: " + botoes.join(" / ") } });
    await redis(["DEL", FLUXO]); return proximo();
  }
  if (linhas.length && tem(linhas, LOCAL)) { await mandar(tem(linhas, LOCAL)!); return salvarFluxo({ ...fl, passo: "local" }); }
  if (linhas.length && tem(linhas, OPCAO)) { await mandar(tem(linhas, OPCAO)!); return salvarFluxo({ ...fl, passo: "opcao" }); }
  const prot = /protocolo[^0-9]*(\d{8,})/i.exec(texto);
  if (prot) { return salvarFluxo({ ...fl, protocolo: prot[1], passo: fl.passo === "enviado" ? "enviado" : "atendente" }); }
  const chat = /Chat iniciado com (.+?) em /i.exec(texto);
  if (chat && fl.passo !== "enviado") return enviarCotacoes(fl, chat[1].trim());
  // já falando com uma pessoa (conversa anterior ainda aberta): ela responde em texto livre, sem menu do robô
  if (["oi", "cnpj", "local", "opcao", "atendente"].includes(fl.passo) && !botoes.length && !linhas.length && texto.trim() && !ROBO.test(texto) && !/image|document|audio|sticker/i.test(tipo)) return enviarCotacoes(fl, fl.atendente || "atendente");
  // resposta da atendente: imagem com o valor
  if (fl.passo === "enviado" && /image|document/i.test(tipo)) {
    await ligarImagem(fl, msg.messageid || msg.id);
    // todas respondidas: libera e já manda a próxima da fila (a atendente ainda está na conversa)
    if (await todasRespondidas(fl)) { await redis(["DEL", FLUXO]); return proximo(); }
    return salvarFluxo(fl);
  }
  if (/atendimento (encerrado|finalizado)/i.test(texto)) {
    if (fl.passo !== "enviado") await marcar(fl.formId, { auto: { status: "erro", em: new Date().toISOString(), obs: "atendimento encerrado antes do envio" } });
    await redis(["DEL", FLUXO]);
    return proximo();
  }
  if (fl.passo !== "enviado" && !/selecione uma das op/i.test(texto)) return salvarFluxo(fl);
}


/** Lê a imagem da atendente e grava o valor na cotação certa do lote. Devolve o id do formulário respondido. */
async function ligarImagem(fl: Fluxo, msgId: string): Promise<string | null> {
    const lido = await lerCotacao(msgId).catch(() => null);
    const ids = fl.lote && fl.lote.length ? fl.lote : [fl.formId];
    const pend: FormFrete[] = [];
    for (const id of ids) { const f = await lerFormFrete(id); if (f && f.auto?.status !== "respondida") pend.push(f); }
    if (!pend.length) return null;

    // com várias cotações, acha de qual é a imagem pelo destinatário, cidade ou valor da NF
    const semA = (x: string) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const pontos = (f: FormFrete) => {
      if (!lido) return 0;
      let p = 0;
      const nome = semA(f.dest?.nome || ""), dn = semA(lido.destinatario || "");
      if (dn && nome) p += nome.split(/\W+/).filter((w) => w.length > 3 && dn.includes(w)).length * 2;
      const cid = semA(f.dest?.cidade || ""), lc = semA(lido.cidade || "");
      if (cid && lc && (lc.includes(cid) || cid.includes(lc))) p += 3;
      const nf = parseFloat(String(f.valorNF || "").replace(/\./g, "").replace(",", "."));
      if (lido.valorNF && nf && Math.abs(lido.valorNF - nf) < 1) p += 4;
      return p;
    };
    const ord = pend.map((f) => ({ f, p: pontos(f) })).sort((a, b) => b.p - a.p);
    const alvo = ord[0].p > 0 || pend.length === 1 ? ord[0].f : pend[0];
    const incerto = pend.length > 1 && ord[0].p === 0;
    const { destinatario, cidade, valorNF, ...valores } = lido || ({} as any);
    await salvarFormFrete({ ...alvo, auto: { ...(alvo.auto || {}), status: "respondida", em: new Date().toISOString(), protocolo: fl.protocolo, atendente: fl.atendente, msgId, ...valores, ...(incerto ? { obs: "conferir: imagem ligada pela ordem de chegada" } : {}) } });
    return alvo.id;
}

/** Imagens da São Miguel no histórico desde o início do fluxo que ainda não foram lidas (webhook perdido). */
async function recuperarImagens(fl: Fluxo): Promise<void> {
  const msgs: any[] = await historico(NUM_SAO_MIGUEL, 60).catch(() => []);
  const ids = fl.lote && fl.lote.length ? fl.lote : [fl.formId];
  const usados = new Set<string>();
  for (const id of ids) { const f = await lerFormFrete(id); if (f?.auto?.msgId) usados.add(f.auto.msgId); }
  for (const m of msgs) {
    if (m.de !== "cliente" || !m.id || usados.has(m.id)) continue;
    if ((Date.parse(m.em) || 0) < fl.inicio - 60000) continue;
    if (!/image|document/i.test(String(m.tipo || "")) && !/\.(png|jpe?g|webp|pdf)$/i.test(String(m.texto || "").trim())) continue;
    const r = await ligarImagem(fl, m.id);
    if (r) usados.add(m.id); else break;
  }
}

/** Grava à mão o resultado de uma cotação (valor informado ou imagem já recebida no WhatsApp). */
export async function informarCotacao(id: string, d: { valor?: number; prazo?: string; numero?: string; obs?: string; msgId?: string }) {
  const f = await lerFormFrete(id);
  if (!f) return { ok: false, motivo: "formulário não encontrado" };
  let lido: any = null;
  if (d.msgId) { lido = await lerCotacao(d.msgId).catch(() => null); if (lido) { delete lido.destinatario; delete lido.cidade; delete lido.valorNF; } }
  const extra: any = { ...(lido || {}) };
  for (const k of ["valor", "prazo", "numero", "obs"] as const) if (d[k] != null && d[k] !== "") extra[k] = d[k];
  if (extra.valor == null) return { ok: false, motivo: d.msgId ? "não consegui ler o valor da imagem" : "informe o valor" };
  await salvarFormFrete({ ...f, status: "enviado", enviadoEm: f.enviadoEm || new Date().toISOString(), auto: { ...(f.auto || {}), status: "respondida", em: new Date().toISOString(), ...(d.msgId ? { msgId: d.msgId } : {}), ...extra } as any });
  return { ok: true, id, ...extra };
}

/** Lê a imagem/PDF da cotação (valor do frete, prazo, nº da cotação) com o Claude. */
async function lerCotacao(messageid: string): Promise<{ valor?: number; prazo?: string; numero?: string; obs?: string; destinatario?: string; cidade?: string; valorNF?: number } | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !messageid) return null;
  const arq = await baixarMidia(messageid);
  if (!arq.fileURL) return null;
  const r = await fetch(arq.fileURL, { cache: "no-store" });
  if (!r.ok) return null;
  const b64 = Buffer.from(await r.arrayBuffer()).toString("base64");
  const mime = String(arq.mimetype || "image/jpeg");
  const bloco = /pdf/i.test(mime)
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
    : { type: "image", source: { type: "base64", media_type: /png/i.test(mime) ? "image/png" : "image/jpeg", data: b64 } };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: [bloco, { type: "text", text: 'Esta é uma cotação de frete de transportadora. Responda só com JSON: {"valor": valor total do frete em reais (número), "prazo": "prazo de entrega como aparece", "numero": "número da cotação", "obs": "observação curta relevante (ex.: validade)", "destinatario": "nome do destinatário", "cidade": "cidade de destino", "valorNF": valor da nota fiscal em reais (número)}. Use null no que não aparecer.' }] }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  await registrarUsoClaude(data?.model || process.env.ANTHROPIC_MODEL || "claude-haiku-4-5", data?.usage, "frete São Miguel");
  const txt = (data?.content || []).map((x: any) => x.text || "").join("");
  const m = /\{[\s\S]*\}/.exec(txt);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const v = typeof j.valor === "number" ? j.valor : j.valor ? Number(String(j.valor).replace(/\./g, "").replace(",", ".")) : undefined;
    const vnf = typeof j.valorNF === "number" ? j.valorNF : j.valorNF ? Number(String(j.valorNF).replace(/\./g, "").replace(",", ".")) : undefined;
    return { valor: isFinite(v as number) ? v : undefined, prazo: j.prazo || undefined, numero: j.numero ? String(j.numero) : undefined, obs: j.obs || undefined, destinatario: j.destinatario || undefined, cidade: j.cidade || undefined, valorNF: isFinite(vnf as number) ? vnf : undefined };
  } catch {
    return null;
  }
}

export async function situacaoSaoMiguel() {
  const fl = await redisGetJSON<Fluxo>(FLUXO);
  const fila = await redis<string[]>(["LRANGE", FILA, 0, -1]);
  const lote = await redis<string[]>(["LRANGE", LOTE, 0, -1]);
  return { emAndamento: fl, fila, lote };
}

/** Chamado em qualquer movimento (webhook, painel): começa a fila quando a São Miguel abrir. */
export async function tickSaoMiguel() {
  const n = await redis<number>(["LLEN", FILA]).catch(() => 0);
  const fl = await redisGetJSON<Fluxo>(FLUXO).catch(() => null);
  if (n || fl) await proximo();
}
