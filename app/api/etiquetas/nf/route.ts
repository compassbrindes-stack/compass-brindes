import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { dadosEtiquetaNf } from "@/lib/etiquetas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/etiquetas/nf?numero=321  (cabeçalho Authorization: Bearer <chave da área restrita>)
export async function GET(req: Request) {
  const u = new URL(req.url);
  const chave = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || u.searchParams.get("key") || "";
  if (!isAdminAuthorized(chave)) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  try {
    const dados = await dadosEtiquetaNf(u.searchParams.get("numero") || "");
    return NextResponse.json(dados);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Não foi possível buscar a NF." }, { status: 400 });
  }
}
