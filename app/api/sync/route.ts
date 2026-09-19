import { NextResponse } from "next/server";
import { checkBusinessHours } from "@/lib/business-hours";
import { connectors } from "@/lib/suppliers";

export const dynamic = "force-dynamic";

/**
 * Sincroniza o catálogo com os fornecedores (XBZ, Asia Import, Spot Gifts).
 *
 * As APIs dos fornecedores só podem ser chamadas em horário comercial
 * (seg–sex, 08h–18h, horário de Brasília). Fora desse período a rota não
 * chama os fornecedores e devolve `skipped: true`.
 *
 * Protegida por um segredo simples: envie o cabeçalho
 *   Authorization: Bearer <SYNC_SECRET>
 * O valor de SYNC_SECRET fica configurado nas variáveis de ambiente do Vercel
 * — nunca no código.
 *
 * O agendamento automático (vercel.json) já roda só nesse horário; esta
 * checagem aqui é uma segunda trava, para o caso de alguém disparar a rota
 * manualmente ou o agendamento mudar de fuso.
 */
export async function GET(request: Request) {
  const secret = process.env.SYNC_SECRET;
  const authHeader = request.headers.get("authorization");

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const businessHours = checkBusinessHours();

  if (!businessHours.isBusinessHours) {
    return NextResponse.json({
      skipped: true,
      reason: "Fora do horário comercial (seg–sex, 08h–18h, horário de Brasília).",
      businessHours,
    });
  }

  const settled = await Promise.all(connectors.map((connector) => connector.fetchProducts()));
  const results = settled.map((s) => s.result);
  const totalProducts = settled.reduce((sum, s) => sum + s.products.length, 0);

  // TODO: quando houver um banco de dados (ex.: Vercel Postgres/KV), persistir
  // `settled.flatMap(s => s.products)` aqui. Por enquanto o catálogo é montado
  // sob demanda em lib/products.ts a cada requisição.

  return NextResponse.json({
    skipped: false,
    checkedAt: new Date().toISOString(),
    businessHours,
    totalProducts,
    results,
  });
}
