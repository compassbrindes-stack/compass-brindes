// Envio automático da cotação para a Expresso São Miguel (WhatsApp com robô).
// Fluxo testado em 16/11/2026: "Oi" → botão do CNPJ → lista de localização (IRAI) →
// "Como podemos ajudar?" (Cotações) → protocolo / "Chat iniciado com <atendente>" → manda o texto
// da cotação → a atendente responde com uma imagem com o valor → lida e guardada no formulário.
// Uma cotação por vez (fila em Redis). Nada é enviado se o formulário estiver incompleto.
import { redis, redisGetJSON } from "@/lib/redis";
import { enviarTexto, baixarMidia } from "@/lib/uazapi";
import { registrarMensagem } from "@/lib/conversas";
import { lerFormFrete, salvarFormFrete, textoCotacaoSaoMiguel, completo, type FormFrete } from "@/lib/frete";

export const NUM_SAO_MIGUEL = process.env.SAO_MIGUEL_WHATS || "554933616666";
const CNPJ = "26123176000124";
const LOCAL = "IRAI";
const OPCAO = "Cotações";
const FLUXO = "compass:sm:fluxo";
const FILA = "compass:sm:fila";
const LIMITE_ROBO_MS = 15 * 60 * 1000; // sem resposta do robô em 15 min → erro
const LIMITE_ATENDENTE_MS = 4 * 60 * 60 * 1000; // aguardando atendente/valor até 4 h

type Passo = "oi" | "cnpj" | "local" | "opcao" | "atendente" | "enviado";
interface Fluxo { formId: string; passo: Passo; inicio: number; ultimo: number; protocolo?: string; atendente?: string }

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
export async function enfileirarSaoMiguel(formId: string) {
  const f = await lerFormFrete(formId);
  if (!f || !completo(f)) return { ok: false, motivo: "incompleto" };
  if (f.status === "enviado" || (f.auto && !["erro", "sem_resposta"].includes(f.auto.status))) return { ok: false, motivo: "já enviada ou em andamento" };
  await redis(["LREM", FILA, 0, formId]);
  await redis(["RPUSH", FILA, formId]);
  await marcar(formId, { auto: { status: "na_fila", em: new Date().toISOString() } });
  await proximo();
  return { ok: true };
}

async function proximo() {
  const atual = await redisGetJSON<Fluxo>(FLUXO);
  if (atual) {
    const parado = Date.now() - atual.ultimo;
    const limite = atual.passo === "atendente" || atual.passo === "enviado" ? LIMITE_ATENDENTE_MS : LIMITE_ROBO_MS;
    if (parado < limite) return; // ainda em andamento
    await marcar(atual.formId, { auto: { status: atual.passo === "enviado" ? "sem_resposta" : "erro", em: new Date().toISOString(), obs: `parou no passo "${atual.passo}"` } });
    await redis(["DEL", FLUXO]);
  }
  const id = await redis<string | null>(["LPOP", FILA]);
  if (!id) return;
  const fl: Fluxo = { formId: id, passo: "oi", inicio: Date.now(), ultimo: Date.now() };
  await redis(["SET", FLUXO, JSON.stringify(fl), "EX", 60 * 60 * 6]);
  await marcar(id, { auto: { status: "falando_com_robo", em: new Date().toISOString() } });
  await mandar("Oi");
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
  if (botoes.length && /continuar com a tratativa|contato anterior/i.test(texto)) {
    const nao = botoes.find((b) => /^n[aã]o\b|novo|nova/i.test(b));
    if (nao) { await mandar(nao); return salvarFluxo(fl); }
    await marcar(fl.formId, { auto: { status: "erro", em: new Date().toISOString(), obs: "robô perguntou sobre atendimento anterior: " + botoes.join(" / ") } });
    await redis(["DEL", FLUXO]); return proximo();
  }
  if (linhas.length && tem(linhas, LOCAL)) { await mandar(tem(linhas, LOCAL)!); return salvarFluxo({ ...fl, passo: "local" }); }
  if (linhas.length && tem(linhas, OPCAO)) { await mandar(tem(linhas, OPCAO)!); return salvarFluxo({ ...fl, passo: "opcao" }); }
  const prot = /protocolo[^0-9]*(\d{8,})/i.exec(texto);
  if (prot) { return salvarFluxo({ ...fl, protocolo: prot[1], passo: fl.passo === "enviado" ? "enviado" : "atendente" }); }
  const chat = /Chat iniciado com (.+?) em /i.exec(texto);
  if (chat && fl.passo !== "enviado") {
    const f = await lerFormFrete(fl.formId);
    if (!f) { await redis(["DEL", FLUXO]); return proximo(); }
    await new Promise((r) => setTimeout(r, 2500));
    const h = (new Date().getUTCHours() + 21) % 24;
    await mandar(`*Compass Brindes Corporativos:*\n${h < 12 ? "Bom dia" : "Boa tarde"}, segue cotação:`);
    await mandar(textoCotacaoSaoMiguel(f));
    await salvarFormFrete({ ...f, status: "enviado", enviadoEm: new Date().toISOString(), auto: { status: "aguardando_valor", em: new Date().toISOString(), protocolo: fl.protocolo, atendente: chat[1].trim() } });
    return salvarFluxo({ ...fl, passo: "enviado", atendente: chat[1].trim() });
  }
  // resposta da atendente: imagem com o valor
  if (fl.passo === "enviado" && /image|document/i.test(tipo)) {
    const lido = await lerCotacao(msg.messageid || msg.id).catch(() => null);
    await marcar(fl.formId, { auto: { status: "respondida", em: new Date().toISOString(), protocolo: fl.protocolo, atendente: fl.atendente, msgId: msg.messageid || msg.id, ...(lido || {}) } });
    return salvarFluxo(fl);
  }
  if (/atendimento (encerrado|finalizado)/i.test(texto)) {
    if (fl.passo !== "enviado") await marcar(fl.formId, { auto: { status: "erro", em: new Date().toISOString(), obs: "atendimento encerrado antes do envio" } });
    await redis(["DEL", FLUXO]);
    return proximo();
  }
  if (fl.passo !== "enviado" && !/selecione uma das op/i.test(texto)) return salvarFluxo(fl);
}

/** Lê a imagem/PDF da cotação (valor do frete, prazo, nº da cotação) com o Claude. */
async function lerCotacao(messageid: string): Promise<{ valor?: number; prazo?: string; numero?: string; obs?: string } | null> {
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
      messages: [{ role: "user", content: [bloco, { type: "text", text: 'Esta é uma cotação de frete de transportadora. Responda só com JSON: {"valor": valor total do frete em reais (número), "prazo": "prazo de entrega como aparece", "numero": "número da cotação", "obs": "observação curta relevante (ex.: validade)"}. Use null no que não aparecer.' }] }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const txt = (data?.content || []).map((x: any) => x.text || "").join("");
  const m = /\{[\s\S]*\}/.exec(txt);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const v = typeof j.valor === "number" ? j.valor : j.valor ? Number(String(j.valor).replace(/\./g, "").replace(",", ".")) : undefined;
    return { valor: isFinite(v as number) ? v : undefined, prazo: j.prazo || undefined, numero: j.numero ? String(j.numero) : undefined, obs: j.obs || undefined };
  } catch {
    return null;
  }
}

export async function situacaoSaoMiguel() {
  const fl = await redisGetJSON<Fluxo>(FLUXO);
  const fila = await redis<string[]>(["LRANGE", FILA, 0, -1]);
  return { emAndamento: fl, fila };
}
