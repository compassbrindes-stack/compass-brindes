import { NextResponse } from "next/server";
import { tickCampanhas } from "@/lib/campanha";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Chamado de tempos em tempos (GitHub Actions a cada 10 min, seg–sex) para a fila de campanhas
// andar mesmo sem mensagens chegando. Só envia dentro do horário, com intervalo e limite por dia.
export async function GET() {
  const r = await tickCampanhas().catch((e) => ({ erro: String(e?.message || e) }));
  return NextResponse.json(r);
}
