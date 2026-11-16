import { NextResponse } from "next/server";
import { conversasDesde, historico, registrarMensagem } from "@/lib/conversas";
import { enviarTexto, enviarMidia, baixarMidia } from "@/lib/uazapi";
import { registrarCompras, todasCompras } from "@/lib/compras";
import { listarDocumentos } from "@/lib/recibos";
import catalogo from "@/data/catalogo-app.json";
import { criarFormFrete, listarFormFrete, lerFormFrete, salvarFormFrete, textoCotacaoSaoMiguel, apagarFormFrete } from "@/lib/frete";
import { redis } from "@/lib/redis";
import { enfileirarSaoMiguel, situacaoSaoMiguel, tickSaoMiguel } from "@/lib/saomiguel";

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
 *   enviar_whatsapp     — envia uma mensagem de texto pelo WhatsApp da Compass (usado pelo painel, a pessoa digita e clica Enviar)
 *   enviar_arquivo_whatsapp — envia foto/PDF (base64) pelo WhatsApp da Compass, com legenda opcional
 *   foto_produto        — foto do produto (catálogo do site pelo código, ou link do Bling/fornecedor) em base64,
 *                         para o painel montar o orçamento em PDF (o painel não consegue baixar imagens de fora)
 */

const SITE = "https://www.compassbrindes.com.br";
const HOSTS_FOTO = /(^|\.)(compassbrindes\.com\.br|orgbling\.s3\.amazonaws\.com|s3\.amazonaws\.com|xbzbrindes\.com\.br|asiaimport\.com\.br|spotgifts\.com\.br)$/i;

async function baixarFoto(u: string) {
  const url = new URL(u.startsWith("/") ? SITE + u : u);
  if (url.protocol !== "https:" || !HOSTS_FOTO.test(url.hostname)) throw new Error("endereço de foto não permitido");
  const r = await fetch(url.toString(), { cache: "no-store" });
  if (!r.ok) throw new Error(`foto indisponível (${r.status})`);
  const mime = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
  if (!/^image\//.test(mime)) throw new Error("o link não é uma imagem");
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 3_000_000) throw new Error("foto grande demais");
  return { mime, base64: buf.toString("base64"), origem: url.toString() };
}

async function fotoProduto(codigo: string, url: string) {
  const cod = codigo.trim().toUpperCase();
  if (cod) {
    const p: any = (catalogo as any[]).find((x: any) => String(x.supplierCode || "").toUpperCase() === cod);
    const img = p?.images?.[0];
    if (img) {
      try {
        return await baixarFoto(String(img));
      } catch {
        /* tenta o link */
      }
    }
  }
  if (url) return baixarFoto(url);
  return { mime: null, base64: null, origem: null };
}

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
              pago: { type: "boolean", description: "true se o pagamento já foi registrado de outra forma (no painel)" },
              pagoEm: { type: "string", description: "AAAA-MM-DD" },
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
  {
    name: "enviar_whatsapp",
    description: "Envia uma mensagem de texto pelo WhatsApp da Compass Brindes para um número (a pessoa escreveu a mensagem no painel e clicou em Enviar). Grava a mensagem no histórico da conversa.",
    inputSchema: {
      type: "object",
      properties: {
        numero: { type: "string", description: "Número com DDI e DDD, só dígitos (ex.: 5549999990000)." },
        texto: { type: "string", description: "Texto da mensagem (até 4000 caracteres)." },
      },
      required: ["numero", "texto"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "enviar_arquivo_whatsapp",
    description: "Envia uma foto ou um arquivo (PDF de layout, orçamento, boleto) pelo WhatsApp da Compass Brindes para um número, com legenda opcional (a pessoa escolheu o arquivo no painel e clicou em Enviar). Grava no histórico da conversa.",
    inputSchema: {
      type: "object",
      properties: {
        numero: { type: "string", description: "Número com DDI e DDD, só dígitos (ex.: 5549999990000)." },
        base64: { type: "string", description: "Conteúdo do arquivo em base64 (sem o prefixo data:), até cerca de 3 MB." },
        mimetype: { type: "string", description: "Tipo do arquivo, ex.: image/jpeg, image/png, application/pdf." },
        nome: { type: "string", description: "Nome do arquivo, ex.: layout-V2.pdf." },
        legenda: { type: "string", description: "Texto que acompanha o arquivo (opcional)." },
      },
      required: ["numero", "base64", "mimetype"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "documentos_whatsapp",
    description: "Lista os documentos (NF de entrada, CT-e, fatura, boleto) que chegaram no grupo Compass Recibos do WhatsApp e foram lidos pelo sistema: id da mensagem (para abrir o arquivo com midia_whatsapp), tipo, número, emitente, CNPJ, valor, datas, NFs e CT-es citados. Mais novos primeiro.",
    inputSchema: { type: "object", properties: { limite: { type: "integer", minimum: 1, maximum: 500, description: "Máximo de documentos (padrão 200)." } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "midia_whatsapp",
    description: "Abre a foto, o PDF ou outro arquivo de uma mensagem do WhatsApp da Compass, pelo id da mensagem (campo id do historico_whatsapp, mensagens marcadas [image], [document] etc.). Foto volta como imagem; PDF volta como arquivo.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Id da mensagem (ex.: 3EB0B87DC2BEE3C3522C39)." } },
      required: ["id"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "foto_produto",
    description: "Foto de um produto em base64 (mime + base64). Procura primeiro no catálogo do site pelo código (ex.: CBI005, C040B800); se não houver, baixa o link informado (Bling, XBZ, Asia Import, site).",
    inputSchema: {
      type: "object",
      properties: {
        codigo: { type: "string", description: "Código do produto (supplierCode do catálogo)." },
        url: { type: "string", description: "Link da imagem (ex.: imagem interna do produto no Bling)." },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "criar_link_frete",
    description: "Cria um formulário (link público) para o cliente preencher os dados do destinatário da entrega. A Compass informa valor da NF, volumes, peso e produto; o cliente preenche nome, CPF/CNPJ e endereço. Devolve id, link e uma mensagem pronta para mandar ao cliente.",
    inputSchema: {
      type: "object",
      properties: {
        clienteNome: { type: "string", description: "Nome do cliente (aparece na saudação do formulário)." },
        pedido: { type: "string", description: "Referência interna (nº do pedido/proposta)." },
        tomador: { type: "string", enum: ["remetente", "destinatario"], description: "Quem paga o frete." },
        valorNF: { type: "string", description: "Valor da nota fiscal, ex.: 280,00." },
        produto: { type: "string", description: "O que é e como está embalado." },
        pesoTotal: { type: "string", description: "Peso total em kg, ex.: 3." },
        whatsCliente: { type: "string", description: "WhatsApp do cliente (para avisar sobre o horário da transportadora quando ele preencher)." },
        texto: { type: "string", description: "Cotação já montada no painel (cliente cadastrado): texto pronto no formato da São Miguel. Com ele o formulário nasce preenchido e pode ir direto para enviar_sao_miguel." },
        dest: { type: "object", description: "Destinatário (nome, doc, cep, endereco, numero, bairro, cidade, uf…), quando a cotação vem pronta do painel." },
        volumes: { type: "array", items: { type: "object", properties: { qtd: { type: "string" }, c: { type: "string" }, l: { type: "string" }, a: { type: "string" }, peso: { type: "string" } } } },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "formularios_frete",
    description: "Lista os formulários de frete criados (mais novos primeiro): status (aguardando_cliente, preenchido, enviado, cancelado), dados do destinatário preenchidos pelo cliente e o texto da cotação no formato da Expresso São Miguel.",
    inputSchema: { type: "object", properties: { limite: { type: "integer", minimum: 1, maximum: 200 } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "atualizar_frete",
    description: "Muda o status de um formulário de frete (enviado = cotação mandada à transportadora; cancelado = link desativado; apagado = apaga de vez um formulário já cancelado).",
    inputSchema: { type: "object", properties: { id: { type: "string" }, status: { type: "string", enum: ["aguardando_cliente", "preenchido", "enviado", "cancelado", "apagado"] } }, required: ["id", "status"] },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "enviar_sao_miguel",
    description: "Manda a cotação de um formulário de frete preenchido para a Expresso São Miguel pelo WhatsApp da Compass, passando sozinho pelo robô (CNPJ, IRAI, Cotações) e lendo a imagem com o valor quando a atendente responder. Só envia se o formulário estiver completo. Sem id, devolve a situação da fila.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "Id do formulário de frete." } } },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "menu_whatsapp",
    description: "Mensagens de robô (botões e listas de opções) recebidas de um número no WhatsApp da Compass, com o conteúdo completo das opções — usado para entender o atendimento automático da transportadora.",
    inputSchema: { type: "object", properties: { numero: { type: "string", description: "Número com DDI e DDD, só dígitos." }, limite: { type: "integer", minimum: 1, maximum: 50 } }, required: ["numero"] },
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
      else if (nome === "enviar_whatsapp") {
        let num = String(a.numero || "").replace(/\D/g, "");
        if (num.length >= 10 && num.length <= 11) num = "55" + num;
        const texto = String(a.texto || "").trim();
        if (num.length < 12 || num.length > 13) return ok(id, { content: [{ type: "text", text: "Erro: número inválido" }], isError: true });
        if (!texto || texto.length > 4000) return ok(id, { content: [{ type: "text", text: "Erro: mensagem vazia ou longa demais" }], isError: true });
        await enviarTexto(num, texto);
        const quando = Date.now();
        await registrarMensagem({ num, texto, tipo: "conversation", deCompass: true, quando, id: "painel-" + quando });
        dados = { enviado: true, numero: num, em: new Date(quando).toISOString() };
      }
      else if (nome === "enviar_arquivo_whatsapp") {
        let num = String(a.numero || "").replace(/\D/g, "");
        if (num.length >= 10 && num.length <= 11) num = "55" + num;
        const b64 = String(a.base64 || "").replace(/^data:[^,]*,/, "");
        const mime = String(a.mimetype || "application/octet-stream").toLowerCase();
        const nomeArq = String(a.nome || "").slice(0, 120) || (mime === "application/pdf" ? "arquivo.pdf" : "foto.jpg");
        const legenda = String(a.legenda || "").trim().slice(0, 1000);
        if (num.length < 12 || num.length > 13) return ok(id, { content: [{ type: "text", text: "Erro: número inválido" }], isError: true });
        if (!b64 || b64.length > 4_300_000) return ok(id, { content: [{ type: "text", text: "Erro: arquivo vazio ou maior que 3 MB" }], isError: true });
        const tipo = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document";
        await enviarMidia(num, tipo, b64, legenda, tipo === "document" ? nomeArq : undefined);
        const quando = Date.now();
        const rotulo = tipo === "image" ? "[foto]" : tipo === "document" ? `[arquivo: ${nomeArq}]` : `[${tipo}]`;
        await registrarMensagem({ num, texto: legenda ? `${rotulo} ${legenda}` : rotulo, tipo: "documentMessage", deCompass: true, quando, id: "painel-" + quando });
        dados = { enviado: true, numero: num, tipo, em: new Date(quando).toISOString() };
      }
      else if (nome === "documentos_whatsapp") {
        const docs = await listarDocumentos(Math.min(500, Math.max(1, Number(a.limite) || 200)));
        dados = { documentos: docs };
      }
      else if (nome === "midia_whatsapp") {
        const mid = String(a.id || "").trim();
        if (!/^[A-Za-z0-9_-]{6,80}$/.test(mid)) return ok(id, { content: [{ type: "text", text: "Erro: id inválido" }], isError: true });
        const arq = await baixarMidia(mid);
        if (!arq.fileURL) return ok(id, { content: [{ type: "text", text: "Erro: mensagem sem arquivo (ou expirado)" }], isError: true });
        const r = await fetch(arq.fileURL, { cache: "no-store" });
        if (!r.ok) throw new Error(`download ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 8_000_000) return ok(id, { content: [{ type: "text", text: JSON.stringify({ mimetype: arq.mimetype, tamanho: buf.length, link: arq.fileURL }) }] });
        const mime = String(arq.mimetype || r.headers.get("content-type") || "application/octet-stream").split(";")[0];
        const b64 = buf.toString("base64");
        if (mime.startsWith("image/")) return ok(id, { content: [{ type: "image", data: b64, mimeType: mime }, { type: "text", text: JSON.stringify({ id: mid, mimetype: mime, tamanho: buf.length }) }] });
        return ok(id, { content: [{ type: "resource", resource: { uri: `whatsapp://midia/${mid}`, mimeType: mime, blob: b64 } }, { type: "text", text: JSON.stringify({ id: mid, mimetype: mime, tamanho: buf.length }) }] });
      }
      else if (nome === "foto_produto") {
        const foto = await fotoProduto(String(a.codigo || ""), String(a.url || ""));
        return ok(id, { content: [{ type: "text", text: JSON.stringify(foto) }], structuredContent: foto });
      }
      else if (nome === "criar_link_frete") {
        const f = await criarFormFrete(a);
        const url = `${SITE}/frete/${f.id}`;
        const mensagem = `Olá${f.clienteNome ? ", " + f.clienteNome : ""}! Para cotarmos o frete do seu pedido, preencha por favor os dados de quem vai receber a mercadoria neste link: ${url}`;
        dados = { id: f.id, url, mensagem };
      }
      else if (nome === "formularios_frete") {
        await tickSaoMiguel().catch(() => {});
        const lista = await listarFormFrete(Math.min(200, Math.max(1, Number(a.limite) || 50)));
        dados = { formularios: lista.map((f) => ({ ...f, url: `${SITE}/frete/${f.id}`, texto: f.dest ? textoCotacaoSaoMiguel(f) : null })) };
      }
      else if (nome === "atualizar_frete") {
        if (a.status === "apagado") { const ap = await apagarFormFrete(String(a.id || "")); dados = { id: a.id, apagado: ap }; return ok(id, { content: [{ type: "text", text: JSON.stringify(dados) }], structuredContent: dados }); }
        const f = await lerFormFrete(String(a.id || ""));
        if (!f) return ok(id, { content: [{ type: "text", text: "Erro: formulário não encontrado" }], isError: true });
        const st = ["aguardando_cliente", "preenchido", "enviado", "cancelado"].includes(a.status) ? a.status : f.status;
        await salvarFormFrete({ ...f, status: st, ...(st === "enviado" ? { enviadoEm: new Date().toISOString() } : {}) });
        dados = { id: f.id, status: st };
      }
      else if (nome === "enviar_sao_miguel") {
        dados = a.id ? { ...(await enfileirarSaoMiguel(String(a.id))), ...(await situacaoSaoMiguel()) } : await situacaoSaoMiguel();
      }
      else if (nome === "menu_whatsapp") {
        const num = String(a.numero || "").replace(/\D/g, "");
        const lim = Math.min(50, Math.max(1, Number(a.limite) || 15));
        const brutos = await redis<string[]>(["LRANGE", `compass:wa:bruto:${num}`, 0, lim - 1]);
        dados = { mensagens: (brutos || []).map((x) => { try { return JSON.parse(x); } catch { return x; } }) };
      }
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
