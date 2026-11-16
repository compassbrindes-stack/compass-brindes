import { NextResponse } from "next/server";
import { lerFormFrete, salvarFormFrete, publico } from "@/lib/frete";
import { isValidCpfCnpj, isValidCEP, onlyDigits } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  const f = await lerFormFrete(id).catch(() => null);
  if (!f || f.status === "cancelado") return NextResponse.json({ error: "Formulário não encontrado ou expirado." }, { status: 404 });
  return NextResponse.json(publico(f));
}

const txt = (v: unknown, n = 120) => String(v ?? "").trim().slice(0, n);

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  const f = await lerFormFrete(id).catch(() => null);
  if (!f || f.status === "cancelado") return NextResponse.json({ error: "Formulário não encontrado ou expirado." }, { status: 404 });
  if (f.status === "enviado") return NextResponse.json({ error: "Esta cotação já foi enviada para a transportadora. Fale com a Compass para alterar." }, { status: 409 });
  const b: any = await req.json().catch(() => ({}));
  const dest = {
    nome: txt(b.nome), doc: onlyDigits(txt(b.doc, 20)), cep: onlyDigits(txt(b.cep, 12)), endereco: txt(b.endereco), numero: txt(b.numero, 20),
    complemento: txt(b.complemento, 60), bairro: txt(b.bairro, 80), cidade: txt(b.cidade, 80), uf: txt(b.uf, 2).toUpperCase(), contato: txt(b.contato, 80), telefone: txt(b.telefone, 30),
  };
  const faltam = [!dest.nome && "nome / razão social", !isValidCpfCnpj(dest.doc) && "CPF ou CNPJ válido", !isValidCEP(dest.cep) && "CEP", !dest.endereco && "endereço", !dest.numero && "número", !dest.bairro && "bairro", !dest.cidade && "cidade", !/^[A-Z]{2}$/.test(dest.uf) && "UF"].filter(Boolean);
  if (faltam.length) return NextResponse.json({ error: "Confira: " + faltam.join(", ") + "." }, { status: 400 });
  const novo = { ...f, dest, obsCliente: txt(b.obs, 300), status: "preenchido" as const, preenchidoEm: new Date().toISOString() };
  await salvarFormFrete(novo);
  return NextResponse.json({ ok: true });
}
