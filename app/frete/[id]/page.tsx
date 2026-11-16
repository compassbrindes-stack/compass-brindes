"use client";

import { useEffect, useState, type FormEvent } from "react";
import { fetchAddressByCep, formatCEP, formatCpfCnpj, isValidCEP, isValidCpfCnpj, onlyDigits } from "@/lib/validators";

type Vol = { qtd: string; c: string; l: string; a: string; peso: string };
type Dados = { id: string; status: string; clienteNome: string; valorNF: string; volumes: Vol[]; pesoTotal: string; produto: string; dest: any };

const VAZIO = { nome: "", doc: "", cep: "", endereco: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", contato: "", telefone: "", obs: "" };

export default function FretePage({ params }: { params: { id: string } }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [f, setF] = useState({ ...VAZIO });
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "ok" | "erro">("idle");
  const [tocado, setTocado] = useState<Record<string, boolean>>({});
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const set = (k: keyof typeof VAZIO, v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    fetch(`/api/frete/${encodeURIComponent(params.id)}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Formulário não encontrado."); return j; })
      .then((j: Dados) => { setDados(j); if (j.dest) setF({ ...VAZIO, ...j.dest, doc: formatCpfCnpj(j.dest.doc || ""), cep: formatCEP(j.dest.cep || "") }); })
      .catch((e) => setErro(e.message));
  }, [params.id]);

  const buscarCep = async (v: string) => {
    if (!isValidCEP(v)) return;
    setCepStatus("loading");
    const end = await fetchAddressByCep(v);
    if (!end) { setCepStatus("erro"); return; }
    setCepStatus("ok");
    setF((x) => ({ ...x, endereco: x.endereco || end.logradouro, bairro: x.bairro || end.bairro, cidade: end.cidade, uf: end.estado }));
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setTocado({ doc: true, cep: true, nome: true, endereco: true, numero: true, bairro: true, cidade: true, uf: true });
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch(`/api/frete/${encodeURIComponent(params.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, doc: onlyDigits(f.doc), cep: onlyDigits(f.cep) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não foi possível enviar.");
      setOk(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setErro(e.message);
    }
    setEnviando(false);
  };

  if (erro && !dados) return <main className="container section"><h1>Dados para entrega</h1><p className="form-error">{erro}</p></main>;
  if (!dados) return <main className="container section"><p>Carregando…</p></main>;

  const vols = (dados.volumes || []).filter((v) => v.c || v.peso);
  const req = (k: string, cond: boolean) => tocado[k] && !cond;

  return (
    <main className="container section" style={{ maxWidth: 760 }}>
      <h1>Dados para entrega</h1>
      <p className="form-hint" style={{ fontSize: 15 }}>
        Olá{dados.clienteNome ? `, ${dados.clienteNome}` : ""}! Para cotarmos o frete do seu pedido com a transportadora, preencha os dados de quem vai <strong>receber a mercadoria</strong> (destinatário da nota fiscal).
      </p>

      {ok ? (
        <div className="card" style={{ padding: 20, marginTop: 16, border: "1px solid #b7e1c4", background: "#eefaf2", borderRadius: 12 }}>
          <h2 style={{ marginTop: 0 }}>Recebemos seus dados ✅</h2>
          <p>Obrigado! Vamos cotar o frete e retornamos em breve pelo WhatsApp. Se precisar corrigir algo, é só editar abaixo e enviar de novo.</p>
          <button className="btn btn-outline" onClick={() => setOk(false)}>Editar dados</button>
        </div>
      ) : (
        <form onSubmit={enviar} noValidate style={{ marginTop: 16 }}>
          <div className="form-field">
            <label htmlFor="nome">Nome completo ou razão social *</label>
            <input id="nome" value={f.nome} onChange={(e) => set("nome", e.target.value)} onBlur={() => setTocado((t) => ({ ...t, nome: true }))} autoComplete="name" />
            {req("nome", !!f.nome.trim()) && <span className="form-error">Informe o nome de quem recebe.</span>}
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="doc">CPF ou CNPJ *</label>
              <input id="doc" inputMode="numeric" value={f.doc} onChange={(e) => set("doc", formatCpfCnpj(e.target.value))} onBlur={() => setTocado((t) => ({ ...t, doc: true }))} />
              {req("doc", isValidCpfCnpj(f.doc)) && <span className="form-error">CPF ou CNPJ inválido.</span>}
            </div>
            <div className="form-field">
              <label htmlFor="cep">CEP *</label>
              <input id="cep" inputMode="numeric" value={f.cep} onChange={(e) => { const v = formatCEP(e.target.value); set("cep", v); if (onlyDigits(v).length === 8) buscarCep(v); }} onBlur={() => setTocado((t) => ({ ...t, cep: true }))} autoComplete="postal-code" />
              {cepStatus === "loading" && <span className="form-hint">Buscando endereço…</span>}
              {cepStatus === "erro" && <span className="form-hint">CEP não encontrado — preencha o endereço à mão.</span>}
              {req("cep", isValidCEP(f.cep)) && <span className="form-error">CEP inválido.</span>}
            </div>
          </div>
          <div className="form-row">
            <div className="form-field" style={{ flex: 3 }}>
              <label htmlFor="endereco">Rua / avenida *</label>
              <input id="endereco" value={f.endereco} onChange={(e) => set("endereco", e.target.value)} onBlur={() => setTocado((t) => ({ ...t, endereco: true }))} autoComplete="address-line1" />
              {req("endereco", !!f.endereco.trim()) && <span className="form-error">Informe a rua.</span>}
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <label htmlFor="numero">Número *</label>
              <input id="numero" value={f.numero} onChange={(e) => set("numero", e.target.value)} onBlur={() => setTocado((t) => ({ ...t, numero: true }))} />
              {req("numero", !!f.numero.trim()) && <span className="form-error">Informe o número.</span>}
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="complemento">Complemento</label>
              <input id="complemento" value={f.complemento} onChange={(e) => set("complemento", e.target.value)} placeholder="Sala, bloco, referência" />
            </div>
            <div className="form-field">
              <label htmlFor="bairro">Bairro *</label>
              <input id="bairro" value={f.bairro} onChange={(e) => set("bairro", e.target.value)} onBlur={() => setTocado((t) => ({ ...t, bairro: true }))} />
              {req("bairro", !!f.bairro.trim()) && <span className="form-error">Informe o bairro.</span>}
            </div>
          </div>
          <div className="form-row">
            <div className="form-field" style={{ flex: 3 }}>
              <label htmlFor="cidade">Cidade *</label>
              <input id="cidade" value={f.cidade} onChange={(e) => set("cidade", e.target.value)} onBlur={() => setTocado((t) => ({ ...t, cidade: true }))} />
              {req("cidade", !!f.cidade.trim()) && <span className="form-error">Informe a cidade.</span>}
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <label htmlFor="uf">UF *</label>
              <input id="uf" maxLength={2} value={f.uf} onChange={(e) => set("uf", e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} onBlur={() => setTocado((t) => ({ ...t, uf: true }))} />
              {req("uf", /^[A-Z]{2}$/.test(f.uf)) && <span className="form-error">UF com 2 letras.</span>}
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="contato">Quem recebe no local</label>
              <input id="contato" value={f.contato} onChange={(e) => set("contato", e.target.value)} placeholder="Nome da pessoa" />
            </div>
            <div className="form-field">
              <label htmlFor="telefone">Telefone para a entrega</label>
              <input id="telefone" inputMode="tel" value={f.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="(00) 00000-0000" />
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="obs">Observações para a entrega</label>
            <textarea id="obs" rows={2} value={f.obs} onChange={(e) => set("obs", e.target.value)} placeholder="Horário de recebimento, portaria etc." />
          </div>

          {(vols.length > 0 || dados.valorNF) && (
            <div style={{ margin: "18px 0", padding: 14, borderRadius: 10, background: "#f5f5f2", fontSize: 14 }}>
              <strong>Sua encomenda</strong>
              <div>{vols.map((v, i) => <div key={i}>{v.qtd || 1} volume(s) · {v.c}×{v.l}×{v.a} cm{v.peso ? ` · ${v.peso} kg` : ""}</div>)}</div>
              {dados.pesoTotal && <div>Peso total: {dados.pesoTotal} kg</div>}
            </div>
          )}

          {erro && <p className="form-error" role="alert">{erro}</p>}
          <button type="submit" className="btn btn-primary" disabled={enviando}>{enviando ? "Enviando…" : "Enviar dados"}</button>
          <p className="form-hint">Seus dados são usados só para a cotação e a entrega deste pedido.</p>
        </form>
      )}
    </main>
  );
}
