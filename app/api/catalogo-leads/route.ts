import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { clearCatalogLeads, saveCatalogLead, type CatalogLeadInput } from "@/lib/catalog-leads";

export const dynamic = "force-dynamic";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  let body: Partial<CatalogLeadInput>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const camposObrigatorios: (keyof CatalogLeadInput)[] = [
    "nome",
    "sobrenome",
    "empresa",
    "email",
    "telefone",
  ];

  for (const campo of camposObrigatorios) {
    if (!body[campo] || !String(body[campo]).trim()) {
      return NextResponse.json(
        { error: `Campo obrigatório ausente: ${campo}.` },
        { status: 400 }
      );
    }
  }

  if (!EMAIL_REGEX.test(String(body.email))) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }

  try {
    const lead = await saveCatalogLead(body as CatalogLeadInput);
    return NextResponse.json({ lead });
  } catch (error) {
    console.error("Erro ao salvar cadastro do catálogo:", error);
    return NextResponse.json(
      { error: "Não foi possível registrar seu cadastro agora. Tente novamente em instantes." },
      { status: 500 }
    );
  }
}

// Apaga todos os leads salvos. Protegida por LEADS_ADMIN_SECRET — usada
// apenas pela página /admin/leads. Ação irreversível.
export async function DELETE(request: NextRequest) {
  const key =
    request.nextUrl.searchParams.get("key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;

  if (!isAdminAuthorized(key)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    await clearCatalogLeads();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao limpar leads do catálogo:", error);
    return NextResponse.json(
      { error: "Não foi possível limpar a lista agora. Tente novamente em instantes." },
      { status: 500 }
    );
  }
}
