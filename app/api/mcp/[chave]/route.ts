import { NextResponse } from "next/server";
import { conversasDesde, historico } from "@/lib/conversas";
import { registrarCompras, todasCompras } from "@/lib/compras";

export const dynamic = "force-dynamic";

/**
 * Conector (MCP, transporte HTTP) do site da Compass para o Claude.
 * Endereço para cadastrar no claude.ai → Conectores → Adicionar conector personalizado:
 *   https://www.compassbrindes.com.br/api/mcp/<MCP_CHAVE>
 * A chave fica só na variável de ambiente MCP_CHAVE da Vercel e no cadastro do conector.
 *
 * Ferramentas (só leitura):
 *   conversas_whatsapp  — contatos com conversa no WhatsApp da Compass desde uma data
 *   historico_whatsapp  — últimas mensagens de um número
 *   registrar_compras   — o painel informa as compras feitas nos fornecedores (nº do pedido e valor)
 *   compras_pagas       — quais dessas compras já foram pagas pelo grupo Compass Recibos
 */

const FERRAMENTAS = [
  {
    name: "conversas_whatsapp",
    description:
      "Lista os contatos que conversaram com o WhatsApp da Compass Brindes desde uma data: número, nome, última mensagem, data e quem falou por último (cliente ou compass). Mais recentes primeiro.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Data/hora ISO (ex.: 2026-10-10T00:00:00Z). Sem ela, traz os mais recentes." },
        limite: { type: "integer", minimum: 1, maximum: 1000, description: "Máximo de contatos (padrão 300)." },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "historico_whatsapp",
    description: "Últimas mensagens trocadas com um número no WhatsApp da Compass (texto resumido, data e quem enviou).",
    inputSchema: {
      type: "object",
      properties: {
        numero: { type: "string", description: "Número com DDI e DDD, só dígitos (ex.: 5549999990000)." },
        limite: { type: "integer", minimum: 1, maximum: 100, description: "Quantidade de mensagens (padrão 30)." },
      },
      required: ["numero"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "registrar_compras",
    description:
      "Informa ao site as compras que a Compass fez nos fornecedores (número do pedido no fornecedor, fornecedor, valor, itens, data), para o grupo Compass Recibos reconhecer o pagamento pelo número ou pelo valor. Não apaga pagamentos já registrados.",
    inputSchema: {
      type: "object",
      properties: {
        compras: {
          type: "array",
          maxItems: 500,
          items: {
            type: "object",
            properties: {
              pedido: { type: "string", description: "Número do pedido no fornecedor, ex.: P7302075" },
              fornecedor: { type: "string" },
              valor: { type: "number", description: "Valor pago/a pagar ao fornecedor, em reais" },
              itens: { type: "string" },
              feitoEm: { type: "string", description: "AAAA-MM-DD" },
            },
            required: ["pedido"],
          },
        },
      },
      required: ["compras"],
    },
  },
  {
    name: "compras_pagas",
    description: "Lista as compras em fornecedor que já tiveram o pagamento registrado pelo grupo Compass Recibos: pedido, data do pagamento e conta no Bling.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
];

const ok = (id: unknown, result: unknown) => NextResponse.json({ jsonrpc: "2.0", id, result });
const erro = (id: unknown, code: number, message: string) => NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });

export async function POST(request: Request, { params }: { params: { chave: string } }) {
  const chave = process.env.MCP_CHAVE;
  if (!chave || params.chave !== chave) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const req: any = await request.json().catch(() => null);
  if (!req || Array.isArray(req)) return erro(null, -32600, "Requisição inválida");
  const { id, method } = req;

  // notificações (sem id) só recebem 202
  if (id === undefined || id === null) return new Response(null, { status: 202 });

  if (method === "initialize") {
    return ok(id, {
      protocolVersion: req.params?.protocolVersion || "2025-03-26",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "compass-site", version: "1.0.0" },
      instructions: "Dados do WhatsApp da Compass Brindes e das compras em fornecedor para o painel Compass Gestão.",
    });
  }
  if (method === "ping") return ok(id, {});
  if (method === "tools/list") return ok(id, { tools: FERRAMENTAS });
  if (method === "tools/call") {
    const nome = req.params?.name;
    const a = req.params?.arguments || {};
    try {
      let dados: unknown;
      if (nome === "conversas_whatsapp") dados = { contatos: await conversasDesde(a.desde, Number(a.limite) || 300) };
      else if (nome === "historico_whatsapp") dados = { mensagens: await historico(String(a.numero || ""), Number(a.limite) || 30) };
      else if (nome === "registrar_compras") dados = { registradas: await registrarCompras(Array.isArray(a.compras) ? a.compras.slice(0, 500) : []) };
      else if (nome === "compras_pagas")
        dados = { pagas: (await todasCompras()).filter((c) => c.pago).map((c) => ({ pedido: c.pedido, pagoEm: c.pagoEm, contaBling: c.contaBling, pagoPor: c.pagoPor })) };
      else return erro(id, -32602, `Ferramenta desconhecida: ${nome}`);
      return ok(id, { content: [{ type: "text", text: JSON.stringify(dados) }], structuredContent: dados });
    } catch (e: any) {
      return ok(id, { content: [{ type: "text", text: `Erro: ${String(e?.message || e)}` }], isError: true });
    }
  }
  return erro(id, -32601, `Método não suportado: ${method}`);
}

export async function GET() {
  // sem stream de servidor (SSE): o cliente usa só POST
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new Response(null, { status: 204 });
}
