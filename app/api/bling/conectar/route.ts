import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { blingConectado, urlAutorizacao } from "@/lib/bling-api";

export const dynamic = "force-dynamic";

/**
 * Liga o servidor do site ao Bling (uma vez só).
 * Abrir: /api/bling/conectar?key=<LEADS_ADMIN_SECRET>
 * → vai para a tela de autorização do Bling → volta em /api/bling/callback.
 * Com ?status=1 só mostra se já está conectado.
 */
export async function GET(request: Request) {
  const u = new URL(request.url);
  if (!isAdminAuthorized(u.searchParams.get("key"))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (u.searchParams.get("status")) return NextResponse.json(await blingConectado());
  try {
    return NextResponse.redirect(await urlAutorizacao());
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
