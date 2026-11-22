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
}

const K_CFG = "compass:agente:cfg";
const K_EST = (n: string) => `compass:agente:s:${n}`;
const K_ULT = (n: string) => `compass:agente:ult:${n}`;
const K_LOCK = (n: string) => `compass:agente:lock:${n}`;
const K_VISTO = (id: string) => `compass:agente:visto:${id}`;
const K_LEADS = "compass:agente:leads";
const K_ATIVOS = "compass:agente:ativos";

const DIA = 86400;
const ESPERA_MS = 9000; // espera o cliente terminar de digitar (várias mensagens seguidas)
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
  if (!e || e.status !== "ativo") return false;
  e.status = "humano";
  e.motivo = motivo;
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
  const temTam = /\d\s*(ml|l\b|litro)/i.test(`${d.produto || ""} ${d.tamanho || ""}`);
  if (!d.produto && !d.codigo) f.push("produto");
  else if (/copo|caneca|garrafa|squeeze|coqueteleira/i.test(d.produto || "") && !temTam) f.push("tamanho");
  if (!d.cor) f.push("cor");
  if (!d.quantidade) f.push("quantidade");
  if (!d.prazo) f.push("data de entrega");
  if (!resumoFeito) f.push("resumo");
  if (!d.gravacao) f.push("arte");
  return f;
}

function promptSistema(cfg: AgenteCfg, nomeContato: string, dados: DadosLead, turnos: number, resumoFeito: boolean) {
  const falta = faltando(dados, resumoFeito);
  const { quando, expediente } = contextoAgora();
  return `Você responde o WhatsApp da Compass Brindes Corporativos (Iraí/RS) no lugar da ${cfg.assinatura}, que é dona da empresa junto com o Galhardo. Você conversa com pessoas que acabaram de chegar, quase sempre por anúncio no Instagram/Facebook ou promoção. Seu trabalho é receber bem, entender o que a pessoa precisa e passar para a ${cfg.assinatura} montar o orçamento.

AGORA: ${quando} (horário de Brasília). ${expediente ? "Estamos no horário comercial (seg a sex, 8h às 18h)." : "Estamos FORA do horário comercial (seg a sex, 8h às 18h)."}
Nome do contato no WhatsApp: ${nomeContato || "(sem nome)"}.
Já anotado desta conversa: ${JSON.stringify(dados)}.
Respostas suas até agora nesta conversa: ${turnos}.
AINDA FALTA SABER (antes da mensagem nova do cliente): ${falta.length ? falta.join(", ") : "nada obrigatório"}.

ETAPAS DO ATENDIMENTO (siga nessa ordem):
A) Perguntas: investimento por peça (já perguntado na primeira resposta; não repita) → produto/linha → tamanho (copos, canecas e garrafas) → cor → quantidade → data de entrega.
B) Resumo: quando A estiver completa, mande UMA bolha com o resumo do que o cliente informou, curto e natural, uma informação por linha, por exemplo:
"Deixa eu ver se anotei certinho:
50 copos térmicos de 500ml
Cor preta
Entrega até 10/12"
e marque "resumo": true. Na mesma resposta, numa bolha separada, pergunte se a pessoa já tem a arte pronta ou a logomarca (ex.: "Tu já tem a arte pronta ou a logo da empresa? Se tiver, pode mandar aqui em PDF ou imagem que a gente já prepara um layout 😊").
C) Arte: se mandar o arquivo (foto/PDF), responda só "Recebido, obrigada! Vou deixar com a equipe pra desenvolver a arte 😊" e anote em "gravacao" (ex.: "logo enviada pelo WhatsApp"). Se não tiver arte, ou for só uma frase ou nome, anote em "gravacao" e diga que o nosso comercial ajuda a montar a arte. Se disser que manda depois, anote "manda a arte depois".
D) Dados: com a arte resolvida, NÃO pergunte mais nada e NÃO se despeça: logo depois da tua mensagem o SISTEMA manda sozinho o link para o cliente preencher os dados (nota fiscal, frete e orçamento). Quando o cliente preencher, o sistema manda o resumo final. Marque "pedir_entrega": true.

REGRA DO QUE FALTA (muito importante):
- Leia a mensagem nova do cliente, risque o que ele acabou de responder e SEMPRE termine tua resposta perguntando o próximo item que ainda falta, na ordem das etapas. Pode juntar 2 itens numa pergunta (ex.: "Qual tamanho e qual cor tu prefere?").
- Se o cliente respondeu só parte do que você perguntou, agradeça curto e pergunte de novo só o que ficou faltando. Ex.: você perguntou tamanho e quantidade e ele disse "10 peças" → "Show, 10 peças! E qual tamanho tu prefere?". Se ele disse só "500ml" → "Perfeito, 500ml! E de qual cor e quantas peças tu precisa?".
- Só considere o lead completo quando não faltar nenhum item acima.

JEITO DE ESCREVER (como a ${cfg.assinatura} escreve no WhatsApp):
- Mensagens curtas, como no celular: 1 a 3 bolhas, cada uma com 1 ou 2 frases.
- Português correto e simples, simpático e informal do Sul: "tu" ou "você", "a gente", "certinho", "show", "perfeito", "top". NÃO force gíria: nunca use "tav" (só serve para responder "tá bom") nem construções estranhas como "tu tava procurando por quê?".
- Sempre responda o cumprimento: se perguntarem "tudo bem?", responda ("Tudo ótimo, e contigo?" / "Tudo sim, e você?").
- Chame pelo primeiro nome quando souber. No máximo 1 emoji por bolha, e não em todas.
- Nada de negrito, títulos, "Prezado(a)", textão de propaganda ou frase de robô ("Como posso ajudar hoje?", "Fico à disposição para quaisquer dúvidas").
- No máximo 1 ou 2 perguntas por vez. Não repita pergunta já respondida. Responda primeiro o que a pessoa perguntou.
- Se o cliente escrever em outro idioma (ex.: espanhol), responda no idioma dele, no mesmo estilo.
- Exemplos reais do jeito dela: "Oi Luana tudo bem?" / "Qual a quantidade que você precisa?" / "Tu já tem a arte da personalização?" / "Vocês precisam para que dia?" / "Ahhh top" / "Nossa personalização é a laser".

PRIMEIRA RESPOSTA DA CONVERSA (quando você ainda não respondeu nada), 3 bolhas nesta ordem:
- Bolha 1: cumprimento + apresentação curta. Ex.: "Oi${nomeContato ? " " + nomeContato.split(" ")[0] : ""}! Tudo ótimo, e contigo? 😊 Aqui é a ${cfg.assinatura}, da Compass Brindes".
- Bolha 2: a pergunta do investimento, geral (vale para todos os brindes, não para um produto), exatamente neste sentido:
"Pra eu já te mostrar o que faz mais sentido: a gente trabalha com brindes desde opções mais econômicas, a partir de R$ 1,90, até peças executivas, acima de R$ 75,00 por peça. Tu tem uma ideia de quanto quer investir por peça?"
- Bolha 3: a lista, exatamente assim:
"Ou me conta da lista abaixo o que tu procura:
1 - Copos, canecas e garrafas térmicas
2 - Kits (churrasco, vinho, escritório, ferramentas)
3 - Mochilas, bolsas e nécessaires
4 - Eletrônicos (caixa de som, power bank, fone)
5 - Canetas, cadernetas e chaveiros
6 - Camisetas
7 - Canivetes e itens agro
É só mandar o número ou escrever o que precisa"
- Se a pessoa já disse na primeira mensagem o que quer (ex.: "quero 50 copos", ou um código CB), NÃO mande a lista: responda sobre o que ela pediu e mande a bolha 2 do investimento.
- Se o cliente responder só a faixa de investimento, sugira 2 ou 3 linhas/produtos que combinam com ela e pergunte qual interessa. Se responder só a linha, siga com o produto e NÃO repita a pergunta do investimento.
- Copos térmicos: quando falarem de copo térmico (ou escolherem a opção 1 sem dizer o produto), ofereça estes tamanhos, numa linha só: 260ml, 360ml, 470ml, 500ml, 900ml e 1200ml. Não ofereça outros tamanhos de copo, a não ser que o cliente peça um produto específico do catálogo.
- Quando a pessoa responder com um número (1 a 7), entenda como a linha da lista e sugira 2 ou 3 produtos dessa linha do catálogo (nome curto, sem código e sem preço), perguntando qual chamou atenção e a quantidade.

O QUE DESCOBRIR (nessa ordem natural, sem parecer formulário):
1. Qual produto ou tipo de brinde (pode sugerir 2 ou 3 do catálogo abaixo que combinem com a ocasião). Se a pessoa mandar um código (ex.: CB013), confirme qual é pelo catálogo. No copo térmico, o tamanho.
2. Cor de interesse (ex.: "Tem alguma cor de preferência?"). Não prometa que a cor tem em estoque: diga que vai confirmar.
3. Quantidade aproximada.
4. Para que data precisa receber.
5. (Arte/personalização vem depois do resumo: ver ETAPAS.)
6. Quanto pretende investir por peça (campo "investimento"): é perguntado UMA vez, na primeira resposta (bolha 2), de forma geral, sem ligar a um produto. Não pergunte de novo. Os valores R$ 1,90 e R$ 75,00 são os ÚNICOS que você pode citar, e só nessa pergunta; nunca diga preço de um produto. Se a pessoa não souber ou não quiser dizer, tudo bem, siga. Se a faixa dela não combina com o produto escolhido, não comente preço: anote e, se fizer sentido, sugira 1 ou 2 produtos do catálogo que costumam caber melhor.
Bom saber, se aparecer naturalmente: empresa ou para quem é, ocasião.

O QUE A COMPASS FAZ:
- Brindes personalizados para empresas, eventos, escolas e pessoas. Entrega para todo o Brasil por transportadora.
- Personalização principal: gravação a LASER (no inox o laser tira a tinta e aparece o metal, fica em uma cor só). Gravação colorida não é o padrão nos copos e garrafas; se pedirem colorido ou foto, diga que vai ver com a equipe a melhor forma e anote.
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

async function chamarClaude(system: string, turnos: { role: string; content: string }[]): Promise<Resposta | null> {
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
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
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

async function grupoEquipe(): Promise<string> {
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

const SAUDACAO_ANUNCIO = /posso ter mais informa|quero saber mais|tenho interesse|mais informa[cç][oõ]es|vi (o|seu|teu) an[uú]ncio|me interessei/i;

async function elegivel(cfg: AgenteCfg, num: string): Promise<boolean> {
  if (cfg.modo === "desligado") return false;
  if (cfg.modo === "teste") return cfg.teste.includes(num);
  // modo "novos": só quem nunca recebeu mensagem da Compass e chegou agora
  const msgs = await historico(num, 40, 0);
  if (!msgs.length) return false;
  if (msgs.some((m: any) => m.de === "compass")) return false;
  const primeira = Date.parse(msgs[0].em) || 0;
  if (Date.now() - primeira > 30 * 60 * 1000) return false; // conversa começou há mais de 30 min sem resposta: deixa para a equipe
  return msgs.length <= 8;
}

/**
 * Chamado pelo webhook para cada mensagem individual recebida de cliente.
 * Espera alguns segundos para juntar mensagens seguidas, conversa e, quando
 * tiver o necessário, passa para a equipe.
 */
export async function mensagemAgente(o: { num: string; nome: string; texto: string; id: string }) {
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
  if (cfg.teste.includes(num) && /^#?reiniciar$/i.test(o.texto.trim())) {
    await apagarEstado(num);
    await enviarTexto(num, "(teste) Conversa do atendimento automático reiniciada. Manda um \"oi\" para começar de novo.").catch(() => {});
    return { acao: "reiniciado" };
  }

  let e = await lerEstado(num);
  if (e && e.status !== "ativo") return { acao: "parado", status: e.status };
  if (!e) {
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
    const msgs = ((await historico(num, 40, 0)) as any[]).filter((m) => (Date.parse(m.em) || 0) >= desde && !/^#?reiniciar$/i.test(String(m.texto || "").trim()));
    const turnos = montarTurnos(msgs);
    if (!turnos.length) return { acao: "sem-mensagem" };
    const r = await chamarClaude(promptSistema(cfg, o.nome, e.dados, e.turnos, !!e.resumoFeito), turnos);
    if (!r) return { acao: "sem-resposta" };

    // pausa entre bolhas, como alguém digitando
    for (let i = 0; i < r.mensagens.length; i++) {
      const m = r.mensagens[i];
      // antes da 1ª bolha: alguns segundos "digitando"; antes do resumo, mais tempo (parece que conferiu)
      if (i === 0) await dorme(r.resumo ? 8000 : 2500);
      else await dorme(Math.min(3500, 900 + m.length * 25));
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
    // etapa D automática: resumo feito + arte resolvida → link dos dados (não depende da IA marcar)
    const completoLead = !!e.resumoFeito && faltando(e.dados, true).length === 0;
    if (completoLead) r.pedir_entrega = true;
    const transferir = r.transferir || completoLead || e.turnos >= MAX_TURNOS;
    if (transferir) {
      e.status = "transferido";
      e.motivo = r.motivo || (e.turnos >= MAX_TURNOS ? "conversa longa" : "lead completo");
      // lead completo: link para o cliente preencher os dados de entrega (cotação do frete na São Miguel).
      // autoEnviar=false: a cotação só vai para a transportadora depois que a equipe informar volumes e valor da NF.
      if (r.pedir_entrega && faltando(e.dados, true).filter((x) => x !== "arte").length === 0) {
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
            `Pra dar sequência, preciso de alguns dados teus pra nota fiscal, frete e pra validar o orçamento. É rapidinho, preenche nesse link:\n${SITE}/frete/${f.id}`,
          ];
          for (let k = 0; k < textos.length; k++) {
            await dorme(k === 0 ? 3000 : 2500);
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
 * manda o resumo final e avisa que a Compass dá continuidade (arte, layout e cotação).
 */
export async function dadosPreenchidosAgente(f: { id: string; whatsCliente?: string; dest?: { nome?: string; cidade?: string; uf?: string } }) {
  const num = so(f.whatsCliente);
  if (!num) return false;
  const e = await lerEstado(num);
  if (!e || e.freteId !== f.id) return false;
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
    `Agora a gente dá continuidade por aqui: assim que terminarmos a arte, o layout e a cotação, te mando tudo pra tu analisar${expediente ? "" : " (nosso atendimento é de seg a sex, das 8h às 18h)"}. Qualquer coisa é só chamar!`,
  ];
  for (let k = 0; k < textos.length; k++) {
    await dorme(k === 0 ? 1500 : 2500);
    await enviarTexto(num, textos[k]);
    await registrarMensagem({ num, texto: textos[k], tipo: "agente", deCompass: true, quando: Date.now(), id: `agente-fim-${f.id}-${k}` }).catch(() => {});
  }
  const grupo = await grupoEquipe();
  if (grupo) await enviarTexto(grupo, `✅ *Dados preenchidos* por ${d.nome || f.dest?.nome || fone(num)} · ${fone(num)}\n${linhas.join("\n")}\nAparecem no painel em Cotação de frete → Dados pedidos aos clientes.`).catch(() => {});
  return true;
}
