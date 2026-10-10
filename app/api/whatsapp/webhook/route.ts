import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { processarRecibo } from "@/lib/recibos";
import { numeroDoChat, registrarMensagem } from "@/lib/conversas";

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

  const evento = norm(body.EventType || body.event || body.type);
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
    await registrarMensagem({
      num,
      nome: msg.fromMe ? "" : msg.senderName || body.chat?.wa_contactName || body.chat?.name || "",
      texto: msg.text || c0.caption || c0.text || "",
      tipo: String(msg.messageType || ""),
      deCompass: Boolean(msg.fromMe),
      quando: Number(msg.messageTimestamp) || Date.now(),
      id: msg.messageid || msg.id || "",
    }).catch(() => {});
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
