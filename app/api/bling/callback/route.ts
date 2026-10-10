import { concluirAutorizacao } from "@/lib/bling-api";

export const dynamic = "force-dynamic";

const pagina = (titulo: string, texto: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title><body style="font-family:system-ui;max-width:560px;margin:15vh auto;padding:0 16px;line-height:1.5"><h1 style="font-size:22px">${titulo}</h1><p>${texto}</p></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );

/** Volta da autorização do Bling (URL de redirecionamento do aplicativo). */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state") || "";
  if (!code) return pagina("Bling não autorizado", "A autorização foi cancelada ou não veio o código. Tente de novo.");
  try {
    await concluirAutorizacao(code, state);
    return pagina("Bling conectado ✅", "O servidor do site já consegue dar baixa nas contas a receber e a pagar pelo grupo Compass Recibos. Pode fechar esta página.");
  } catch (e: any) {
    const msg = String(e?.message || e).replace(/[<>&]/g, "");
    return pagina("Não foi possível conectar", msg);
  }
}
