"use client";

import { useEffect, useState, type FormEvent } from "react";
import { fetchAddressByCep, formatCEP, formatCpfCnpj, isValidCEP, isValidCpfCnpj, onlyDigits } from "@/lib/validators";

type Vol = { qtd: string; c: string; l: string; a: string; peso: string };
type Dados = { id: string; status: string; clienteNome: string; valorNF: string; volumes: Vol[]; pesoTotal: string; produto: string; dest: any; soDados?: boolean };

const VAZIO = { nome: "", doc: "", cep: "", endereco: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", contato: "", telefone: "", obs: "" };

export default function FretePage({ params }: { params: { id: string } }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [f, setF] = useState({ ...VAZIO });
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "ok" | "erro">("idle");
  const [tocado, setTocado] = useState<Record<string, boolean>>({});
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const [aviso, setAviso] = useState("");
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
    const falta = [!f.nome.trim() && "nome", !isValidCpfCnpj(f.doc) && "CPF/CNPJ", !isValidCEP(f.cep) && "CEP", !f.endereco.trim() && "rua", !f.numero.trim() && "número", !f.bairro.trim() && "bairro", !f.cidade.trim() && "cidade", !/^[A-Z]{2}$/.test(f.uf) && "UF"].filter(Boolean);
    if (falta.length) { setErro("Preencha todos os campos com * (" + falta.join(", ") + "). A transportadora só cota com o endereço completo."); return; }
    setEnviando(true);
    try {
      const r = await fetch(`/api/frete/${encodeURIComponent(params.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, doc: onlyDigits(f.doc), cep: onlyDigits(f.cep) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não foi possível enviar.");
      setAviso(j.previsao ? `A transportadora atende ${j.horario}. Sua cotação será enviada ${j.previsao} e retornamos com o valor pelo WhatsApp.` : "");
      setOk(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setErro(e.message);
    }
    setEnviando(false);
  };

  const CSS = `
.fr{max-width:460px;margin:12px auto 40px;padding:0 12px;font-size:15px}
.fr-card{background:#fff;border:1px solid #e3e3df;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.fr-top{background:#075e54;color:#fff;padding:12px 14px}
.fr-top b{display:block;font-size:16px}
.fr-top span{font-size:12.5px;opacity:.85}
.fr-enc{background:#dcf8c6;color:#1f3d1a;font-size:13px;padding:8px 14px;line-height:1.35}
.fr form{padding:10px 14px 14px}
.fr label{display:block;font-size:12px;color:#5b6166;margin:8px 0 2px}
.fr input,.fr textarea{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #d6d6d1;border-radius:9px;font:inherit;font-size:15px;background:#fafaf8}
.fr input:focus,.fr textarea:focus{outline:none;border-color:#25d366;background:#fff}
.fr .er{color:#b3261e;font-size:12px;margin-top:2px}
.fr .hn{color:#6b7177;font-size:12px;margin-top:2px}
.fr button.go{width:100%;margin-top:14px;padding:12px;border:0;border-radius:24px;background:#25d366;color:#fff;font-weight:700;font-size:15px;cursor:pointer}
.fr button.go:disabled{opacity:.6}
.fr .ok{padding:18px 14px;text-align:center}
.fr .ok button{margin-top:10px;background:none;border:1px solid #25d366;color:#075e54;border-radius:20px;padding:8px 16px;cursor:pointer}
`;
  if (erro && !dados) return <main className="fr"><style>{CSS}</style><div className="fr-card"><div className="fr-top"><b>Dados para entrega</b></div><p className="er" style={{ padding: 14 }}>{erro}</p></div></main>;
  if (!dados) return <main className="fr"><style>{CSS}</style><p>Carregando…</p></main>;

  const vols = (dados.volumes || []).filter((v) => v.c || v.peso);
  const req = (k: string, cond: boolean) => tocado[k] && !cond;
  const tocar = (k: string) => () => setTocado((t) => ({ ...t, [k]: true }));
  const Campo = (k: keyof typeof VAZIO, rot: string, extra: any = {}, valida?: [boolean, string]) => (
    <>
      <label htmlFor={k}>{rot}</label>
      <input id={k} value={f[k]} onChange={(e) => set(k, e.target.value)} onBlur={tocar(k)} {...extra} />
      {valida && req(k, valida[0]) && <div className="er">{valida[1]}</div>}
    </>
  );

  return (
    <main className="fr">
      <style>{CSS}</style>
      <div className="fr-card">
        <div className="fr-top"><b>{dados.soDados ? "Compass Brindes · Seus dados para o orçamento" : "Compass Brindes · Dados para entrega"}</b><span>{dados.clienteNome ? `${dados.clienteNome}, preencha` : "Preencha"} {dados.soDados ? "teus dados e o endereço de entrega" : "os dados de quem vai receber"} · campos com * são obrigatórios</span></div>
        {(vols.length > 0 || dados.pesoTotal) && (
          <div className="fr-enc">📦 {vols.map((v) => `${v.qtd || 1} vol ${v.c}×${v.l}×${v.a} cm`).join(" · ")}{dados.pesoTotal ? ` · ${dados.pesoTotal} kg` : ""}</div>
        )}
        {ok ? (
          <div className="ok">
            <div style={{ fontSize: 34 }}>✅</div>
            <b>Recebemos seus dados!</b>
            <p className="hn" style={{ fontSize: 14 }}>{aviso || (dados.soDados ? "Recebemos teus dados! Seguimos com o teu orçamento pelo WhatsApp." : "Vamos cotar o frete e retornamos pelo WhatsApp.")}</p>
            <button onClick={() => setOk(false)}>Corrigir dados</button>
          </div>
        ) : (
          <form onSubmit={enviar} noValidate>
            {Campo("nome", "Nome ou razão social *", { autoComplete: "name" }, [!!f.nome.trim(), "Informe o nome."])}
            <label htmlFor="doc">CPF ou CNPJ *</label>
            <input id="doc" inputMode="numeric" value={f.doc} onChange={(e) => set("doc", formatCpfCnpj(e.target.value))} onBlur={tocar("doc")} />
            {req("doc", isValidCpfCnpj(f.doc)) && <div className="er">CPF ou CNPJ inválido.</div>}
            <label htmlFor="cep">CEP *</label>
            <input id="cep" inputMode="numeric" autoComplete="postal-code" value={f.cep} onChange={(e) => { const v = formatCEP(e.target.value); set("cep", v); if (onlyDigits(v).length === 8) buscarCep(v); }} onBlur={tocar("cep")} />
            {cepStatus === "loading" && <div className="hn">Buscando endereço…</div>}
            {cepStatus === "erro" && <div className="hn">CEP não encontrado — preencha à mão.</div>}
            {req("cep", isValidCEP(f.cep)) && <div className="er">CEP inválido.</div>}
            {Campo("endereco", "Rua / avenida *", { autoComplete: "address-line1" }, [!!f.endereco.trim(), "Informe a rua."])}
            {Campo("numero", "Número *", { inputMode: "numeric" }, [!!f.numero.trim(), "Informe o número."])}
            {Campo("complemento", "Complemento", { placeholder: "Sala, bloco, referência" })}
            {Campo("bairro", "Bairro *", {}, [!!f.bairro.trim(), "Informe o bairro."])}
            {Campo("cidade", "Cidade *", {}, [!!f.cidade.trim(), "Informe a cidade."])}
            <label htmlFor="uf">UF *</label>
            <input id="uf" maxLength={2} value={f.uf} onChange={(e) => set("uf", e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} onBlur={tocar("uf")} />
            {req("uf", /^[A-Z]{2}$/.test(f.uf)) && <div className="er">UF com 2 letras.</div>}
            {Campo("contato", "Quem recebe no local", { placeholder: "Nome da pessoa" })}
            {Campo("telefone", "Telefone para a entrega", { inputMode: "tel", placeholder: "(00) 00000-0000" })}
            <label htmlFor="obs">Observações</label>
            <textarea id="obs" rows={2} value={f.obs} onChange={(e) => set("obs", e.target.value)} placeholder="Horário, portaria etc." />
            {erro && <div className="er" role="alert" style={{ marginTop: 8 }}>{erro}</div>}
            <button type="submit" className="go" disabled={enviando}>{enviando ? "Enviando…" : "Enviar dados"}</button>
            <div className="hn" style={{ textAlign: "center", marginTop: 8 }}>{dados.soDados ? "Usado só para o orçamento, a nota fiscal e a entrega deste pedido." : "Usado só para o frete e a entrega deste pedido."}</div>
          </form>
        )}
      </div>
    </main>
  );
}
