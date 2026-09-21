import { NextRequest, NextResponse } from "next/server";
import { saveCatalogLead, type CatalogLeadInput } from "@/lib/catalog-leads";

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
