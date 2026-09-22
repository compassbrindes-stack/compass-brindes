import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { listCatalogLeads } from "@/lib/catalog-leads";

export const dynamic = "force-dynamic";

function csvEscape(valor: string): string {
  if (/[",\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

export async function GET(request: NextRequest) {
  const key =
    request.nextUrl.searchParams.get("key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;

  if (!isAdminAuthorized(key)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const leads = await listCatalogLeads();

  const cabecalho = ["Data", "Nome", "Sobrenome", "Empresa", "E-mail", "Telefone"];
  const linhas = leads.map((lead) =>
    [lead.createdAt, lead.nome, lead.sobrenome, lead.empresa, lead.email, lead.telefone]
      .map(csvEscape)
      .join(",")
  );

  const csv = [cabecalho.join(","), ...linhas].join("\n");
  // BOM para o Excel reconhecer acentuação em UTF-8 corretamente.
  const bom = "﻿";

  return new NextResponse(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-catalogo-compass.csv"`,
    },
  });
}
