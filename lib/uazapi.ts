// Chamadas à uazapi (WhatsApp da Compass). UAZAPI_URL e UAZAPI_TOKEN (token
// da instância) ficam nas variáveis de ambiente da Vercel.

function cfg() {
  const url = (process.env.UAZAPI_URL || "").replace(/\/$/, "");
  const token = process.env.UAZAPI_TOKEN || "";
  if (!url || !token) throw new Error("UAZAPI_URL / UAZAPI_TOKEN não configurados na Vercel.");
  return { url, token };
}

export async function enviarTexto(chat: string, text: string, replyid?: string) {
  const { url, token } = cfg();
  const res = await fetch(`${url}/send/text`, {
    method: "POST",
    headers: { token, "Content-Type": "application/json" },
    body: JSON.stringify({ number: chat, text, ...(replyid ? { replyid } : {}) }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`uazapi /send/text ${res.status}`);
}

/** Envia foto, PDF ou outro arquivo (file = URL ou base64). type: image | video | document | audio. */
export async function enviarMidia(chat: string, type: string, file: string, legenda?: string, docName?: string) {
  const { url, token } = cfg();
  const res = await fetch(`${url}/send/media`, {
    method: "POST",
    headers: { token, "Content-Type": "application/json" },
    body: JSON.stringify({ number: chat, type, file, ...(legenda ? { text: legenda } : {}), ...(docName ? { docName } : {}) }),
    cache: "no-store",
  });
  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    throw new Error(`uazapi /send/media ${res.status} ${corpo.slice(0, 200)}`);
  }
}

/** Link público (válido por 2 dias) e tipo do arquivo de uma mensagem com mídia. */
export async function baixarMidia(messageid: string): Promise<{ fileURL?: string; mimetype?: string }> {
  const { url, token } = cfg();
  const res = await fetch(`${url}/message/download`, {
    method: "POST",
    headers: { token, "Content-Type": "application/json" },
    body: JSON.stringify({ id: messageid, return_link: true }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`uazapi /message/download ${res.status}`);
  return res.json();
}
