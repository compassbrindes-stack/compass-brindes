import { imagemAprovacao } from "@/lib/aprovacao";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: { id: string } }): Promise<Response> {
  const n = Math.max(0, Math.min(6, Number(new URL(req.url).searchParams.get("n")) || 0));
  const img = await imagemAprovacao(ctx.params.id, n).catch(() => null);
  if (!img) return new Response("Imagem não encontrada.", { status: 404 });
  const bytes = Buffer.from(img.b64, "base64");
  const mime = /^image\/(jpeg|png|webp)$/.test(img.mime) ? img.mime : "image/jpeg";
  return new Response(bytes, { headers: { "Content-Type": mime, "Cache-Control": "private, max-age=600" } });
}
