import { NextResponse } from "next/server";
import { lerAprovacao, publicoAprovacao, responderAprovacao } from "@/lib/aprovacao";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const a = await lerAprovacao(ctx.params.id).catch(() => null);
  if (!a || a.status === "cancelado") return NextResponse.json({ error: "Link de aprovação não encontrado ou expirado." }, { status: 404 });
  return NextResponse.json(publicoAprovacao(a));
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const a = await lerAprovacao(ctx.params.id).catch(() => null);
  if (!a || a.status === "cancelado") return NextResponse.json({ error: "Link de aprovação não encontrado ou expirado." }, { status: 404 });
  const b: any = await req.json().catch(() => ({}));
  const acao = String(b.acao || "");
  const comentario = String(b.comentario || "").trim().slice(0, 1000);
  if (acao === "ajuste" && !comentario) return NextResponse.json({ error: "Conte o que precisa ajustar." }, { status: 400 });
  if (acao !== "aprovar" && acao !== "ajuste") return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  if (a.status === "aprovado" && acao === "ajuste") return NextResponse.json({ error: "Este layout já foi aprovado. Para mudar, fale com a Compass pelo WhatsApp." }, { status: 409 });
  const r = await responderAprovacao(a.id, acao === "aprovar" ? "aprovado" : "ajuste", "link", comentario);
  if (!r) return NextResponse.json({ error: "Não foi possível registrar." }, { status: 500 });
  return NextResponse.json({ ok: true, status: r.status });
}
