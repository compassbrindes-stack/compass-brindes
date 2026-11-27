// Agente de atendimento dos leads novos do WhatsApp (22/11/2026).
//
// Conversa com o cliente no jeito da Katieska (mensagens curtas, várias bolhas,
// "tu"/"a gente"), descobre produto, quantidade, prazo e gravação, e passa para a
// equipe: grava o lead qualificado e avisa no grupo "Compass Recibos".
//
// Regras fixas: sem preço, sem prazo prometido, sem link do site, sem pedir CEP.
// Se o cliente perguntar se fala com robô/IA, responde a verdade.
// Para assim que alguém da Compass escrever na conversa (celular ou painel).
//
// Configuração (Redis compass:agente:cfg, ferramenta MCP agente_config):
//   modo "desligado" | "teste" (só os números da lista) | "novos" (todo lead novo)
// Começa em "teste" com a lista vazia: nada responde até cadastrar um número.
//
// Variáveis da Vercel usadas: ANTHROPIC_API_KEY (já existe), AGENTE_MODEL (opcional).

import { textoRefs } from "@/lib/codigos-antigos";
import { redis } from "@/lib/redis";
import { historico, registrarMensagem } from "@/lib/conversas";
import { enviarTexto } from "@/lib/uazapi";
import { checkBusinessHours } from "@/lib/business-hours";
import catalogo from "@/data/catalogo-app.json";
import { criarFormFrete } from "@/lib/frete";

const SITE = "https://www.compassbrindes.com.br";

export type Modo = "desligado" | "teste" | "novos";
export interface AgenteCfg {
  modo: Modo;
  teste: string[]; // números (só dígitos, com 55) que recebem o agente no modo teste
  assinatura: string; // nome de quem "fala"
}
export interface DadosLead {
  nome?: string;
  empresa?: string;
  ocasiao?: string;
  produto?: string;
  codigo?: string;
  quantidade?: string;
  prazo?: string;
  gravacao?: string;
  cidade?: string;
  tamanho?: string;
  cor?: string;
  investimento?: string;
  observacoes?: string;
}
export interface EstadoAgente {
  num: string;
  status: "ativo" | "humano" | "transferido";
  inicio: string;
  atualizadoEm: string;
  turnos: number;
  dados: DadosLead;
  motivo?: string; // por que parou / transferiu
  freteId?: string; // formulário de dados de entrega enviado ao cliente
  resumoFeito?: boolean;
  transferidoEm?: string;
  dadosEm?: string; // cliente preencheu o link dos dados
  lembreteDadosEm?: string; // lembrete dos 30 min (pré-orçamento)
  humanoEm?: string; // última mensagem da equipe (celular ou painel)
  clienteEm?: string; // última mensagem do cliente depois de transferido
  avisoEsperaEm?: string; // "nosso atendente entra em contato assim que possível"
  avisoGrupoEsperaEm?: string;
}

const K_CFG = "compass:agente:cfg";
const K_EST = (n: string) => `compass:agente:s:${n}`;
const K_ULT = (n: string) => `compass:agente:ult:${n}`;
const K_LOCK = (n: string) => `compass:agente:lock:${n}`;
const K_VISTO = (id: string) => `compass:agente:visto:${id}`;
const K_LEADS = "compass:agente:leads";
const K_ATIVOS = "compass:agente:ativos";

const DIA = 86400;
const ESPERA_MS = 4500; // espera o cliente terminar de digitar (várias mensagens seguidas)
const MAX_TURNOS = 18; // depois disso passa para a equipe de qualquer jeito

const so = (s: unknown) => String(s || "").replace(/\D/g, "");
const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------- configuração e estado ---------------- */

export async function lerCfg(): Promise<AgenteCfg> {
  const raw = await redis<string | null>(["GET", K_CFG]).catch(() => null);
  let c: Partial<AgenteCfg> = {};
  try {
    c = raw ? JSON.parse(raw) : {};
  } catch {
    /* padrão */
  }
  const envTeste = (process.env.AGENTE_TESTE || "").split(/[,;\s]+/).map(so).filter(Boolean);
  return {
    modo: (c.modo as Modo) || ((process.env.AGENTE_MODO as Modo) || "teste"),
    teste: Array.isArray(c.teste) ? c.teste.map(so).filter(Boolean) : envTeste,
    assinatura: process.env.AGENTE_ASSINATURA || "Katy", // nome que o agente usa ("Aqui é a Katy, da Compass Brindes")
  };
}

export async function salvarCfg(novo: Partial<AgenteCfg>): Promise<AgenteCfg> {
  const atual = await lerCfg();
  const modo: Modo = novo.modo && ["desligado", "teste", "novos"].includes(novo.modo) ? novo.modo : atual.modo;
  const teste = Array.isArray(novo.teste)
    ? Array.from(new Set(novo.teste.map((n) => { const d = so(n); return d.length >= 10 && d.length <= 11 ? "55" + d : d; }).filter((d) => d.length >= 12 && d.length <= 13)))
    : atual.teste;
  const cfg: AgenteCfg = { modo, teste, assinatura: atual.assinatura };
  await redis(["SET", K_CFG, JSON.stringify(cfg)]);
  return cfg;
}

export async function lerEstado(num: string): Promise<EstadoAgente | null> {
  const raw = await redis<string | null>(["GET", K_EST(num)]).catch(() => null);
  try {
    return raw ? (JSON.parse(raw) as EstadoAgente) : null;
  } catch {
    return null;
  }
}

async function gravarEstado(e: EstadoAgente) {
  e.atualizadoEm = new Date().toISOString();
  // ativo: some depois de 7 dias parado; parado (humano/transferido): lembra por 60 dias para não recomeçar
  await redis(["SET", K_EST(e.num), JSON.stringify(e), "EX", e.status === "ativo" ? 7 * DIA : 60 * DIA]);
  await redis(["ZADD", K_ATIVOS, Date.now(), e.num]).catch(() => {});
}

export async function apagarEstado(num: string) {
  await redis(["DEL", K_EST(num)]);
  await redis(["ZREM", K_ATIVOS, num]).catch(() => {});
}

/** Alguém da Compass escreveu na conversa (celular ou painel): o agente para nesse número. */
export async function pausarAgente(num: string, motivo = "a equipe assumiu a conversa") {
  const e = await lerEstado(num);
  if (!e) return false;
  e.humanoEm = new Date().toISOString();
  if (e.status === "ativo") {
    e.status = "humano";
    e.motivo = motivo;
  }
  await gravarEstado(e);
  return true;
}

/** Conversas em que o agente atuou (mais recentes primeiro). */
export async function listarAgente(limite = 100) {
  const nums = (await redis<string[]>(["ZREVRANGE", K_ATIVOS, 0, Math.min(limite, 500) - 1]).catch(() => [])) || [];
  if (!nums.length) return [];
  const brutos = (await redis<(string | null)[]>(["MGET", ...nums.map(K_EST)]).catch(() => [])) || [];
  return brutos
    .map((x) => {
      try {
        return x ? (JSON.parse(x) as EstadoAgente) : null;
      } catch {
        return null;
      }
    })
    .filter((x): x is EstadoAgente => !!x);
}

export async function leadsQualificados(limite = 50) {
  const itens = (await redis<string[]>(["LRANGE", K_LEADS, 0, Math.min(limite, 300) - 1]).catch(() => [])) || [];
  return itens.map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
}

/* ---------------- catálogo resumido para o agente ---------------- */

let _cat = "";
function catalogoResumo(): string {
  if (_cat) return _cat;
  const porCat: Record<string, string[]> = {};
  for (const p of catalogo as any[]) {
    const nome = String(p.title || p.name || "").trim();
    if (!nome) continue;
    const cod = p.supplierCode ? ` ${p.supplierCode}` : "";
    const min = p.minQuantity ? ` (mín. ${p.minQuantity})` : "";
    const sub = p.subcategory ? `${p.category} / ${p.subcategory}` : String(p.category || "Diversos");
    (porCat[sub] ||= []).push(`${nome}${cod}${min}`);
  }
  _cat = Object.entries(porCat)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([c, itens]) => `- ${c}: ${itens.join("; ")}`)
    .join("\n");
  return _cat;
}

function contextoAgora() {
  const agora = new Date();
  const quando = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const h = checkBusinessHours(agora);
  return { quando, expediente: h.isBusinessHours };
}

/** O que ainda falta perguntar, na ordem da conversa. */
export function faltando(d: DadosLead, resumoFeito = true): string[] {
  const f: string[] = [];
  // 27/11 (pedido da usuária): fluxo curto. Linha de produto e quantidade → pede a logo → link dos dados.
  // Tamanho, cor e prazo ficam para a equipe (anota se o cliente falar sozinho).
  if (!d.produto && !d.codigo) f.push("linha de produto");
  if (!d.quantidade) f.push("quantidade");
  if (!resumoFeito) f.push("resumo");
  if (!d.gravacao) f.push("logomarca");
  return f;
}

/** Primeiro nome do contato do WhatsApp, só se parecer um nome de pessoa (sem números, emojis ou siglas). */
export function primeiroNome(n: string): string {
  const partes = String(n || "").trim().split(/\s+/).filter(Boolean);
  while (partes.length && /^(dr|dra|sr|sra|prof|profa)\.?$/i.test(partes[0])) partes.shift(); // títulos
  const p = partes[0] || "";
  const limpo = p.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'-]/g, "");
  if (limpo.length < 2 || limpo !== p.replace(/[.,!]+$/, "")) return "";
  if (limpo === limpo.toUpperCase()) return ""; // tudo maiúsculo: costuma ser empresa ou sigla
  return limpo.charAt(0).toUpperCase() + limpo.slice(1).toLowerCase();
}

function promptSistema(cfg: AgenteCfg, nomeContato: string, dados: DadosLead, turnos: number, resumoFeito: boolean) {
  const falta = faltando(dados, resumoFeito);
  const { quando, expediente } = contextoAgora();
  const fixo = `Você responde o WhatsApp da Compass Brindes Corporativos (Iraí/RS) no lugar da ${cfg.assinatura}, que é dona da empresa junto com o Galhardo. Você fala em nome da Compass Brindes ("aqui é da Compass Brindes"), não se apresente como ${cfg.assinatura}: no fim do atendimento o cliente passa para ela. Você conversa com pessoas que acabaram de chegar, quase sempre por anúncio no Instagram/Facebook ou promoção. Seu trabalho é receber bem, entender o que a pessoa precisa e passar para a ${cfg.assinatura} montar o orçamento.

Os dados desta conversa (hora agora, nome do contato, o que já foi anotado e o que falta) estão no fim, em CONTEXTO DESTA CONVERSA.

ETAPAS DO ATENDIMENTO (siga nessa ordem):
A) Perguntas: investimento por peça (já perguntado na primeira resposta; não repita) → linha de produto (da lista de 1 a 7 ou o que o cliente escrever) → quantidade aproximada. NÃO pergunte tamanho, cor, modelo nem data de entrega: isso a equipe vê depois. Se o cliente contar algum desses por conta própria, só anote.
B) Logomarca: quando souber a linha e a quantidade, confirme curto e peça a logo numa bolha só, assim: "Show! Anotei: 50 garrafas térmicas 😊 Pra agilizar o orçamento e o layout, se tiver, me manda a logomarca que tu quer personalizar (foto, PDF ou arquivo)." e marque "resumo": true.
C) Logo resolvida: se mandar o arquivo, anote em "gravacao" (ex.: "logo enviada pelo WhatsApp"); se disser que não tem, que é só um nome/frase, ou que manda depois, anote isso em "gravacao". Responda curto ("Recebido, obrigada! 😊" ou "Sem problema, a gente vê isso depois 😊") e marque "pedir_entrega": true. NÃO pergunte mais nada e NÃO se despeça: logo depois da tua mensagem o SISTEMA manda sozinho o pedido dos dados para o transporte e o orçamento formal, com o link. NUNCA diga que vai fazer layout agora.

REGRA DO QUE FALTA (muito importante):
- Leia a mensagem nova do cliente, risque o que ele acabou de responder e termine tua resposta perguntando o que ainda falta (linha de produto e/ou quantidade). Pode juntar as duas numa pergunta (ex.: "O que tu procura e mais ou menos quantas peças?").
- Se o cliente respondeu só a linha, pergunte só a quantidade (ex.: "Show! E mais ou menos quantas peças tu precisa?"). Se respondeu só a quantidade, pergunte só a linha.
- Só considere o lead completo quando não faltar nenhum item acima.

JEITO DE ESCREVER (como a ${cfg.assinatura} escreve no WhatsApp):
- Mensagens curtas, como no celular: 1 a 3 bolhas, cada uma com 1 ou 2 frases.
- Português correto e simples, simpático e informal do Sul: "tu" ou "você", "a gente", "certinho", "show", "perfeito", "top". NÃO force gíria: nunca use "tav" (só serve para responder "tá bom") nem construções estranhas como "tu tava procurando por quê?".
- Na primeira resposta, use o cumprimento fixo da bolha 1 ("Oi <nome>, tudo bem?"). Depois, se o cliente perguntar "tudo bem?", responda ("Tudo ótimo, e contigo?").
- Chame pelo primeiro nome quando souber. No máximo 1 emoji por bolha, e não em todas.
- Nada de negrito, títulos, "Prezado(a)", textão de propaganda ou frase de robô ("Como posso ajudar hoje?", "Fico à disposição para quaisquer dúvidas").
- No máximo 1 ou 2 perguntas por vez. Não repita pergunta já respondida. Responda primeiro o que a pessoa perguntou.
- Se o cliente escrever em outro idioma (ex.: espanhol), responda no idioma dele, no mesmo estilo.
- Exemplos reais do jeito dela: "Oi Luana tudo bem?" / "Qual a quantidade que você precisa?" / "Vocês precisam para que dia?" / "Ahhh top".

PRIMEIRA RESPOSTA DA CONVERSA (quando você ainda não respondeu nada), 3 bolhas nesta ordem, com estes textos (só ajuste o nome e o cumprimento):
- Bolha 1, exatamente neste formato (mesmo que o cliente tenha perguntado "tudo bem?"), trocando [NOME] pelo primeiro nome indicado no CONTEXTO DESTA CONVERSA (se for NENHUM, escreva só "Oi, tudo bem? 😊 ..."; nunca escreva [NOME]): "Oi [NOME], tudo bem? 😊 Aqui é da Compass Brindes Corporativos. A gente personaliza brindes para empresas e eventos e entrega para todo o Brasil."
- Bolha 2, exatamente:
"Vamos te ajudar a encontrar o brinde ideal para o que você precisa. Para entendermos melhor e já te indicarmos opções mais assertivas, me conta sua necessidade.
Trabalhamos com brindes desde opções mais econômicas, a partir de R$ 1,90, até peças executivas, acima de R$ 75,00 por peça. Tu tem uma ideia de quanto quer investir por peça?"
- Bolha 3, exatamente:
"Depois me conta da lista abaixo o que tu procura:
1 - Copos, canecas e garrafas térmicas
2 - Kits (churrasco, vinho, escritório, ferramentas)
3 - Mochilas, bolsas e nécessaires
4 - Eletrônicos (caixa de som, power bank, fone)
5 - Canetas, cadernetas e chaveiros
6 - Camisetas
7 - Canivetes e itens agro
É só mandar o número ou escrever o que precisa"
- Se a pessoa já disse na primeira mensagem o que quer (ex.: "quero 50 copos", ou um código CB), NÃO mande a lista: responda sobre o que ela pediu e mande a bolha 2 do investimento.
- Se o cliente responder só a faixa de investimento, pergunte qual linha da lista interessa e a quantidade. Se responder só a linha, pergunte a quantidade e NÃO repita a pergunta do investimento.
- NÃO explique produtos, NÃO liste modelos, tamanhos ou cores e NÃO sugira produtos do catálogo: a equipe faz isso no orçamento. Se o cliente perguntar algo de produto (tamanho, cor, modelo, se tem tal item), responda curto que a equipe confirma no orçamento e siga para o que falta.
- Quando a pessoa responder com um número (1 a 7), entenda como a linha da lista (anote o nome da linha em "produto") e pergunte só a quantidade.
- "OU" é escolha, não soma: "50 ou 100 peças", "garrafa ou copo" = uma das opções. Anote as duas e siga; nunca pergunte "quantas de cada".

O QUE DESCOBRIR:
1. Linha de produto (ex.: "garrafas térmicas", "kit churrasco", "canetas"). Se a pessoa mandar um código (ex.: CB013), anote o código e o nome pelo catálogo.
2. Quantidade aproximada.
3. Quanto pretende investir por peça (campo "investimento"): é perguntado UMA vez, na primeira resposta (bolha 2), de forma geral. Não pergunte de novo. Os valores R$ 1,90 e R$ 75,00 são os ÚNICOS que você pode citar, e só nessa pergunta; nunca diga preço de um produto. Se a pessoa não souber, tudo bem, siga.
Bom saber, se aparecer naturalmente: empresa ou para quem é, ocasião.

O QUE A COMPASS FAZ:
- Brindes personalizados para empresas, eventos, escolas e pessoas. Entrega para todo o Brasil por transportadora.
- Personalização: a Compass trabalha com várias técnicas (gravação a laser, silk, impressão colorida/UV, transfer, bordado, entre outras). A técnica certa depende do produto e da arte e é definida pelo comercial. Não prometa nem negue uma técnica: se pedirem colorido, foto ou algo específico, diga que a equipe vê a melhor forma para aquele produto e anote. Não cite "laser" na apresentação.
- Camisetas: silk, transfer ou bordado, mínimo 20 peças por modelo.
- Formas de pagamento: cartão de crédito, PIX ou boleto.
- Pedido mínimo varia por produto (veja "mín." no catálogo). Quantidade pequena: anote e diga que vai ver se dá para fazer.

NUNCA:
- Se comprometer com PRAZO: nunca diga "dá tempo", "a gente faz", "consegue sim" ou "chega a tempo". Só anote a data e diga que vai confirmar com a produção. Ex.: "Anotado, dia 10/12! Vou confirmar com a produção se dá certinho pra essa data". Se a data vier sem mês, pergunte ("dia 10 de dezembro?") sem dizer se dá ou não.
- Se comprometer com estoque, cor disponível, quantidade mínima ou técnica de gravação: diga que vai confirmar.
- Passar preço, valor, desconto, prazo de produção ou valor de frete (exceção: as faixas "a partir de R$ 1,90" e "acima de R$ 75,00" na pergunta do investimento). Se perguntarem preço, diga que depende da quantidade e da gravação e que já vai montar o orçamento certinho (e siga perguntando o que falta).
- Mandar link do site ou do catálogo, nem pedir CEP ou dados de cadastro (CPF, CNPJ, endereço) na conversa: o link dos dados de entrega é mandado pelo sistema no fim.
- Inventar produto, cor, estoque ou técnica que não está aqui.
- Prometer que alguém vai responder "em instantes" fora do horário comercial.
- Fingir ser humano se a pessoa perguntar com sinceridade se está falando com robô, IA ou atendimento automático: responda a verdade, de forma leve (ex.: "Sou o atendimento automático da Compass, a ${cfg.assinatura} acompanha tudo e já já ela assume contigo 😊") e transfira.

QUANDO TRANSFERIR (transferir = true):
- No fim da etapa D (ver ETAPAS).
- Na hora, se: a pessoa pedir para falar com alguém, já for cliente com pedido em andamento, reclamação, assunto que não é orçamento (fornecedor, vaga de emprego, cobrança), áudio que você não consegue ouvir, ou a conversa travar.
- Se já fez ${MAX_TURNOS - 2} ou mais respostas, transfira.
Ao transferir por áudio: diga só algo como "Recebi teu áudio! Já te respondo 😊".
Se a pessoa mandar foto/arquivo (ex.: logo) em qualquer momento, agradeça e anote em "gravacao".

CATÁLOGO DA COMPASS (nome, código e pedido mínimo; sem preços):
${catalogoResumo()}

Responda SEMPRE chamando a ferramenta "responder".`;
  // 27/11: a parte que muda a cada mensagem vai num bloco separado, DEPOIS da parte fixa,
  // para a parte fixa (instruções + catálogo) ser reaproveitada pelo cache da Anthropic (~20x mais barata)
  const contexto = `CONTEXTO DESTA CONVERSA:
AGORA: ${quando} (horário de Brasília). ${expediente ? "Estamos no horário comercial (seg a sex, 8h às 18h)." : "Estamos FORA do horário comercial (seg a sex, 8h às 18h)."}
Nome do contato no WhatsApp: ${nomeContato || "(sem nome)"}. Primeiro nome para usar: ${primeiroNome(nomeContato) || "NENHUM (não invente nome; comece só com \"Oi, tudo bem?\")"}.
Já anotado desta conversa: ${JSON.stringify(dados)}.
Respostas suas até agora nesta conversa: ${turnos}.
AINDA FALTA SABER (antes da mensagem nova do cliente): ${falta.length ? falta.join(", ") : "nada obrigatório"}.`;
  return { fixo, contexto };
}

const FERRAMENTA = {
  name: "responder",
  description: "Envia a resposta ao cliente e atualiza o que já se sabe do pedido.",
  input_schema: {
    type: "object",
    properties: {
      mensagens: { type: "array", items: { type: "string" }, description: "1 a 3 mensagens curtas, na ordem em que serão enviadas." },
      dados: {
        type: "object",
        description: "Tudo o que já se sabe (repita o que já estava anotado e acrescente o novo).",
        properties: {
          nome: { type: "string" }, empresa: { type: "string" }, ocasiao: { type: "string" }, produto: { type: "string" },
          codigo: { type: "string" }, quantidade: { type: "string" }, prazo: { type: "string" }, gravacao: { type: "string" },
          cidade: { type: "string" }, tamanho: { type: "string" }, cor: { type: "string" }, investimento: { type: "string" }, observacoes: { type: "string" },
        },
      },
      transferir: { type: "boolean", description: "true para passar a conversa para a equipe agora." },
      resumo: { type: "boolean", description: "true quando esta resposta traz o resumo do que o cliente informou (etapa B)." },
      pedir_entrega: { type: "boolean", description: "true quando o lead está completo: o sistema manda o link dos dados de entrega para a cotação do frete." },
      motivo: { type: "string", description: "Motivo curto da transferência (ex.: 'lead completo', 'pediu atendente', 'áudio')." },
    },
    required: ["mensagens", "dados", "transferir"],
  },
};

interface Resposta {
  mensagens: string[];
  dados: DadosLead;
  transferir: boolean;
  pedir_entrega?: boolean;
  resumo?: boolean;
  motivo?: string;
}

/** Transforma o histórico em turnos user/assistant (mesmo autor seguido = uma mensagem). */
function montarTurnos(msgs: { de: string; texto: string; tipo?: string }[]) {
  const turnos: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of msgs) {
    const role = m.de === "compass" ? "assistant" : "user";
    let t = String(m.texto || "").trim();
    if (/^album:/i.test(t)) continue;
    if (/^error$/i.test(m.tipo || "") || /^\[Undecryptable\]/i.test(t)) continue; // aviso "não foi possível descriptografar" (a mensagem real vem depois)
    if (/audio/i.test(m.tipo || "") || t === "[audio]") t = "[o cliente mandou um ÁUDIO que você não consegue ouvir]";
    else if (/image/i.test(m.tipo || "") || t === "[image]") t = "[o cliente mandou uma FOTO]" ;
    else if (/document/i.test(m.tipo || "") || t === "[document]") t = "[o cliente mandou um ARQUIVO]";
    else if (/sticker/i.test(m.tipo || "")) t = "[figurinha]";
    else if (/video/i.test(m.tipo || "")) t = "[o cliente mandou um VÍDEO]";
    if (role === "assistant" && /^\[/.test(t)) t = "(enviou uma foto/arquivo)";
    if (!t) continue;
    const ult = turnos[turnos.length - 1];
    if (ult && ult.role === role) ult.content += "\n" + t;
    else turnos.push({ role, content: t });
  }
  while (turnos.length && turnos[0].role !== "user") turnos.shift();
  if (turnos.length && turnos[turnos.length - 1].role !== "user") turnos.push({ role: "user", content: "(sem mensagem nova)" });
  return turnos.slice(-30);
}

async function chamarClaude(system: { fixo: string; contexto: string }, turnos: { role: string; content: string }[]): Promise<Resposta | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY não configurada");
  const modelos = [process.env.AGENTE_MODEL || "claude-sonnet-5-5", "claude-haiku-4-5-20251001"];
  let ultimoErro = "";
  for (const model of Array.from(new Set(modelos))) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        system: [{ type: "text", text: system.fixo, cache_control: { type: "ephemeral" } }, { type: "text", text: system.contexto }],
        tools: [FERRAMENTA],
        tool_choice: { type: "tool", name: "responder" },
        messages: turnos,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      ultimoErro = `${model} ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`;
      if (res.status === 404 || res.status === 400) continue; // modelo indisponível: tenta o próximo
      throw new Error("Anthropic " + ultimoErro);
    }
    const data = await res.json();
    const uso = (data?.content || []).find((c: any) => c.type === "tool_use");
    if (!uso?.input) return null;
    const r = uso.input as Resposta;
    r.mensagens = (Array.isArray(r.mensagens) ? r.mensagens : []).map((m) => String(m || "").trim()).filter(Boolean).slice(0, 4);
    r.dados = r.dados && typeof r.dados === "object" ? r.dados : {};
    return r;
  }
  throw new Error("Anthropic " + ultimoErro);
}

/* ---------------- avisos para a equipe ---------------- */

export async function grupoEquipe(): Promise<string> {
  let grupo = process.env.WA_GRUPO_RECIBOS || "";
  if (grupo) return grupo;
  const h = (await redis<string[] | null>(["HGETALL", "compass:wa:grupos"]).catch(() => null)) || [];
  const alvo = (process.env.WA_GRUPO_RECIBOS_NOME || "compass recibos").toLowerCase();
  const n = (t: string) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  for (let i = 0; i + 1 < h.length; i += 2) if (String(h[i]).endsWith("@g.us") && n(h[i + 1]) === n(alvo)) return h[i];
  return "";
}

function fone(num: string) {
  let d = num.replace(/^55/, "");
  if (d.length === 10 && /[6-9]/.test(d[2])) d = d.slice(0, 2) + "9" + d.slice(2); // celular salvo sem o 9
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : num;
}

async function avisarEquipe(e: EstadoAgente, nome: string, teste: boolean) {
  const grupo = await grupoEquipe();
  if (!grupo) return;
  const d = e.dados;
  const linhas = [
    `🧭 *Lead pronto para orçamento*${teste ? " (TESTE)" : ""}`,
    `${d.nome || nome || "Sem nome"} · ${fone(e.num)}`,
    d.empresa ? `Empresa: ${d.empresa}` : "",
    d.ocasiao ? `Ocasião: ${d.ocasiao}` : "",
    `Produto: ${[d.produto, d.codigo].filter(Boolean).join(" ") || "—"}`,
    d.cor ? `Cor: ${d.cor}` : "",
    `Quantidade: ${d.quantidade || "—"}`,
    `Prazo: ${d.prazo || "—"}`,
    `Arte/gravação: ${d.gravacao || "—"}`,
    d.tamanho ? `Tamanho: ${d.tamanho}` : "",
    d.investimento ? `Investimento por peça: ${d.investimento}` : "",
    d.cidade ? `Cidade: ${d.cidade}` : "",
    e.freteId ? `Dados de entrega: link enviado ao cliente (${SITE}/frete/${e.freteId}); aparecem no painel em Cotação de frete → Dados pedidos aos clientes` : "",
    d.observacoes ? `Obs.: ${d.observacoes}` : "",
    e.motivo && e.motivo !== "lead completo" ? `Motivo da transferência: ${e.motivo}` : "",
    "O atendimento automático parou nessa conversa. É só responder pelo celular ou pelo painel.",
  ].filter(Boolean);
  await enviarTexto(grupo, linhas.join("\n")).catch(() => {});
}

/* ---------------- quem recebe o agente ---------------- */

const VEIO_CATALOGO = /vim pelo (cat[aá]logo|site)|quero um or[cç]amento de:|\bRef:\s*[A-Z0-9-]{4,}/i;
const SAUDACAO_ANUNCIO = /posso ter mais informa|quero saber mais|tenho interesse|mais informa[cç][oõ]es|vi (o|seu|teu) an[uú]ncio|me interessei/i;

async function elegivel(cfg: AgenteCfg, num: string): Promise<boolean> {
  if (cfg.modo === "desligado") return false;
  if (cfg.teste.includes(num)) return true; // 27/11: números de teste sempre recebem o atendimento (também no modo "novos")
  if (cfg.modo === "teste") return false;
  // modo "novos": só quem nunca recebeu mensagem da Compass e chegou agora
  const msgs = await historico(num, 40, 0);
  if (!msgs.length) return false;
  if (msgs.some((m: any) => m.de === "compass")) return false;
  const primeira = Date.parse(msgs[0].em) || 0;
  if (Date.now() - primeira > 30 * 60 * 1000) return false; // conversa começou há mais de 30 min sem resposta: deixa para a equipe
  if (msgs.length > 8) return false;
  if (await clienteBling(num)) return false; // já é cliente cadastrado no Bling
  return true;
}

/**
 * Chamado pelo webhook para cada mensagem individual recebida de cliente.
 * Espera alguns segundos para juntar mensagens seguidas, conversa e, quando
 * tiver o necessário, passa para a equipe.
 */
/** Tira a assinatura "*Nome:*" que o WhatsApp Business da equipe coloca na primeira linha. */
const semAssinatura = (t: string) => String(t || "").replace(/^\s*\*[^*\n]{1,40}:\*\s*\n/, "").trim();

export async function mensagemAgente(o: { num: string; nome: string; texto: string; id: string; salvo?: boolean }) {
  const num = so(o.num);
  if (!num) return { acao: "sem-numero" };
  // mensagem repetida do webhook
  if (o.id) {
    const novo = await redis<string | null>(["SET", K_VISTO(o.id), "1", "NX", "EX", DIA]).catch(() => "OK");
    if (novo !== "OK") return { acao: "repetida" };
  }
  const cfg = await lerCfg();
  if (cfg.modo === "desligado") return { acao: "desligado" };

  // comando de teste: recomeça a conversa do agente
  // 27/11: o WhatsApp da equipe põe a assinatura "*Galhardo:*" antes do texto; ignora essa linha
  if (cfg.teste.includes(num) && /^#?reiniciar$/i.test(semAssinatura(o.texto))) {
    await apagarEstado(num);
    await enviarTexto(num, "(teste) Conversa do atendimento automático reiniciada. Manda um \"oi\" para começar de novo.").catch(() => {});
    return { acao: "reiniciado" };
  }

  let e = await lerEstado(num);
  if (e && e.status !== "ativo") {
    // já passou pela triagem: não refaz o processo; só marca que o cliente está esperando
    e.clienteEm = new Date().toISOString();
    await gravarEstado(e);
    return { acao: "parado", status: e.status };
  }
  if (!e) {
    if (cfg.modo === "novos" && o.salvo && !cfg.teste.includes(num)) {
      // contato salvo que pede orçamento pelo catálogo ou pelo site: sem resposta automática (é com a equipe),
      // mas entra nos leads do painel piscando e avisa o grupo, para não passar despercebido
      if (VEIO_CATALOGO.test(o.texto)) {
        const agora = new Date().toISOString();
        const refs = textoRefs(o.texto);
        const prod = /📦\s*\*?([^*\n]+)/.exec(o.texto);
        const novo: EstadoAgente = {
          num, status: "transferido", inicio: agora, atualizadoEm: agora, turnos: 0,
          dados: { nome: o.nome || "", produto: prod ? prod[1].trim() : "", observacoes: ["pedido pelo catálogo/site (contato salvo)", refs ? "Ref.: " + refs : ""].filter(Boolean).join(" · ") },
          motivo: "pedido pelo catálogo (contato salvo)", transferidoEm: agora, clienteEm: agora, avisoGrupoEsperaEm: agora,
        };
        await gravarEstado(novo);
        await avisarEquipe(novo, o.nome, cfg.teste.includes(num)).catch(() => {});
        return { acao: "catalogo-salvo" };
      }
      return { acao: "fora", motivo: "contato salvo no WhatsApp" };
    }
    if (!(await elegivel(cfg, num))) return { acao: "fora" };
    e = { num, status: "ativo", inicio: new Date().toISOString(), atualizadoEm: new Date().toISOString(), turnos: 0, dados: {} };
    if (SAUDACAO_ANUNCIO.test(o.texto)) e.dados.observacoes = "veio de anúncio";
    await gravarEstado(e);
  }

  // junta mensagens seguidas: só a última mensagem da sequência responde
  const marca = o.id || String(Date.now());
  await redis(["SET", K_ULT(num), marca, "EX", 120]).catch(() => {});
  await dorme(ESPERA_MS);
  const ultima = await redis<string | null>(["GET", K_ULT(num)]).catch(() => marca);
  if (ultima !== marca) return { acao: "aguardando-mais" };
  const trava = await redis<string | null>(["SET", K_LOCK(num), marca, "NX", "EX", 50]).catch(() => "OK");
  if (trava !== "OK") return { acao: "ocupado" };

  try {
    // alguém da equipe pode ter assumido enquanto esperava
    e = await lerEstado(num);
    if (!e || e.status !== "ativo") return { acao: "parado" };

    // só a conversa desde que o agente começou (nos testes, depois de "#reiniciar", não mistura a conversa antiga)
    const desde = (Date.parse(e.inicio) || 0) - 2 * 60 * 1000;
    const msgs = ((await historico(num, 40, 0)) as any[]).filter((m) => (Date.parse(m.em) || 0) >= desde && !/^#?reiniciar$/i.test(semAssinatura(String(m.texto || ""))));
    const turnos = montarTurnos(msgs);
    if (!turnos.length) return { acao: "sem-mensagem" };
    const refs = textoRefs(msgs.filter((m: any) => m.de !== "compass").map((m: any) => m.texto || "").join("\n"));
    const extraRefs = refs ? `\n\nCÓDIGOS ANTIGOS citados pelo cliente (catálogo antigo): ${refs}. Use sempre o código CB e o nome atual. Se o nome que o cliente escreveu não bater com o produto do código (ex.: pediu "kit" e o código é da garrafa sozinha), pergunte com gentileza qual dos dois ele quer. Guarde o código CB em dados.codigo.` : "";
    const ps = promptSistema(cfg, o.nome, e.dados, e.turnos, !!e.resumoFeito);
    const r = await chamarClaude({ fixo: ps.fixo, contexto: ps.contexto + extraRefs }, turnos);
    if (!r) return { acao: "sem-resposta" };

    // pausa entre bolhas, como alguém digitando
    for (let i = 0; i < r.mensagens.length; i++) {
      const m = r.mensagens[i];
      // antes da 1ª bolha: alguns segundos "digitando"; antes do resumo, mais tempo (parece que conferiu)
      if (i === 0) await dorme(r.resumo ? 4000 : 1250);
      else await dorme(Math.min(1750, 450 + m.length * 12));
      // a equipe assumiu no meio? para de mandar
      const agora = await lerEstado(num);
      if (!agora || agora.status !== "ativo") return { acao: "parado-no-meio" };
      await enviarTexto(num, m);
      const quando = Date.now();
      await registrarMensagem({ num, texto: m, tipo: "agente", deCompass: true, quando, id: `agente-${quando}-${i}` }).catch(() => {});
    }

    e.dados = { ...e.dados, ...Object.fromEntries(Object.entries(r.dados).filter(([, v]) => v && String(v).trim())) };
    if (!e.dados.nome && o.nome) e.dados.nome = o.nome;
    if (r.resumo) e.resumoFeito = true;
    e.turnos += 1;
    // etapa automática: linha + quantidade + logo resolvida → link dos dados (não depende da IA marcar)
    const completoLead = !!e.resumoFeito && faltando(e.dados, true).length === 0;
    if (completoLead) r.pedir_entrega = true;
    const transferir = r.transferir || completoLead || e.turnos >= MAX_TURNOS;
    if (transferir) {
      e.status = "transferido";
      e.transferidoEm = new Date().toISOString();
      e.motivo = r.motivo || (e.turnos >= MAX_TURNOS ? "conversa longa" : "lead completo");
      // lead completo: link para o cliente preencher os dados de entrega (cotação do frete na São Miguel).
      // autoEnviar=false: a cotação só vai para a transportadora depois que a equipe informar volumes e valor da NF.
      if (r.pedir_entrega && faltando(e.dados, true).filter((x) => x !== "logomarca").length === 0) {
        try {
          const f = await criarFormFrete({
            clienteNome: e.dados.empresa || e.dados.nome || o.nome || "",
            pedido: "lead WhatsApp",
            produto: [e.dados.quantidade, e.dados.produto, e.dados.cor].filter(Boolean).join(" · ").slice(0, 200),
            whatsCliente: num,
            autoEnviar: false,
            agente: true,
          });
          e.freteId = f.id;
          const { expediente } = contextoAgora();
          void expediente;
          const textos = [
            `Para o transporte e o orçamento formal, preciso de alguns dados teus. É rapidinho, preenche nesse link:\n${SITE}/frete/${f.id}`,
          ];
          for (let k = 0; k < textos.length; k++) {
            await dorme(k === 0 ? 1500 : 1250);
            await enviarTexto(num, textos[k]);
            await registrarMensagem({ num, texto: textos[k], tipo: "agente", deCompass: true, quando: Date.now(), id: `agente-frete-${f.id}-${k}` }).catch(() => {});
          }
        } catch {
          /* sem link: a equipe pede os dados */
        }
      }
      await gravarEstado(e);
      const lead = {
        telefone: num,
        nome: e.dados.nome || o.nome || "",
        categoria_ou_codigo: [e.dados.produto, e.dados.codigo].filter(Boolean).join(" "),
        faixa_quantidade: e.dados.quantidade || "",
        prazo_e_gravacao: [e.dados.prazo, e.dados.gravacao].filter(Boolean).join(" · "),
        frete_link: e.freteId ? `${SITE}/frete/${e.freteId}` : "",
        dados: e.dados,
        motivo: e.motivo,
        teste: cfg.modo === "teste",
        status: "aguardando_vendedor",
        em: new Date().toISOString(),
      };
      await redis(["LPUSH", K_LEADS, JSON.stringify(lead)]).catch(() => {});
      await redis(["LTRIM", K_LEADS, 0, 499]).catch(() => {});
      await avisarEquipe(e, o.nome, cfg.modo === "teste");
      return { acao: "transferido", lead };
    }
    await gravarEstado(e);
    return { acao: "respondido", mensagens: r.mensagens.length };
  } finally {
    await redis(["DEL", K_LOCK(num)]).catch(() => {});
  }
}


/**
 * O cliente preencheu o link dos dados (formulário criado pelo agente):
 * manda o resumo final e avisa que a Compass dá continuidade (cotação primeiro; arte e layout depois de aprovada).
 */
export async function dadosPreenchidosAgente(f: { id: string; whatsCliente?: string; dest?: { nome?: string; cidade?: string; uf?: string } }) {
  const num = so(f.whatsCliente);
  if (!num) return false;
  const e = await lerEstado(num);
  if (!e || e.freteId !== f.id) return false;
  e.dadosEm = new Date().toISOString();
  await gravarEstado(e);
  const d = e.dados;
  const primeiro = String(d.nome || f.dest?.nome || "").trim().split(/\s+/)[0] || "";
  const prod = [d.quantidade ? d.quantidade + " ×" : "", d.produto, d.tamanho && !String(d.produto || "").includes(d.tamanho) ? d.tamanho : ""].filter(Boolean).join(" ");
  const linhas = [
    prod,
    d.cor ? `Cor: ${d.cor}` : "",
    d.prazo ? `Entrega até: ${d.prazo}` : "",
    d.gravacao ? `Arte: ${d.gravacao}` : "",
    f.dest?.cidade ? `Entrega em: ${f.dest.cidade}${f.dest.uf ? "/" + f.dest.uf : ""}` : "",
  ].filter(Boolean);
  const { expediente } = contextoAgora();
  const textos = [
    `Recebi teus dados, obrigada${primeiro ? " " + primeiro : ""}! 😊`,
    `Resumo do teu pedido:\n${linhas.join("\n")}`,
    `A partir de agora o teu atendimento segue com a ${process.env.AGENTE_ASSINATURA || "Katy"}, que fica à disposição para negociação e dúvidas${expediente ? "" : " (nosso atendimento é de seg a sex, das 8h às 18h)"}. Se tiver alguma dúvida, é só chamar por aqui! 😊`,
  ];
  for (let k = 0; k < textos.length; k++) {
    await dorme(k === 0 ? 750 : 1250);
    await enviarTexto(num, textos[k]);
    await registrarMensagem({ num, texto: textos[k], tipo: "agente", deCompass: true, quando: Date.now(), id: `agente-fim-${f.id}-${k}` }).catch(() => {});
  }
  const grupo = await grupoEquipe();
  if (grupo) await enviarTexto(grupo, `✅ *Dados preenchidos* por ${d.nome || f.dest?.nome || fone(num)} · ${fone(num)}\n${linhas.join("\n")}\nPara cotar na São Miguel: gestor → Cotação de frete → "Usar na cotação" → informar valor da NF e caixas (medidas e peso) → botão verde.`).catch(() => {});
  return true;
}


/* ---------------- clientes já cadastrados no Bling ---------------- */

const K_BLING = "compass:agente:fonesBling";
/** Últimos 8 dígitos (sem DDD e sem o 9 extra) de um telefone. */
const chaveFone = (t: string) => so(t).replace(/^55/, "").slice(-8);

async function carregarFonesBling(): Promise<number> {
  const { bling } = await import("@/lib/bling-api");
  const fones = new Set<string>();
  for (let pagina = 1; pagina <= 40; pagina++) {
    const r: any = await bling(`/contatos?pagina=${pagina}&limite=100`).catch(() => null);
    const lista: any[] = r?.data || [];
    for (const c of lista) for (const t of [c.celular, c.telefone]) { const k = chaveFone(t || ""); if (k.length === 8) fones.add(k); }
    if (lista.length < 100) break;
    await dorme(350); // o Bling aceita 3 req/s
  }
  if (!fones.size) return 0;
  await redis(["DEL", K_BLING]);
  const arr = Array.from(fones);
  for (let i = 0; i < arr.length; i += 500) await redis(["SADD", K_BLING, ...arr.slice(i, i + 500)]);
  await redis(["EXPIRE", K_BLING, DIA]);
  return fones.size;
}

/** true se o número é de um contato do Bling (cliente já cadastrado). Lista atualizada 1x por dia. */
export async function clienteBling(num: string): Promise<boolean> {
  try {
    const existe = await redis<number>(["EXISTS", K_BLING]);
    if (!existe) await carregarFonesBling();
    return (await redis<number>(["SISMEMBER", K_BLING, chaveFone(num)])) === 1;
  } catch {
    return false; // Bling fora do ar: não bloqueia
  }
}

/* ---------------- depois da transferência: lembretes e avisos ---------------- */

const MIN = 60 * 1000;
const ms = (iso?: string) => (iso ? Date.parse(iso) || 0 : 0);

/**
 * Roda a cada mensagem do webhook e quando o painel consulta os leads (no máximo 1x por minuto):
 * - 30 min sem preencher os dados → oferece um pré-orçamento e avisa a equipe;
 * - cliente escreveu depois da transferência e ninguém respondeu em 10 min → "nosso atendente entra em contato assim que possível".
 */
export async function tickAgente() {
  const livre = await redis<string | null>(["SET", "compass:agente:tick", "1", "NX", "EX", 60]).catch(() => null);
  if (livre !== "OK") return { rodou: false };
  const agora = Date.now();
  const feitos: string[] = [];
  const lista = await listarAgente(150);
  for (const e of lista) {
    if (e.status === "ativo") continue;
    const humano = ms(e.humanoEm);
    // 1) lembrete dos dados
    if (e.status === "transferido" && e.freteId && !e.dadosEm && !e.lembreteDadosEm && ms(e.transferidoEm) && agora - ms(e.transferidoEm) > 30 * MIN && agora - ms(e.transferidoEm) < 3 * DIA * 1000 && humano < ms(e.transferidoEm)) {
      const trava = await redis<string | null>(["SET", `compass:agente:lemb:${e.num}`, "1", "NX", "EX", DIA]).catch(() => null);
      if (trava === "OK") {
        const txt = "Ainda não recebemos teus dados de contato. Se preferir, a gente te manda um pré-orçamento pra tu validar a proposta 😊";
        await enviarTexto(e.num, txt).catch(() => {});
        await registrarMensagem({ num: e.num, texto: txt, tipo: "agente", deCompass: true, quando: Date.now(), id: `agente-lemb-${Date.now()}` }).catch(() => {});
        e.lembreteDadosEm = new Date().toISOString();
        await gravarEstado(e);
        const g = await grupoEquipe();
        if (g) await enviarTexto(g, `⏰ *${e.dados.nome || fone(e.num)}* (${fone(e.num)}) não preencheu os dados em 30 min. Ofereci um pré-orçamento. Fiquem atentos para chamar.`).catch(() => {});
        feitos.push("lembrete " + e.num);
      }
    }
    // 2) cliente esperando resposta depois da transferência
    const cliente = ms(e.clienteEm);
    if (e.status === "transferido" && cliente && cliente > humano) {
      // aviso no grupo só enquanto ninguém da equipe respondeu depois da transferência;
      // depois que a Compass respondeu, a espera aparece só no gestor ("Cliente esperando resposta")
      const equipeJaRespondeu = humano > 0 && humano >= ms(e.transferidoEm);
      if (!equipeJaRespondeu && !eDaEquipe(e.num) && cliente > ms(e.avisoGrupoEsperaEm)) {
        const g = await grupoEquipe();
        if (g) await enviarTexto(g, `💬 *${e.dados.nome || fone(e.num)}* (${fone(e.num)}) mandou mensagem e está esperando resposta.`).catch(() => {});
        e.avisoGrupoEsperaEm = new Date().toISOString();
        await gravarEstado(e);
      }
      // contato salvo (pedido pelo catálogo): nada automático para o cliente, só o aviso da equipe
      if (!/contato salvo/.test(e.motivo || "") && agora - cliente > 10 * MIN && cliente > ms(e.avisoEsperaEm) && agora - ms(e.avisoEsperaEm) > 6 * 60 * MIN && agora - cliente < DIA * 1000) {
        const { expediente } = contextoAgora();
        const txt = expediente
          ? "Nosso atendente comercial entra em contato contigo assim que possível 😊"
          : "Nosso atendente comercial entra em contato contigo assim que possível, no nosso horário de atendimento (seg a sex, das 8h às 18h) 😊";
        await enviarTexto(e.num, txt).catch(() => {});
        await registrarMensagem({ num: e.num, texto: txt, tipo: "agente", deCompass: true, quando: Date.now(), id: `agente-espera-${Date.now()}` }).catch(() => {});
        e.avisoEsperaEm = new Date().toISOString();
        await gravarEstado(e);
        feitos.push("espera " + e.num);
      }
    }
  }
  return { rodou: true, feitos };
}

/** Números da própria equipe (Katy, Gali): conversas de teste não viram lead esperando resposta. */
export const NUMS_EQUIPE = Array.from(new Set(["5562985914340", "556285914340", "5562985939980", "556285939980", ...(process.env.WA_NUMS_EQUIPE || "").split(/[,;\s]+/).map(so).filter(Boolean)]));
export const eDaEquipe = (num: string, teste: string[] = []) => NUMS_EQUIPE.includes(so(num)) || teste.includes(so(num));

/** Situação de cada lead para o painel (o que pede atenção pisca). Números da equipe/teste nunca piscam. */
export function situacaoLead(e: EstadoAgente, teste: string[] = []): { situacao: string; atencao: boolean; daEquipe?: boolean } {
  if (eDaEquipe(e.num, teste)) return { situacao: "Teste da equipe", atencao: false, daEquipe: true };
  const humano = ms(e.humanoEm);
  if (e.status === "ativo") return { situacao: "Em atendimento automático", atencao: false };
  if (ms(e.clienteEm) > humano) return { situacao: "Cliente esperando resposta", atencao: true };
  if (e.status === "humano") return { situacao: "Com a equipe", atencao: false };
  if (humano > ms(e.transferidoEm)) return { situacao: "Com a equipe", atencao: false };
  if (e.dadosEm) return { situacao: "Dados preenchidos: fazer orçamento", atencao: true };
  if (e.lembreteDadosEm) return { situacao: "Sem dados após 30 min: oferecer pré-orçamento", atencao: true };
  if (e.freteId) return { situacao: "Aguardando o cliente preencher os dados", atencao: false };
  return { situacao: "Transferido: " + (e.motivo || "responder"), atencao: true };
}


/** Cliente preencheu o link do botão "Pedir dados" do painel: agradece e avisa a equipe. */
export async function dadosPreenchidosPainel(f: { id: string; whatsCliente?: string; dest?: { nome?: string; doc?: string; cidade?: string; uf?: string } }) {
  const num = so(f.whatsCliente);
  const nome = String(f.dest?.nome || "").trim();
  if (num) {
    const txt = `Recebi teus dados, obrigada${primeiroNome(nome) ? " " + primeiroNome(nome) : ""}! 😊 Já seguimos com o teu orçamento e te chamo aqui.`;
    await enviarTexto(num, txt).catch(() => {});
    await registrarMensagem({ num, texto: txt, tipo: "conversation", deCompass: true, quando: Date.now(), id: `dados-${f.id}` }).catch(() => {});
  }
  const g = await grupoEquipe();
  if (g) await enviarTexto(g, `✅ *Dados preenchidos* por ${nome || (num ? fone(num) : "cliente")}${num ? " · " + fone(num) : ""}${f.dest?.cidade ? "\nEntrega em: " + f.dest.cidade + (f.dest.uf ? "/" + f.dest.uf : "") : ""}\nAparecem no gestor na ficha do cliente e em Cotação de frete → Dados pedidos aos clientes.`).catch(() => {});
}
