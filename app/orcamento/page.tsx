"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
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

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";

export default function OrcamentoPage() {
  const [items, setItems] = useState<QuoteItem[]>([]);

  const [nome, setNome] = useState("");
  const [sobrenome, setSobrenome] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cep, setCep] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [telefone, setTelefone] = useState("");

  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "ok" | "erro">("idle");
  const [cpfCnpjTocado, setCpfCnpjTocado] = useState(false);
  const [cepTocado, setCepTocado] = useState(false);

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
    endereco.trim() &&
    cep.trim() &&
    cidade.trim() &&
    estado.trim() &&
    telefone.trim();

  const formularioValido =
    Boolean(camposObrigatoriosPreenchidos) && cpfCnpjValido === true && cepValido === true;

  function buildWhatsappMessage() {
    const lines = [
      "Olá! Gostaria de um orçamento para os itens abaixo:",
      ...items.map((i) => `• ${i.name} (${i.supplierName}) — ${i.quantity} unidades`),
      "",
      "Dados para o orçamento:",
      `Nome: ${nome} ${sobrenome}`,
      `CPF/CNPJ: ${cpfCnpj}`,
      `Endereço: ${endereco}`,
      `CEP: ${cep}`,
      `Cidade: ${cidade}`,
      `Estado: ${estado}`,
      `Telefone: ${telefone}`,
    ];
    return lines.join("\n");
  }

  const whatsappUrl =
    WHATSAPP_NUMBER && formularioValido
      ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildWhatsappMessage())}`
      : undefined;

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
            <label htmlFor="endereco">Endereço</label>
            <input
              id="endereco"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Rua, número, bairro"
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="cep">CEP</label>
              <input
                id="cep"
                value={cep}
                onChange={(e) => setCep(formatCEP(e.target.value))}
                onBlur={() => setCepTocado(true)}
                inputMode="numeric"
                placeholder="00000-000"
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

          {WHATSAPP_NUMBER ? (
            <>
              {whatsappUrl ? (
                <a className="btn btn-primary" href={whatsappUrl} target="_blank" rel="noreferrer">
                  Enviar orçamento pelo WhatsApp
                </a>
              ) : (
                <>
                  <button className="btn btn-primary" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>
                    Enviar orçamento pelo WhatsApp
                  </button>
                  <p className="form-hint" style={{ marginTop: 8 }}>
                    Preencha todos os dados corretamente para habilitar o envio.
                  </p>
                </>
              )}
            </>
          ) : (
            <p>
              Configure <code>NEXT_PUBLIC_WHATSAPP_NUMBER</code> no ambiente para habilitar o envio
              direto pelo WhatsApp.
            </p>
          )}
        </>
      )}
    </div>
  );
}
