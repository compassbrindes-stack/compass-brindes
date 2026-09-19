"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getQuoteItems,
  removeQuoteItem,
  updateQuoteItemQuantity,
  type QuoteItem,
} from "@/lib/quote-storage";

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";

export default function OrcamentoPage() {
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");

  useEffect(() => {
    const load = () => setItems(getQuoteItems());
    load();
    window.addEventListener("compass-brindes-quote-updated", load);
    return () => window.removeEventListener("compass-brindes-quote-updated", load);
  }, []);

  function buildWhatsappMessage() {
    const lines = [
      "Olá! Gostaria de um orçamento para os itens abaixo:",
      ...items.map((i) => `• ${i.name} (${i.supplierName}) — ${i.quantity} unidades`),
    ];
    if (name) lines.push(`Nome: ${name}`);
    if (company) lines.push(`Empresa: ${company}`);
    return lines.join("\n");
  }

  const whatsappUrl = WHATSAPP_NUMBER
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

          <div className="form-field">
            <label htmlFor="name">Seu nome</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="company">Empresa</label>
            <input id="company" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>

          {whatsappUrl ? (
            <a className="btn btn-primary" href={whatsappUrl} target="_blank" rel="noreferrer">
              Enviar orçamento pelo WhatsApp
            </a>
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
