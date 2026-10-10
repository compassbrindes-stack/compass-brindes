import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { blingConectado } from "@/lib/bling-api";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * Situação da integração do grupo de recibos (uso interno).
 * /api/recibos?key=<LEADS_ADMIN_SECRET>
 * Mostra: Bling conectado?, grupos vistos pelo webhook (id e nome) e os
 * últimos recibos processados.
 */
export async function GET(request: Request) {
  const u = new URL(request.url);
  if (!isAdminAuthorized(u.searchParams.get("key"))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const [bling, grupos, log] = await Promise.all([
    blingConectado().catch((e) => ({ erro: String(e?.message || e) })),
    redis<string[]>(["HGETALL", "compass:wa:grupos"]).catch(() => []),
    redis<string[]>(["LRANGE", "compass:recibos:log", 0, 49]).catch(() => []),
  ]);
  const gruposObj: Record<string, string> = {};
  for (let i = 0; i + 1 < (grupos || []).length; i += 2) gruposObj[grupos[i]] = grupos[i + 1];
  return NextResponse.json({
    bling,
    grupoConfigurado: process.env.WA_GRUPO_RECIBOS || null,
    gruposVistos: gruposObj,
    recibos: (log || []).map((x) => {
      try {
        return JSON.parse(x);
      } catch {
        return x;
      }
    }),
  });
}
