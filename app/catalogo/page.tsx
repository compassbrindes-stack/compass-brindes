"use client";

import { useState } from "react";

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

    try {
      const res = await fetch("/api/catalogo-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, sobrenome, empresa, email, telefone }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error ?? "Não foi possível registrar seu cadastro.");
        return;
      }

      setConcluido(true);
      // Dispara o download do PDF automaticamente, sem precisar de WhatsApp.
      window.location.href = "/api/catalogo/pdf";
    } catch {
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
