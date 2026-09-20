import { NextRequest, NextResponse } from "next/server";
import { createOrder, getOrdersByDocument, type OrderCustomer } from "@/lib/orders";
import { isValidCEP, isValidCpfCnpj, onlyDigits } from "@/lib/validators";
import type { QuoteItem } from "@/lib/quote-storage";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { items?: QuoteItem[]; customer?: OrderCustomer };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const items = body.items;
  const customer = body.customer;

  if (!items || items.length === 0) {
    return NextResponse.json({ error: "O orçamento está vazio." }, { status: 400 });
  }

  if (!customer) {
    return NextResponse.json({ error: "Dados do cliente ausentes." }, { status: 400 });
  }

  const camposObrigatorios: (keyof OrderCustomer)[] = [
    "nome",
    "sobrenome",
    "cpfCnpj",
    "cep",
    "endereco",
    "numero",
    "cidade",
    "estado",
    "telefone",
  ];

  for (const campo of camposObrigatorios) {
    if (!customer[campo] || !String(customer[campo]).trim()) {
      return NextResponse.json(
        { error: `Campo obrigatório ausente: ${campo}.` },
        { status: 400 }
      );
    }
  }

  if (!isValidCpfCnpj(customer.cpfCnpj)) {
    return NextResponse.json({ error: "CPF ou CNPJ inválido." }, { status: 400 });
  }

  if (!isValidCEP(customer.cep)) {
    return NextResponse.json({ error: "CEP inválido." }, { status: 400 });
  }

  try {
    const order = await createOrder(items, customer);
    return NextResponse.json({ order });
  } catch (error) {
    console.error("Erro ao criar pedido:", error);
    return NextResponse.json(
      { error: "Não foi possível gerar o pedido. Tente novamente em instantes." },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const doc = request.nextUrl.searchParams.get("doc") ?? "";
  const digits = onlyDigits(doc);

  if (!digits || (digits.length !== 11 && digits.length !== 14)) {
    return NextResponse.json({ error: "Informe um CPF ou CNPJ válido para buscar." }, { status: 400 });
  }

  try {
    const orders = await getOrdersByDocument(digits);
    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Erro ao buscar pedidos:", error);
    return NextResponse.json(
      { error: "Não foi possível buscar os pedidos agora. Tente novamente em instantes." },
      { status: 500 }
    );
  }
}
