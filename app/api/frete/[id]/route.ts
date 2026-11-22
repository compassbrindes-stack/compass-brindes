import { NextResponse } from "next/server";
import { lerFormFrete, salvarFormFrete, publico, UFS, completo } from "@/lib/frete";
import { enfileirarSaoMiguel, HORARIO_SM } from "@/lib/saomiguel";
import { fetchAddressByCep } from "@/lib/validators";
import { dadosPreenchidosAgente } from "@/lib/agente-leads";
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
  const faltam = [!dest.nome && "nome / razão social", !isValidCpfCnpj(dest.doc) && "CPF ou CNPJ válido", !isValidCEP(dest.cep) && "CEP", !dest.endereco && "endereço", !dest.numero && "número", !dest.bairro && "bairro", !dest.cidade && "cidade", !UFS.includes(dest.uf) && "UF"].filter(Boolean);
  if (faltam.length) return NextResponse.json({ error: "Confira: " + faltam.join(", ") + "." }, { status: 400 });
  // CEP precisa existir e bater com a UF informada (endereço errado = cotação devolvida)
  const end = await fetchAddressByCep(dest.cep).catch(() => null);
  if (end && end.estado && end.estado !== dest.uf) return NextResponse.json({ error: `O CEP ${dest.cep.slice(0, 5)}-${dest.cep.slice(5)} é de ${end.cidade}/${end.estado}. Confira o CEP ou a UF.` }, { status: 400 });
  const novo = { ...f, dest, obsCliente: txt(b.obs, 300), status: "preenchido" as const, preenchidoEm: new Date().toISOString() };
  // link do atendimento automático (autoEnviar=false): volumes e valor da NF a Compass completa depois
  if (!completo(novo) && f.autoEnviar !== false) return NextResponse.json({ error: "Faltam dados obrigatórios." }, { status: 400 });
  await salvarFormFrete(novo);
  // envio automático para a Expresso São Miguel (só se a Compass não desligou para este link)
  let previsao = "";
  if (process.env.SAO_MIGUEL_AUTO !== "0" && f.autoEnviar !== false) { const r: any = await enfileirarSaoMiguel(novo.id).catch(() => null); previsao = (r && r.previsao) || ""; }
  // link do atendimento automático: resumo final para o cliente no WhatsApp + aviso no grupo
  if (f.agente && f.status !== "preenchido") await dadosPreenchidosAgente(novo).catch(() => {});
  return NextResponse.json({ ok: true, previsao, horario: HORARIO_SM });
}
