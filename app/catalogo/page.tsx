"use client";

import { useState } from "react";

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";

function buildWhatsappMessage(nome: string, empresa: string): string {
  return [
    `Olá! Acabei de baixar o catálogo da Compass Brindes Corporativos.`,
    `Meu nome é ${nome}, da empresa ${empresa}.`,
    `Gostaria de saber mais sobre os produtos.`,
  ].join("\n");
}

export default function CatalogoPage() {
  const [nome, setNome] = useState("");
  const [sobrenome, setSobrenome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [concluido, setConcluido] = useState(false);

  const formularioValido =
    nome.trim() && sobrenome.trim() && empresa.trim() && email.trim() && telefone.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formularioValido || enviando) return;

    setEnviando(true);
    setErro(null);

    // Abre a aba do WhatsApp já no clique (síncrono), para não ser bloqueada
    // pelo navegador como pop-up. O texto é preenchido depois, quando o
    // cadastro terminar de ser salvo (mesmo padrão usado em /orcamento).
    const whatsappTab = WHATSAPP_NUMBER ? window.open("", "_blank") : null;

    try {
      const res = await fetch("/api/catalogo-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, sobrenome, empresa, email, telefone }),
      });

      const data = await res.json();

      if (!res.ok) {
        whatsappTab?.close();
        setErro(data.error ?? "Não foi possível registrar seu cadastro.");
        return;
      }

      setConcluido(true);

      // Dispara o download do PDF automaticamente...
      window.location.href = "/api/catalogo/pdf";

      // ...e também abre uma conversa no WhatsApp já com a mensagem pronta,
      // para começar o contato direto além do e-mail/telefone cadastrados.
      if (WHATSAPP_NUMBER) {
        const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
          buildWhatsappMessage(nome, empresa)
        )}`;
        if (whatsappTab) {
          whatsappTab.location.href = url;
        } else {
          window.open(url, "_blank", "noreferrer");
        }
      }
    } catch {
      whatsappTab?.close();
      setErro("Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (concluido) {
    return (
      <div className="container section">
        <div className="empty-state">
          <h2>Cadastro concluído! ✓</h2>
          <p style={{ fontSize: 16, margin: "12px 0" }}>
            O download do catálogo em PDF começou automaticamente. Se não abrir sozinho,{" "}
            <a href="/api/catalogo/pdf">clique aqui para baixar</a>.
          </p>
          {WHATSAPP_NUMBER && (
            <p style={{ fontSize: 16, margin: "12px 0" }}>
              Também abrimos uma conversa no WhatsApp para você em outra aba — é só continuar por
              lá se quiser falar com a gente.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container section" style={{ maxWidth: 560 }}>
      <h2>Baixar catálogo em PDF</h2>
      <p className="section-lede">
        Preencha seus dados para receber o catálogo completo da Compass Brindes Corporativos em
        PDF. O download começa automaticamente assim que você enviar o formulário.
      </p>

      <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
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
          <label htmlFor="empresa">Empresa</label>
          <input id="empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
        </div>

        <div className="form-field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com.br"
          />
        </div>

        <div className="form-field">
          <label htmlFor="telefone">Telefone</label>
          <input
            id="telefone"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            inputMode="tel"
            placeholder="(49) 99999-9999"
          />
        </div>

        {erro && (
          <p className="form-error" style={{ marginBottom: 10 }}>
            {erro}
          </p>
        )}

        <button
          className="btn btn-primary"
          type="submit"
          disabled={!formularioValido || enviando}
          style={!formularioValido || enviando ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
        >
          {enviando ? "Enviando..." : "Baixar catálogo em PDF"}
        </button>
        {!formularioValido && (
          <p className="form-hint" style={{ marginTop: 8 }}>
            Preencha todos os dados para liberar o download.
          </p>
        )}
      </form>
    </div>
  );
}
