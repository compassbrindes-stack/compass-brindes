// Grupo "Compass Recibos" no WhatsApp → baixa de contas a receber no Bling.
//
// Como usar no grupo: mandar o comprovante (foto ou PDF) com a legenda
//   282            → pedido 282 (valor lido do comprovante, ou a parcela em aberto)
//   282 1875,00    → pedido 282, valor informado
//   282 entrada    → pedido 282, primeira parcela em aberto
// Também vale só texto, sem comprovante: "282 1875,00 pix".
//
// Contas a pagar (pagamento feito pela Compass): legenda começando com "pago"
//   pago internet 49,90   → acha a conta a pagar de 49,90 da Tchêturbo e dá baixa
//   pago táxi 32,00       → não há conta cadastrada: lança a despesa já paga
// Com ANTHROPIC_API_KEY o comprovante é lido (valor, favorecido, data).
//
// Regras de segurança:
// - só dá baixa quando o valor bate com uma parcela em aberto do pedido;
// - qualquer dúvida vira pergunta no grupo e nada é baixado;
// - cada mensagem é processada uma única vez.

import {
  baixarConta,
  baixarContaPagar,
  contasDoPedido,
  contasPagarAbertas,
  contatoFornecedor,
  detalheContaPagar,
  lancarDespesaPaga,
  nomeContato,
  type ContaPagar,
  type ContaReceber,
} from "@/lib/bling-api";
import { redis } from "@/lib/redis";
import { baixarMidia, enviarTexto } from "@/lib/uazapi";

export interface Legenda {
  pedido: string | null;
  valor: number | null;
  entrada: boolean;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => iso.split("-").reverse().join("/");

/** Lê "282", "PED 282", "pedido 282 1.875,00", "282 R$ 1875" etc. */
export function lerLegenda(texto: string): Legenda {
  const t = (texto || "").replace(/\s+/g, " ").trim();
  const entrada = /\bentrada\b/i.test(t);
  // valor: tem vírgula decimal ou vem depois de R$
  const mValor = /R\$\s*([\d.]+(?:,\d{1,2})?)|(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i.exec(t);
  let valor: number | null = null;
  let semValor = t;
  if (mValor) {
    const bruto = mValor[1] || mValor[2];
    valor = Number(bruto.replace(/\./g, "").replace(",", "."));
    if (!isFinite(valor) || valor <= 0) valor = null;
    semValor = t.replace(mValor[0], " ");
  }
  // números soltos (ignora datas como 13/10 e horas 10:30)
  const nums = [...semValor.matchAll(/(?<![\/\d:.,])(\d{2,6})(?![\/\d:.,])/g)].map((x) => x[1]);
  const aposPed = /ped(?:ido)?\.?\s*(?:n[º°o]\.?\s*)?(\d{2,6})/i.exec(semValor);
  const pedido = aposPed ? aposPed[1] : nums[0] || null;
  if (valor == null && pedido) {
    const outro = nums.find((n) => n !== pedido);
    if (outro) valor = Number(outro);
  }
  return { pedido, valor, entrada };
}

interface LidoComprovante {
  valor?: number;
  data?: string;
  pagador?: string;
  pagadorDoc?: string;
  favorecido?: string;
  favorecidoDoc?: string;
  banco?: string;
  descricao?: string;
}

const CNPJ_COMPASS = "26123176000124";

/** Lê valor, data, pagador e banco do comprovante com o Claude (opcional: só se ANTHROPIC_API_KEY existir). */
export async function lerComprovante(fileURL: string, mimetype: string): Promise<LidoComprovante | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !fileURL) return null;
  const arq = await fetch(fileURL, { cache: "no-store" });
  if (!arq.ok) return null;
  const b64 = Buffer.from(await arq.arrayBuffer()).toString("base64");
  const ePdf = /pdf/i.test(mimetype);
  const bloco = ePdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
    : { type: "image", source: { type: "base64", media_type: /png/i.test(mimetype) ? "image/png" : "image/jpeg", data: b64 } };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            bloco,
            {
              type: "text",
              text:
                'Este é um comprovante de pagamento brasileiro (PIX, TED, boleto pago ou cartão). Responda só com JSON: {"valor": número em reais, "data": "AAAA-MM-DD do pagamento", "pagador": "nome de quem pagou", "pagadorDoc": "CPF/CNPJ de quem pagou", "favorecido": "nome de quem recebeu / beneficiário / cedente", "favorecidoDoc": "CPF/CNPJ de quem recebeu", "banco": "banco", "descricao": "o que foi pago, se aparecer (ex.: internet, frete, fatura)"}. Use null no que não aparecer.',
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const txt = (data?.content || []).map((c: any) => c.text || "").join("");
  const m = /\{[\s\S]*\}/.exec(txt);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    return {
      valor: typeof j.valor === "number" ? j.valor : j.valor ? Number(String(j.valor).replace(/\./g, "").replace(",", ".")) : undefined,
      data: /^\d{4}-\d{2}-\d{2}$/.test(j.data || "") ? j.data : undefined,
      pagador: j.pagador || undefined,
      pagadorDoc: j.pagadorDoc || undefined,
      favorecido: j.favorecido || undefined,
      favorecidoDoc: j.favorecidoDoc || undefined,
      banco: j.banco || undefined,
      descricao: j.descricao || undefined,
    };
  } catch {
    return null;
  }
}

export interface Decisao {
  acao: "baixar" | "perguntar" | "ignorar";
  conta?: ContaReceber;
  valor?: number;
  motivo?: string;
}

/** Escolhe a parcela a baixar. Puro, para poder testar. */
export function decidir(contas: ContaReceber[], leg: Legenda, valorComprovante?: number): Decisao {
  if (!leg.pedido) return { acao: "ignorar" };
  if (!contas.length) return { acao: "perguntar", motivo: `não encontrei conta a receber em aberto do pedido ${leg.pedido} no Bling` };
  const valor = leg.valor ?? valorComprovante ?? null;
  const igual = (a: number, b: number) => Math.abs(a - b) < 0.01;
  if (valor != null) {
    const c = contas.find((x) => igual(x.valor, valor));
    if (c) return { acao: "baixar", conta: c, valor };
    const tot = contas.reduce((s, x) => s + x.valor, 0);
    if (igual(tot, valor) && contas.length > 1)
      return { acao: "perguntar", motivo: `${brl(valor)} é o total das ${contas.length} parcelas do pedido ${leg.pedido}. Para baixar todas, mande uma mensagem por parcela` };
    return { acao: "perguntar", motivo: `recebido ${brl(valor)}, mas as parcelas em aberto do pedido ${leg.pedido} são ${contas.map((x) => brl(x.valor)).join(", ")}` };
  }
  if (contas.length === 1 || leg.entrada) return { acao: "baixar", conta: contas[0], valor: contas[0].valor };
  return { acao: "perguntar", motivo: `o pedido ${leg.pedido} tem ${contas.length} parcelas em aberto (${contas.map((x) => `${dataBR(x.vencimento)} ${brl(x.valor)}`).join(", ")}). Mande "${leg.pedido} valor" para eu saber qual` };
}

export interface MsgRecibo {
  chat: string;
  messageid: string;
  texto: string;
  temMidia: boolean;
  remetente: string;
  quando: number;
}

const hojeSP = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

export async function processarRecibo(m: MsgRecibo) {
  // processa cada mensagem uma vez só
  const novo = await redis<string | null>(["SET", `compass:recibos:msg:${m.messageid}`, "1", "NX", "EX", 60 * 86400]);
  if (novo !== "OK") return { status: "repetida" };

  const leg = lerLegenda(m.texto);
  // pagamento feito pela Compass: legenda começa com "pago", "paguei", "despesa"… (ex.: "pago internet 49,90")
  const palavraPagar = /^\s*(pago|paga|paguei|pagamento|despesa|conta paga)\b/i.test(m.texto || "");
  if (!leg.pedido && !palavraPagar) return { status: "sem-pedido" }; // conversa normal do grupo: ignora

  let arquivo: { fileURL?: string; mimetype?: string } = {};
  let lido: LidoComprovante | null = null;
  if (m.temMidia) {
    try {
      arquivo = await baixarMidia(m.messageid);
      if (arquivo.fileURL) lido = await lerComprovante(arquivo.fileURL, arquivo.mimetype || "");
    } catch {
      /* sem o arquivo, segue com a legenda */
    }
  }

  // comprovante de pagamento feito pela Compass → contas a pagar
  const compassPagou = (lido?.pagadorDoc || "").replace(/\D/g, "") === CNPJ_COMPASS || /compass/i.test(lido?.pagador || "");
  const compassRecebeu = (lido?.favorecidoDoc || "").replace(/\D/g, "") === CNPJ_COMPASS || /compass/i.test(lido?.favorecido || "");
  if ((palavraPagar && !compassRecebeu) || (compassPagou && !leg.pedido)) {
    // em "pago bling 60" o número é valor, não pedido
    const legPag: Legenda = { pedido: null, valor: leg.valor ?? (leg.pedido ? Number(leg.pedido) : null), entrada: false };
    return processarPagamento(m, legPag, lido, arquivo.fileURL || null);
  }
  if (!leg.pedido) return { status: "sem-pedido" };

  const registro: Record<string, unknown> = {
    em: new Date().toISOString(),
    messageid: m.messageid,
    remetente: m.remetente,
    legenda: m.texto,
    pedido: leg.pedido,
    valorLegenda: leg.valor,
    comprovante: lido,
    arquivo: arquivo.fileURL || null,
  };

  let resposta: string;
  try {
    const contas = await contasDoPedido(leg.pedido);
    const d = decidir(contas, leg, lido?.valor);
    if (d.acao === "baixar" && d.conta && d.valor != null) {
      const data = lido?.data || hojeSP();
      const hist = [`Recibo WhatsApp (grupo Compass Recibos)`, lido?.pagador && `pagador: ${lido.pagador}`, lido?.banco && `banco: ${lido.banco}`].filter(Boolean).join(" · ");
      await baixarConta(d.conta, d.valor, data, hist);
      const resto = contas.filter((x) => x.id !== d.conta!.id);
      registro.status = "baixado";
      registro.contaId = d.conta.id;
      registro.valor = d.valor;
      resposta =
        `✅ Baixa feita no Bling\nPedido ${leg.pedido} · ${d.conta.contato?.nome || ""}\n${brl(d.valor)} em ${dataBR(data)} (parcela de ${dataBR(d.conta.vencimento)})` +
        (lido?.pagador ? `\nPagador: ${lido.pagador}` : "") +
        (resto.length ? `\nAinda em aberto: ${resto.map((x) => `${dataBR(x.vencimento)} ${brl(x.valor)}`).join(", ")}` : "\nPedido quitado.");
    } else {
      registro.status = "pergunta";
      registro.motivo = d.motivo;
      resposta = `⚠️ Não dei baixa: ${d.motivo}.`;
    }
  } catch (e: any) {
    registro.status = "erro";
    registro.motivo = String(e?.message || e);
    resposta = `⚠️ Não consegui dar baixa no pedido ${leg.pedido}: ${registro.motivo}`;
  }

  await redis(["LPUSH", "compass:recibos:log", JSON.stringify(registro)]);
  await redis(["LTRIM", "compass:recibos:log", 0, 499]);
  try {
    await enviarTexto(m.chat, resposta, m.messageid);
  } catch {
    /* resposta no grupo é cortesia; o registro já ficou salvo */
  }
  return registro;
}


// ---------------------------------------------------------------- contas a pagar

const normaliza = (t: string) =>
  (t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ");
const IGNORAR = new Set(["ltda", "sa", "s", "a", "me", "eireli", "de", "da", "do", "das", "dos", "e", "pago", "paga", "paguei", "pagamento", "despesa", "conta", "pagar", "r"]);
const palavras = (t: string) => normaliza(t).split(" ").filter((w) => w.length >= 3 && !IGNORAR.has(w) && !/^\d+$/.test(w));

/** Pontua o quanto a conta combina com o comprovante/legenda (nome do fornecedor, histórico, documento). */
export function pontuar(textoConta: string, pistas: string): number {
  const a = new Set(palavras(textoConta));
  return palavras(pistas).filter((w) => a.has(w) || [...a].some((x) => x.startsWith(w) || w.startsWith(x))).length;
}

async function processarPagamento(m: MsgRecibo, leg: Legenda, lido: LidoComprovante | null, arquivo: string | null) {
  const valor = leg.valor ?? lido?.valor ?? null;
  const data = lido?.data || hojeSP();
  const pistas = [m.texto, lido?.favorecido, lido?.descricao].filter(Boolean).join(" ");
  const registro: Record<string, unknown> = { em: new Date().toISOString(), tipo: "pagar", messageid: m.messageid, remetente: m.remetente, legenda: m.texto, comprovante: lido, arquivo, valor };
  let resposta: string;
  try {
    if (valor == null) {
      registro.status = "pergunta";
      resposta = `⚠️ Não identifiquei o valor do pagamento. Mande de novo com o valor na legenda, ex.: "pago internet 49,90".`;
    } else {
      const abertas = (await contasPagarAbertas()).filter((c) => Math.abs(c.valor - valor) < 0.01);
      // detalhe (fornecedor e histórico) só das contas com o mesmo valor
      const cands: { c: ContaPagar; texto: string; nome: string; pontos: number }[] = [];
      for (const c of abertas.slice(0, 8)) {
        const d = await detalheContaPagar(c.id);
        const nome = c.contato?.id ? await nomeContato(c.contato.id) : "";
        const texto = [nome, d.historico, d.numeroDocumento].filter(Boolean).join(" ");
        cands.push({ c: { ...c, historico: d.historico }, texto, nome, pontos: pontuar(texto, pistas) });
      }
      cands.sort((a, b) => b.pontos - a.pontos || a.c.vencimento.localeCompare(b.c.vencimento));
      const melhor = cands[0];
      const unico = cands.length === 1 || (melhor && melhor.pontos > 0 && melhor.pontos > cands[1].pontos);
      const hist = ["Pago — comprovante WhatsApp (grupo Compass Recibos)", lido?.favorecido && `favorecido: ${lido.favorecido}`, lido?.banco && `banco: ${lido.banco}`].filter(Boolean).join(" · ");
      if (melhor && unico) {
        await baixarContaPagar(melhor.c, valor, data, hist, pistas);
        registro.status = "pago";
        registro.contaId = melhor.c.id;
        resposta = `✅ Conta paga baixada no Bling\n${melhor.nome || "Fornecedor"} · ${brl(valor)} em ${dataBR(data)} (vencimento ${dataBR(melhor.c.vencimento)})${melhor.c.historico ? `\n${String(melhor.c.historico).replace(/\s*Linha digit.*$/i, "").slice(0, 90)}` : ""}`;
      } else if (cands.length > 1) {
        registro.status = "pergunta";
        resposta = `⚠️ Há ${cands.length} contas a pagar de ${brl(valor)} em aberto: ${cands.map((x) => `${x.nome || "?"} (venc. ${dataBR(x.c.vencimento)})`).join("; ")}. Mande de novo dizendo qual, ex.: "pago ${palavras(cands[0].nome)[0] || "fornecedor"} ${valor.toFixed(2).replace(".", ",")}".`;
      } else {
        // não estava cadastrada: lança como despesa paga
        const nomeForn = lido?.favorecido || palavras(m.texto).join(" ") || "";
        if (!nomeForn) {
          registro.status = "pergunta";
          resposta = `⚠️ Não achei conta a pagar de ${brl(valor)} no Bling e não identifiquei para quem foi o pagamento. Mande de novo com o nome, ex.: "pago táxi ${valor.toFixed(2).replace(".", ",")}".`;
        } else {
          const contatoId = await contatoFornecedor(nomeForn, lido?.favorecidoDoc);
          const desc = [m.texto.replace(/\b(pago|paga|paguei|pagamento|despesa|pagar)\b/gi, "").trim(), lido?.descricao].filter(Boolean).join(" · ");
          const id = await lancarDespesaPaga({ contatoId, valor, data, historico: [desc || "Despesa", hist].join(" · "), textoCategoria: pistas });
          registro.status = "lancado";
          registro.contaId = id;
          resposta = `✅ Despesa lançada e paga no Bling\n${nomeForn} · ${brl(valor)} em ${dataBR(data)}${desc ? `\n${desc.slice(0, 90)}` : ""}\n(não havia conta a pagar cadastrada com esse valor)`;
        }
      }
    }
  } catch (e: any) {
    registro.status = "erro";
    registro.motivo = String(e?.message || e);
    resposta = `⚠️ Não consegui registrar o pagamento: ${registro.motivo}`;
  }
  await redis(["LPUSH", "compass:recibos:log", JSON.stringify(registro)]);
  await redis(["LTRIM", "compass:recibos:log", 0, 499]);
  try {
    await enviarTexto(m.chat, resposta, m.messageid);
  } catch {
    /* cortesia */
  }
  return registro;
}
