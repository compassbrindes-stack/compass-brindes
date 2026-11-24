import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { processarRecibo } from "@/lib/recibos";
import { numeroDoChat, registrarMensagem } from "@/lib/conversas";
import { NUM_SAO_MIGUEL, mensagemSaoMiguel, tickSaoMiguel } from "@/lib/saomiguel";
import { mensagemAprovacao } from "@/lib/aprovacao";
import { grupoEquipe, mensagemAgente, pausarAgente, tickAgente } from "@/lib/agente-leads";
import { numeroEmCampanha, registrarLeitura, respostaCampanha, tickCampanhas } from "@/lib/campanha";
import { enviarTexto } from "@/lib/uazapi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Webhook da uazapi (WhatsApp da Compass).
 *
 * Configurar na uazapi (POST /webhook da instância):
 *   url: https://<site>/api/whatsapp/webhook?s=<WA_WEBHOOK_SECRET>
 *   events: ["messages"]
 *   excludeMessages: ["wasSentByApi"]   ← evita responder às próprias respostas
 *
 * - Conversas individuais: registradas para o funil do painel (lib/conversas).
 * - Grupo de recibos ("Compass Recibos"): baixas no Bling (lib/recibos). O grupo é
 *   identificado pelo ID em WA_GRUPO_RECIBOS ou, se não configurado, pelo nome.
 * - Outros grupos: ignorados.
 */
const NOME_GRUPO = (process.env.WA_GRUPO_RECIBOS_NOME || "compass recibos").toLowerCase();

const norm = (s: unknown) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export async function POST(request: Request) {
  const segredo = process.env.WA_WEBHOOK_SECRET;
  const s = new URL(request.url).searchParams.get("s");
  if (!segredo || s !== segredo) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const body: any = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: true });

  // lembretes e avisos do atendimento automático (no máximo 1x por minuto)
  await tickAgente().catch(() => {});
  // campanhas de WhatsApp: envia o próximo da fila, se estiver no horário (lib/campanha)
  await tickCampanhas().catch(() => {});

  const evento = norm(body.EventType || body.event || body.type);
  // confirmação de leitura (evento messages_update, ligar na uazapi): marca campanhas como lidas
  if (evento.includes("update") || evento.includes("ack") || evento.includes("receipt")) {
    await redis(["LPUSH", "compass:wa:updates", JSON.stringify(body).slice(0, 4000)]).then(() => redis(["LTRIM", "compass:wa:updates", 0, 29])).catch(() => {});
    const ev = body.event || body.data || body.message || {};
    const estado = norm(ev.Type || ev.type || ev.state || ev.status || body.state || body.status || "");
    if (/read|lid|played|viewed/.test(estado)) {
      const ids: string[] = [].concat(ev.MessageIDs || ev.messageIds || ev.ids || ev.messageid || ev.id || body.messageid || []).map(String);
      const chatId = String(ev.Chat || ev.chat || ev.chatid || body.chat?.wa_chatid || "");
      const num = chatId && !chatId.endsWith("@g.us") ? numeroDoChat(chatId, body.chat?.wa_chatid) : null;
      await registrarLeitura(ids, num).catch(() => {});
    }
    return NextResponse.json({ ok: true, registrado: "leitura" });
  }
  if (evento && !evento.includes("message")) return NextResponse.json({ ok: true, ignorado: "evento" });

  const msg = body.message || body.data?.message || body.data || {};
  const chat: string = msg.chatid || body.chat?.wa_chatid || body.chat?.id || "";
  const isGroup = msg.isGroup ?? chat.endsWith("@g.us");
  if (!chat) return NextResponse.json({ ok: true, ignorado: "sem-chat" });
  if (msg.wasSentByApi) return NextResponse.json({ ok: true, ignorado: "api" });

  // conversa individual → registro para o funil do painel
  if (!isGroup) {
    const num = numeroDoChat(chat, msg.sender_pn || body.chat?.wa_chatid);
    if (!num) return NextResponse.json({ ok: true, ignorado: "sem-numero" });
    const c0 = typeof msg.content === "object" && msg.content ? msg.content : {};
    // mensagens de robô (botões/listas) e as nossas respostas a elas: guarda o conteúdo completo,
    // para entender o atendimento automático da transportadora (tool menu_whatsapp)
    if (/button|list|template|interactive/i.test(String(msg.messageType || ""))) {
      const bruto = JSON.stringify({ em: new Date(Number(msg.messageTimestamp) || Date.now()).toISOString(), deCompass: Boolean(msg.fromMe), tipo: msg.messageType, id: msg.messageid || msg.id || "", text: msg.text || "", content: msg.content ?? null, vote: msg.vote ?? null, buttonOrListid: msg.buttonOrListid ?? null }).slice(0, 20000);
      await redis(["LPUSH", `compass:wa:bruto:${num}`, bruto]).catch(() => {});
      await redis(["LTRIM", `compass:wa:bruto:${num}`, 0, 49]).catch(() => {});
    }
    await registrarMensagem({
      num,
      nome: msg.fromMe ? "" : msg.senderName || body.chat?.wa_contactName || body.chat?.name || "",
      texto: /list|button|template|interactive/i.test(String(msg.messageType || "")) && msg.content && !msg.fromMe ? "[menu] " + JSON.stringify(msg.content).slice(0, 2500) : msg.text || c0.caption || c0.text || "",
      tipo: String(msg.messageType || ""),
      deCompass: Boolean(msg.fromMe),
      quando: Number(msg.messageTimestamp) || Date.now(),
      id: msg.messageid || msg.id || "",
    }).catch(() => {});
    // cliente respondendo "APROVO" a um layout enviado para aprovação
    if (!msg.fromMe && num !== NUM_SAO_MIGUEL) await mensagemAprovacao(num, msg.text || c0.text || c0.caption || "").catch(() => {});
    // robô / atendente da Expresso São Miguel: segue o envio automático da cotação
    if (num === NUM_SAO_MIGUEL && !msg.fromMe) await mensagemSaoMiguel(msg).catch(() => {});
    else await tickSaoMiguel().catch(() => {});
    // atendimento automático dos leads novos (lib/agente-leads):
    // alguém da Compass escreveu pelo celular → o agente para nessa conversa;
    // mensagem do cliente → o agente responde (se o número estiver liberado)
    if (num !== NUM_SAO_MIGUEL) {
      if (msg.fromMe) await pausarAgente(num).catch(() => {});
      else if (await numeroEmCampanha(num)) {
        // número de campanha: o atendimento automático não entra, a equipe responde; "SAIR" tira da lista
        const r = await respostaCampanha(num, msg.text || c0.text || c0.caption || "", async (t) => {
          const g = await grupoEquipe();
          if (g) await enviarTexto(g, t);
        }).catch(() => ({ optout: false }));
        return NextResponse.json({ ok: true, registrado: "conversa", campanha: r });
      } else {
        // contato salvo na agenda do celular da Compass (nome do contato) = já conhecido: o agente não atende no modo "novos"
        const salvo = Boolean(String(body.chat?.wa_contactName || "").trim());
        await redis(["SET", "compass:agente:ultchat", JSON.stringify({ num, chat: body.chat || null, senderName: msg.senderName || "" }).slice(0, 3000), "EX", 86400]).catch(() => {});
        const r = await mensagemAgente({ num, nome: msg.senderName || body.chat?.wa_contactName || body.chat?.name || "", texto: msg.text || c0.text || c0.caption || "", id: msg.messageid || msg.id || "", salvo }).catch((e) => ({ acao: "erro", erro: String(e?.message || e).slice(0, 300) }));
        if ((r as any).acao === "erro") await redis(["LPUSH", "compass:agente:erros", JSON.stringify({ em: new Date().toISOString(), num, ...(r as any) })]).then(() => redis(["LTRIM", "compass:agente:erros", 0, 49])).catch(() => {});
        return NextResponse.json({ ok: true, registrado: "conversa", agente: (r as any).acao });
      }
    }
    return NextResponse.json({ ok: true, registrado: "conversa" });
  }

  const nomeChat = norm(body.chat?.name || body.chat?.wa_name || msg.groupName || msg.chatName || body.chat?.wa_contactName);
  const idConfig = process.env.WA_GRUPO_RECIBOS;
  const eRecibos = idConfig ? chat === idConfig : nomeChat === norm(NOME_GRUPO);

  // guarda os grupos vistos (id e nome) para facilitar a configuração
  if (nomeChat || chat) {
    await redis(["HSET", "compass:wa:grupos", chat, nomeChat || "(sem nome)"]).catch(() => {});
  }
  if (!eRecibos) return NextResponse.json({ ok: true, ignorado: "outro-grupo" });

  const content = typeof msg.content === "object" && msg.content ? msg.content : {};
  const texto: string = msg.text || content.caption || content.text || "";
  const tipo = String(msg.messageType || msg.type || "");
  const temMidia = /image|document|pdf/i.test(tipo) || Boolean(content.mimetype || content.URL || content.url);

  const r = await processarRecibo({
    chat,
    messageid: msg.messageid || msg.id,
    texto,
    temMidia,
    remetente: msg.senderName || msg.sender || "",
    quando: Number(msg.messageTimestamp) || Date.now(),
  });
  return NextResponse.json({ ok: true, resultado: (r as any).status || "ok" });
}

export async function GET() {
  return NextResponse.json({ ok: true, rota: "webhook uazapi" });
}
