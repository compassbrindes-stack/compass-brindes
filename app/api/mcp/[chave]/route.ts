import { NextResponse } from "next/server";
import { conversasDesde, historico, registrarMensagem, totalMensagens } from "@/lib/conversas";
import { enviarTexto, enviarMidia, baixarMidia, verificarNumeros } from "@/lib/uazapi";
import { registrarCompras, todasCompras } from "@/lib/compras";
import { listarDocumentos } from "@/lib/recibos";
import catalogo from "@/data/catalogo-app.json";
import { criarFormFrete, listarFormFrete, lerFormFrete, salvarFormFrete, textoCotacaoSaoMiguel, apagarFormFrete } from "@/lib/frete";
import { redis } from "@/lib/redis";
import { criarAprovacao, listarAprovacoes, lerAprovacao, salvarAprovacao, textoPedidoAprovacao } from "@/lib/aprovacao";
import { lerCfg, salvarCfg, listarAgente, leadsQualificados, pausarAgente, apagarEstado } from "@/lib/agente-leads";
import { enfileirarSaoMiguel, situacaoSaoMiguel, tickSaoMiguel, iniciarLoteSaoMiguel, tirarDoLote, forcarEnvioSaoMiguel, informarCotacao } from "@/lib/saomiguel";

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
 *   avisar_grupo_recibos — manda aviso interno no grupo Compass Recibos (lembrete diário)
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
    name: "agente_config",
    description: "Atendimento automático dos leads novos do WhatsApp (agente que conversa no jeito da Katieska). Sem argumentos, mostra a configuração. Com argumentos, altera: modo 'desligado' (não responde ninguém), 'teste' (só os números da lista) ou 'novos' (todo contato novo que ainda não recebeu resposta da Compass); teste = lista completa de números de teste (substitui a anterior).",
    inputSchema: {
      type: "object",
      properties: {
        modo: { type: "string", enum: ["desligado", "teste", "novos"] },
        teste: { type: "array", items: { type: "string" }, description: "Números com DDD (ex.: 49999990000)." },
      },
    },
  },
  {
    name: "agente_conversas",
    description: "Conversas em que o atendimento automático atuou (situação ativo / humano / transferido, o que já sabe do pedido), os leads qualificados passados para a equipe e os últimos erros.",
    inputSchema: { type: "object", properties: { limite: { type: "integer", minimum: 1, maximum: 300 } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "agente_pausar",
    description: "Para o atendimento automático numa conversa (acao 'pausar') ou apaga o registro para ele poder recomeçar (acao 'reiniciar', útil nos testes).",
    inputSchema: {
      type: "object",
      properties: { numero: { type: "string" }, acao: { type: "string", enum: ["pausar", "reiniciar"] } },
      required: ["numero", "acao"],
    },
  },
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
    description: "Mensagens trocadas com um número no WhatsApp da Compass (texto, data, quem enviou, id e tipo — fotos/arquivos podem ser baixados com midia_whatsapp). Guarda até 10 mil por número; use offset para ver as mais antigas.",
    inputSchema: {
      type: "object",
      properties: {
        numero: { type: "string", description: "Número com DDI e DDD, só dígitos (ex.: 5549999990000)." },
        limite: { type: "integer", minimum: 1, maximum: 500, description: "Quantidade de mensagens (padrão 30)." },
        offset: { type: "integer", minimum: 0, description: "Quantas das mais recentes pular (para buscar as mais antigas)." },
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
    description: "Lista as compras em fornecedor que já tiveram o pagamento registrado pelo grupo Compass Recibos (pedido, data do pagamento e conta no Bling) e as contas a pagar pagas por comprovante no grupo (contasPagas: conta no Bling, data, valor, juros; inclusive quando a baixa no Bling falhou).",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "avisar_grupo_recibos",
    description: "Manda uma mensagem de texto no grupo de WhatsApp \"Compass Recibos\" da equipe (avisos internos, como o lembrete diário de contas e compromissos). Só para esse grupo; nunca para clientes. A mensagem não é lida como comprovante.",
    inputSchema: {
      type: "object",
      properties: { texto: { type: "string", description: "Texto da mensagem (até 4000 caracteres)." } },
      required: ["texto"],
    },
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
    description: "Muda o status de um formulário de frete (enviado = cotação mandada à transportadora; cancelado = link desativado; apagado = apaga de vez um formulário já cancelado; respondida = grava o resultado da transportadora: valor/prazo/numero informados, ou msgId da imagem recebida no WhatsApp para ler o valor).",
    inputSchema: { type: "object", properties: { id: { type: "string" }, status: { type: "string", enum: ["aguardando_cliente", "preenchido", "enviado", "cancelado", "apagado", "respondida"] }, valor: { type: "number", description: "Valor do frete em reais (com status respondida)." }, prazo: { type: "string", description: "Prazo/entrega prevista." }, numero: { type: "string", description: "Número da cotação da transportadora." }, obs: { type: "string" }, msgId: { type: "string", description: "Id da imagem da cotação no WhatsApp: lê o valor dela." } }, required: ["id", "status"] },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "enviar_sao_miguel",
    description: "Manda a cotação de um formulário de frete preenchido para a Expresso São Miguel pelo WhatsApp da Compass, passando sozinho pelo robô (CNPJ, IRAI, Cotações) e lendo a imagem com o valor quando a atendente responder. Só envia se o formulário estiver completo. Sem id, devolve a situação da fila.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "Id do formulário de frete." }, segurar: { type: "boolean", description: "true = separa no lote (não envia ainda) para mandar várias juntas." }, iniciarLote: { type: "boolean", description: "true = manda agora todas as cotações separadas no lote, numa conversa só." }, tirarDoLote: { type: "boolean", description: "true = tira o formulário (id) do lote." }, forcarEnvio: { type: "boolean", description: "true = já há uma atendente na conversa: manda as cotações em andamento/na fila agora, sem passar pelo robô." } } },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "verificar_whatsapp",
    description: "Confere quais números têm WhatsApp ativo (até 100 por vez), sem mandar mensagem. Devolve para cada número se está no WhatsApp e o nome comercial verificado, quando houver.",
    inputSchema: { type: "object", properties: { numeros: { type: "array", items: { type: "string" }, description: "Números com DDI e DDD, só dígitos (ex.: 5549999990000)." } }, required: ["numeros"] },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "criar_aprovacao",
    description: "Pede ao cliente, pelo WhatsApp da Compass, a aprovação de um layout: cria o link /aprovar/<id> (o cliente aprova ou pede ajuste) e envia o layout com a mensagem. O cliente também pode responder APROVO na conversa. A pessoa clicou em \"Pedir aprovação no WhatsApp\" no painel.",
    inputSchema: { type: "object", properties: {
      numero: { type: "string", description: "WhatsApp do cliente com DDI e DDD, só dígitos." },
      cliente: { type: "string" }, pedido: { type: "string", description: "Nº do pedido no Bling ou da proposta." },
      producaoId: { type: "string", description: "Id do pedido na produção do painel." }, layoutId: { type: "string", description: "Id do layout (versão) no painel." },
      versao: { type: "integer" }, produto: { type: "string" },
      imagem: { type: "string", description: "Prévia do layout em JPEG/PNG base64 (até ~700 KB), mostrada na página de aprovação." },
      mimetype: { type: "string", description: "Tipo da imagem (image/jpeg ou image/png)." },
      pdf: { type: "string", description: "Opcional: PDF original do layout em base64 (até 3 MB), enviado na conversa." },
      pdfNome: { type: "string" },
      enviar: { type: "boolean", description: "false = só cria o link, sem mandar mensagem." },
      opcoes: { type: "array", description: "Opcional: 2 a 6 opções de layout numeradas para o cliente escolher uma (cada uma com layoutId, versao, imagem base64 até ~450 KB e mimetype). Nesse caso imagem = a da opção 1.", items: { type: "object", properties: { layoutId: { type: "string" }, versao: { type: "integer" }, imagem: { type: "string" }, mimetype: { type: "string" } } } },
    }, required: ["numero", "imagem"] },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "aprovacoes",
    description: "Pedidos de aprovação de layout e as respostas dos clientes (pendente, aprovado, ajuste com o comentário, dúvida = respondeu só \"ok\"). O painel usa para marcar \"Layout aprovado\" no pedido.",
    inputSchema: { type: "object", properties: { limite: { type: "integer", minimum: 1, maximum: 300 } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "atualizar_aprovacao",
    description: "Atualiza um pedido de aprovação de layout: aplicado = o painel já marcou no pedido; status aprovado/ajuste/cancelado = decisão da Compass (ex.: confirmar um \"ok\" do cliente).",
    inputSchema: { type: "object", properties: { id: { type: "string" }, aplicado: { type: "boolean" }, status: { type: "string", enum: ["aprovado", "ajuste", "cancelado", "pendente"] }, escolha: { type: "integer", description: "Nº da opção escolhida, quando o pedido tem opções numeradas." } }, required: ["id"] },
    annotations: { readOnlyHint: false, destructiveHint: false },
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
      else if (nome === "historico_whatsapp") dados = { mensagens: await historico(String(a.numero || ""), Number(a.limite) || 30, Number(a.offset) || 0), total: await totalMensagens(String(a.numero || "")) };
      else if (nome === "registrar_compras") dados = { registradas: await registrarCompras(Array.isArray(a.compras) ? a.compras.slice(0, 500) : []) };
      else if (nome === "compras_pagas") {
        const log = ((await redis<string[]>(["LRANGE", "compass:recibos:log", 0, 299]).catch(() => [])) || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
        const contasPagas = log
          .filter((r: any) => ["pagar", "compra"].includes(r.tipo) && r.contaId && ["pago", "lancado", "pago-sem-baixa", "lancado-sem-baixa"].includes(r.status))
          .map((r: any) => ({ contaId: String(r.contaId), data: r.data || String(r.em || "").slice(0, 10), valor: r.valor ?? null, juros: r.juros ?? null, valorDocumento: r.comprovante?.valorDocumento ?? null, status: r.status, motivo: r.motivo || "", favorecido: r.comprovante?.favorecido || "", legenda: String(r.legenda || "").slice(0, 120), em: r.em }));
        const recentes = log.slice(0, 15).map((r: any) => ({ em: r.em, tipo: r.tipo, status: r.status, valor: r.valor ?? null, contaId: r.contaId ?? null, motivo: r.motivo || "", favorecido: r.comprovante?.favorecido || "", dataComprovante: r.comprovante?.data || "", valorDocumento: r.comprovante?.valorDocumento ?? null, legenda: r.legenda || "" }));
        dados = { pagas: (await todasCompras()).filter((c) => c.pago).map((c) => ({ pedido: c.pedido, pagoEm: c.pagoEm, contaBling: c.contaBling, pagoPor: c.pagoPor })), contasPagas, recentes };
      }
      else if (nome === "agente_config") {
        const muda = a.modo !== undefined || a.teste !== undefined;
        dados = { config: muda ? await salvarCfg({ modo: a.modo, teste: Array.isArray(a.teste) ? a.teste.map(String) : undefined }) : await lerCfg() };
      }
      else if (nome === "agente_conversas") {
        const lim = Math.min(300, Math.max(1, Number(a.limite) || 50));
        const erros = ((await redis<string[]>(["LRANGE", "compass:agente:erros", 0, 19]).catch(() => [])) || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
        dados = { config: await lerCfg(), conversas: await listarAgente(lim), leads: await leadsQualificados(lim), erros };
      }
      else if (nome === "agente_pausar") {
        let num = String(a.numero || "").replace(/\D/g, "");
        if (num.length >= 10 && num.length <= 11) num = "55" + num;
        if (a.acao === "reiniciar") { await apagarEstado(num); dados = { reiniciado: true, numero: num }; }
        else dados = { pausado: await pausarAgente(num, "pausado pelo painel"), numero: num };
      }
      else if (nome === "avisar_grupo_recibos") {
        const texto = String(a.texto || "").trim();
        if (!texto || texto.length > 4000) return ok(id, { content: [{ type: "text", text: "Erro: mensagem vazia ou longa demais" }], isError: true });
        let grupo = process.env.WA_GRUPO_RECIBOS || "";
        if (!grupo) {
          const h = (await redis<string[] | null>(["HGETALL", "compass:wa:grupos"]).catch(() => null)) || [];
          const alvo = (process.env.WA_GRUPO_RECIBOS_NOME || "compass recibos").toLowerCase();
          const n = (t: string) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
          for (let i = 0; i + 1 < h.length; i += 2) if (String(h[i]).endsWith("@g.us") && n(h[i + 1]) === n(alvo)) { grupo = h[i]; break; }
        }
        if (!grupo) return ok(id, { content: [{ type: "text", text: "Erro: grupo Compass Recibos ainda não identificado (mande qualquer mensagem no grupo e tente de novo)" }], isError: true });
        await enviarTexto(grupo, texto);
        dados = { enviado: true, grupo: "Compass Recibos", em: new Date().toISOString() };
      }
      else if (nome === "enviar_whatsapp") {
        let num = String(a.numero || "").replace(/\D/g, "");
        if (num.length >= 10 && num.length <= 11) num = "55" + num;
        const texto = String(a.texto || "").trim();
        if (num.length < 12 || num.length > 13) return ok(id, { content: [{ type: "text", text: "Erro: número inválido" }], isError: true });
        if (!texto || texto.length > 4000) return ok(id, { content: [{ type: "text", text: "Erro: mensagem vazia ou longa demais" }], isError: true });
        await enviarTexto(num, texto);
        await pausarAgente(num, "a equipe respondeu pelo painel").catch(() => {});
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
        await pausarAgente(num, "a equipe respondeu pelo painel").catch(() => {});
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
        if (a.status === "respondida") { dados = await informarCotacao(String(a.id || ""), { valor: a.valor != null ? Number(a.valor) : undefined, prazo: a.prazo, numero: a.numero != null ? String(a.numero) : undefined, obs: a.obs, msgId: a.msgId }); return ok(id, { content: [{ type: "text", text: JSON.stringify(dados) }], structuredContent: dados }); }
        if (a.status === "apagado") { const ap = await apagarFormFrete(String(a.id || "")); dados = { id: a.id, apagado: ap }; return ok(id, { content: [{ type: "text", text: JSON.stringify(dados) }], structuredContent: dados }); }
        const f = await lerFormFrete(String(a.id || ""));
        if (!f) return ok(id, { content: [{ type: "text", text: "Erro: formulário não encontrado" }], isError: true });
        const st = ["aguardando_cliente", "preenchido", "enviado", "cancelado"].includes(a.status) ? a.status : f.status;
        await salvarFormFrete({ ...f, status: st, ...(st === "enviado" ? { enviadoEm: new Date().toISOString() } : {}) });
        dados = { id: f.id, status: st };
      }
      else if (nome === "enviar_sao_miguel") {
        if (a.forcarEnvio) dados = { ...(await forcarEnvioSaoMiguel()), ...(await situacaoSaoMiguel()) };
        else if (a.iniciarLote) dados = { ...(await iniciarLoteSaoMiguel()), ...(await situacaoSaoMiguel()) };
        else if (a.id && a.tirarDoLote) dados = { ...(await tirarDoLote(String(a.id))), ...(await situacaoSaoMiguel()) };
        else dados = a.id ? { ...(await enfileirarSaoMiguel(String(a.id), { segurar: !!a.segurar })), ...(await situacaoSaoMiguel()) } : await situacaoSaoMiguel();
      }
      else if (nome === "verificar_whatsapp") {
        const nums = (Array.isArray(a.numeros) ? a.numeros : []).map((x: any) => String(x).replace(/\D/g, "")).filter((x: string) => x.length >= 10).slice(0, 100).map((x: string) => (x.length <= 11 ? "55" + x : x));
        dados = { resultado: await verificarNumeros(nums) };
      }
      else if (nome === "criar_aprovacao") {
        let num = String(a.numero || "").replace(/\D/g, "");
        if (num.length >= 10 && num.length <= 11) num = "55" + num;
        if (num.length < 12 || num.length > 13) return ok(id, { content: [{ type: "text", text: "Erro: número inválido" }], isError: true });
        const img = String(a.imagem || "").replace(/^data:[^,]*,/, "");
        if (!img || img.length > 1_000_000) return ok(id, { content: [{ type: "text", text: "Erro: prévia do layout vazia ou maior que 700 KB" }], isError: true });
        const pdf = String(a.pdf || "").replace(/^data:[^,]*,/, "");
        if (pdf.length > 4_300_000) return ok(id, { content: [{ type: "text", text: "Erro: PDF maior que 3 MB" }], isError: true });
        const ops = (Array.isArray(a.opcoes) ? a.opcoes : []).slice(0, 6).map((o: any) => ({ layoutId: String(o.layoutId || ""), versao: Number(o.versao) || 1, imagem: String(o.imagem || "").replace(/^data:[^,]*,/, ""), mime: String(o.mimetype || "image/jpeg") }));
        if (ops.length === 1 || ops.some((o: any) => !o.imagem || o.imagem.length > 1_000_000)) return ok(id, { content: [{ type: "text", text: "Erro: as opções precisam ser 2 ou mais, cada uma com imagem de até 700 KB" }], isError: true });
        const ap = await criarAprovacao({ num, cliente: a.cliente, pedido: a.pedido, producaoId: a.producaoId, layoutId: a.layoutId, versao: a.versao, produto: a.produto }, img, String(a.mimetype || "image/jpeg"), ops.length > 1 ? ops : undefined);
        const link = `${SITE}/aprovar/${ap.id}`;
        const texto = textoPedidoAprovacao(ap, link);
        let enviado = false;
        if (a.enviar !== false) {
          if (ap.opcoes) {
            for (let i = 0; i < ops.length; i++) await enviarMidia(num, "image", ops[i].imagem, `*Opção ${i + 1}*`);
            await enviarTexto(num, texto);
          }
          else if (pdf) await enviarMidia(num, "document", pdf, texto, String(a.pdfNome || "").slice(0, 120) || `layout-${ap.pedido || ap.id}.pdf`);
          else await enviarMidia(num, "image", img, texto);
          const quando = Date.now();
          await registrarMensagem({ num, texto: `[layout para aprovação] ${texto}`, tipo: "documentMessage", deCompass: true, quando, id: "aprov-" + quando });
          enviado = true;
        }
        dados = { id: ap.id, link, enviado, numero: num };
      }
      else if (nome === "aprovacoes") {
        dados = { aprovacoes: await listarAprovacoes(Math.min(300, Math.max(1, Number(a.limite) || 100))) };
      }
      else if (nome === "atualizar_aprovacao") {
        const ap = await lerAprovacao(String(a.id || ""));
        if (!ap) return ok(id, { content: [{ type: "text", text: "Erro: aprovação não encontrada" }], isError: true });
        if (a.aplicado) ap.aplicadoEm = new Date().toISOString();
        const esc = Number(a.escolha) || 0;
        if (a.status === "aprovado" && ap.opcoes && esc >= 1 && esc <= ap.opcoes.length) { ap.escolha = esc; ap.layoutId = ap.opcoes[esc - 1].layoutId; ap.versao = ap.opcoes[esc - 1].versao; ap.via = ap.via || "whatsapp"; }
        if (["aprovado", "ajuste", "cancelado", "pendente"].includes(a.status)) { ap.status = a.status; if (a.status !== "pendente") ap.respondidoEm = ap.respondidoEm || new Date().toISOString(); }
        await salvarAprovacao(ap);
        dados = ap;
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
