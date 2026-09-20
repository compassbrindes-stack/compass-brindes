"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  clearQuoteItems,
  getQuoteItems,
  removeQuoteItem,
  updateQuoteItemQuantity,
  type QuoteItem,
} from "@/lib/quote-storage";
import {
  fetchAddressByCep,
  formatCEP,
  formatCpfCnpj,
  isValidCEP,
  isValidCpfCnpj,
  onlyDigits,
} from "@/lib/validators";
import type { Order } from "@/lib/orders";

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";

export default function OrcamentoPage() {
  const [items, setItems] = useState<QuoteItem[]>([]);

  const [nome, setNome] = useState("");
  const [sobrenome, setSobrenome] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [telefone, setTelefone] = useState("");

  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "ok" | "erro">("idle");
  const [cpfCnpjTocado, setCpfCnpjTocado] = useState(false);
  const [cepTocado, setCepTocado] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [pedidoConcluido, setPedidoConcluido] = useState<Order | null>(null);

  const [buscaDoc, setBuscaDoc] = useState("");
  const [buscaStatus, setBuscaStatus] = useState<"idle" | "loading" | "ok" | "erro">("idle");
  const [pedidosEncontrados, setPedidosEncontrados] = useState<Order[]>([]);
  const [buscaErro, setBuscaErro] = useState<string | null>(null);

  useEffect(() => {
    const load = () => setItems(getQuoteItems());
    load();
    window.addEventListener("compass-brindes-quote-updated", load);
    return () => window.removeEventListener("compass-brindes-quote-updated", load);
  }, []);

  useEffect(() => {
    const digits = onlyDigits(cep);
    if (digits.length !== 8) {
      setCepStatus("idle");
      return;
    }

    let cancelado = false;
    setCepStatus("loading");
    fetchAddressByCep(digits).then((endereco2) => {
      if (cancelado) return;
      if (!endereco2) {
        setCepStatus("erro");
        return;
      }
      setCepStatus("ok");
      setCidade(endereco2.cidade);
      setEstado(endereco2.estado);
      setEndereco((atual) => {
        if (atual.trim()) return atual;
        return [endereco2.logradouro, endereco2.bairro].filter(Boolean).join(", ");
      });
    });

    return () => {
      cancelado = true;
    };
  }, [cep]);

  const cpfCnpjValido = cpfCnpj.trim() === "" ? null : isValidCpfCnpj(cpfCnpj);
  const cepValido = cep.trim() === "" ? null : isValidCEP(cep);

  const camposObrigatoriosPreenchidos =
    nome.trim() &&
    sobrenome.trim() &&
    cpfCnpj.trim() &&
    cep.trim() &&
    endereco.trim() &&
    numero.trim() &&
    cidade.trim() &&
    estado.trim() &&
    telefone.trim();

  const formularioValido =
    Boolean(camposObrigatoriosPreenchidos) && cpfCnpjValido === true && cepValido === true;

  function buildWhatsappMessage(orderNumber: string) {
    const enderecoCompleto = [
      endereco,
      numero ? `nº ${numero}` : "",
      complemento,
    ]
      .filter(Boolean)
      .join(", ");

    const lines = [
      `Olá! Segue o pedido *${orderNumber}*:`,
      ...items.map((i) => `• ${i.name} (${i.supplierName}) — ${i.quantity} unidades`),
      "",
      "Dados para o orçamento:",
      `Nome: ${nome} ${sobrenome}`,
      `CPF/CNPJ: ${cpfCnpj}`,
      `Endereço: ${enderecoCompleto}`,
      `CEP: ${cep}`,
      `Cidade: ${cidade}`,
      `Estado: ${estado}`,
      `Telefone: ${telefone}`,
    ];
    return lines.join("\n");
  }

  async function handleEnviarPedido() {
    if (!formularioValido || items.length === 0 || enviando) return;

    setEnviando(true);
    setErroEnvio(null);

    // Abre a aba do WhatsApp já no clique (síncrono), para não ser bloqueada
    // pelo navegador como pop-up. O endereço é preenchido depois, quando o
    // pedido terminar de ser salvo.
    const whatsappTab = WHATSAPP_NUMBER ? window.open("", "_blank") : null;

    try {
      const res = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          customer: {
            nome,
            sobrenome,
            cpfCnpj,
            cep,
            endereco,
            numero,
            complemento,
            cidade,
            estado,
            telefone,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        whatsappTab?.close();
        setErroEnvio(data.error ?? "Não foi possível gerar o pedido.");
        return;
      }

      const order: Order = data.order;

      if (WHATSAPP_NUMBER) {
        const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
          buildWhatsappMessage(order.orderNumber)
        )}`;
        if (whatsappTab) {
          whatsappTab.location.href = url;
        } else {
          window.open(url, "_blank", "noreferrer");
        }
      }

      clearQuoteItems();
      setItems([]);
      setPedidoConcluido(order);
    } catch {
      whatsappTab?.close();
      setErroEnvio("Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleBuscarPedidos() {
    const digits = onlyDigits(buscaDoc);
    if (digits.length !== 11 && digits.length !== 14) {
      setBuscaStatus("erro");
      setBuscaErro("Digite um CPF ou CNPJ válido para buscar.");
      return;
    }

    setBuscaStatus("loading");
    setBuscaErro(null);

    try {
      const res = await fetch(`/api/pedidos?doc=${digits}`);
      const data = await res.json();

      if (!res.ok) {
        setBuscaStatus("erro");
        setBuscaErro(data.error ?? "Não foi possível buscar os pedidos.");
        return;
      }

      setPedidosEncontrados(data.orders ?? []);
      setBuscaStatus("ok");
    } catch {
      setBuscaStatus("erro");
      setBuscaErro("Não foi possível conectar ao servidor. Tente novamente.");
    }
  }

  if (pedidoConcluido) {
    return (
      <div className="container section">
        <div className="empty-state">
          <h2>Pedido enviado com sucesso! ✓</h2>
          <p style={{ fontSize: 18, margin: "12px 0" }}>
            Número do pedido: <strong>{pedidoConcluido.orderNumber}</strong>
          </p>
          <p>
            Guarde esse número. Você pode consultar este e outros pedidos futuros informando seu
            CPF ou CNPJ nesta mesma página.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
            <Link className="btn btn-primary" href="/produtos">
              Fazer um novo pedido
            </Link>
            <button className="btn btn-outline" onClick={() => setPedidoConcluido(null)}>
              Consultar meus pedidos
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container section">
      <h2>Meu orçamento</h2>

      {items.length === 0 ? (
        <div className="empty-state">
          <p>Você ainda não adicionou produtos ao orçamento.</p>
          <Link className="btn btn-primary" href="/produtos">
            Ver produtos
          </Link>
        </div>
      ) : (
        <>
          <table className="quote-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Fornecedor</th>
                <th>Quantidade</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.productId}>
                  <td>
                    <Link href={`/produtos/${item.slug}`}>{item.name}</Link>
                  </td>
                  <td>{item.supplierName}</td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => {
                        const quantity = Number(e.target.value);
                        updateQuoteItemQuantity(item.productId, quantity);
                        setItems(getQuoteItems());
                      }}
                    />
                  </td>
                  <td>
                    <button
                      className="link-remove"
                      onClick={() => {
                        removeQuoteItem(item.productId);
                        setItems(getQuoteItems());
                      }}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 32 }}>Seus dados</h3>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="nome">Nome</label>
              <input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="form-field">
              <label htmlFor="sobrenome">Sobrenome</label>
              <input
                id="sobrenome"
                value={sobrenome}
                onChange={(e) => setSobrenome(e.target.value)}
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="cpfCnpj">CPF ou CNPJ</label>
            <input
              id="cpfCnpj"
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(formatCpfCnpj(e.target.value))}
              onBlur={() => setCpfCnpjTocado(true)}
              inputMode="numeric"
              placeholder="000.000.000-00"
            />
            {cpfCnpjTocado && cpfCnpjValido === false && (
              <span className="form-error">CPF ou CNPJ inválido. Confira os números digitados.</span>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="cep">CEP</label>
            <input
              id="cep"
              value={cep}
              onChange={(e) => setCep(formatCEP(e.target.value))}
              onBlur={() => setCepTocado(true)}
              inputMode="numeric"
              placeholder="00000-000"
              style={{ maxWidth: 160 }}
            />
            {cepStatus === "loading" && <span className="form-hint">Buscando endereço...</span>}
            {cepTocado && cepValido === false && (
              <span className="form-error">CEP inválido. Digite os 8 números do CEP.</span>
            )}
            {cepStatus === "erro" && (
              <span className="form-error">CEP não encontrado. Confira o número.</span>
            )}
            {cepStatus === "ok" && (
              <span className="form-hint">Endereço encontrado e preenchido automaticamente.</span>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="endereco">Endereço</label>
            <input
              id="endereco"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Rua, bairro"
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="numero">Número</label>
              <input id="numero" value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div className="form-field">
              <label htmlFor="complemento">Complemento</label>
              <input
                id="complemento"
                value={complemento}
                onChange={(e) => setComplemento(e.target.value)}
                placeholder="Apto, bloco, sala (opcional)"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="cidade">Cidade</label>
              <input id="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
            </div>
            <div className="form-field">
              <label htmlFor="estado">Estado</label>
              <input
                id="estado"
                value={estado}
                onChange={(e) => setEstado(e.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
                placeholder="UF"
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="telefone">Telefone de contato</label>
            <input
              id="telefone"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              inputMode="tel"
              placeholder="(49) 99999-9999"
            />
          </div>

          {erroEnvio && (
            <p className="form-error" style={{ marginBottom: 10 }}>
              {erroEnvio}
            </p>
          )}

          <button
            className="btn btn-primary"
            disabled={!formularioValido || enviando}
            style={!formularioValido || enviando ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            onClick={handleEnviarPedido}
          >
            {enviando ? "Enviando..." : "Enviar orçamento pelo WhatsApp"}
          </button>
          {!formularioValido && (
            <p className="form-hint" style={{ marginTop: 8 }}>
              Preencha todos os dados corretamente para habilitar o envio.
            </p>
          )}
          {!WHATSAPP_NUMBER && (
            <p className="form-hint" style={{ marginTop: 8 }}>
              Configure <code>NEXT_PUBLIC_WHATSAPP_NUMBER</code> no ambiente para abrir o WhatsApp
              automaticamente. O pedido será salvo mesmo assim.
            </p>
          )}
        </>
      )}

      <div style={{ marginTop: 48, borderTop: "1px solid var(--color-border, #ddd)", paddingTop: 24 }}>
        <h3>Já fez um pedido? Consulte aqui</h3>
        <p className="form-hint" style={{ marginBottom: 10 }}>
          Informe o mesmo CPF ou CNPJ usado no pedido para ver o histórico.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div className="form-field" style={{ maxWidth: 260 }}>
            <input
              value={buscaDoc}
              onChange={(e) => setBuscaDoc(formatCpfCnpj(e.target.value))}
              placeholder="000.000.000-00"
              inputMode="numeric"
            />
          </div>
          <button
            className="btn btn-outline"
            onClick={handleBuscarPedidos}
            disabled={buscaStatus === "loading"}
          >
            {buscaStatus === "loading" ? "Buscando..." : "Buscar meus pedidos"}
          </button>
        </div>

        {buscaErro && (
          <p className="form-error" style={{ marginTop: 10 }}>
            {buscaErro}
          </p>
        )}

        {buscaStatus === "ok" && pedidosEncontrados.length === 0 && (
          <p className="form-hint" style={{ marginTop: 10 }}>
            Nenhum pedido encontrado para esse CPF/CNPJ.
          </p>
        )}

        {pedidosEncontrados.length > 0 && (
          <table className="quote-table" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Data</th>
                <th>Itens</th>
              </tr>
            </thead>
            <tbody>
              {pedidosEncontrados.map((order) => (
                <tr key={order.orderNumber}>
                  <td>
                    <strong>{order.orderNumber}</strong>
                  </td>
                  <td>{new Date(order.createdAt).toLocaleDateString("pt-BR")}</td>
                  <td>
                    {order.items.map((i) => `${i.name} (${i.quantity})`).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
