"use client";

import { useEffect, useState } from "react";

type Dados = { id: string; cliente: string; pedido: string; versao: number; produto: string; status: string; respondidoEm: string | null; comentario: string; opcoes: number; escolha: number };

const CSS = `
.ap{min-height:100vh;background:#eef0f6;padding:16px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0b1020;box-sizing:border-box}
.ap *{box-sizing:border-box}
.ap-card{max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px -16px rgba(0,0,0,.35)}
.ap-top{background:#0b1020;color:#fff;padding:14px 16px}
.ap-top b{display:block;font-size:16px}
.ap-top span{font-size:13px;opacity:.85}
.ap-img{display:block;width:100%;height:auto;background:#f4f5f7;border-bottom:1px solid #e3e6ef}
.ap-body{padding:16px;display:flex;flex-direction:column;gap:12px}
.ap-prod{font-size:14px;color:#3a4152}
.ap-bt{display:block;width:100%;border:0;border-radius:12px;padding:15px;font-size:16px;font-weight:700;cursor:pointer}
.ap-sim{background:#1f9d5c;color:#fff}
.ap-aj{background:#fff;color:#0b1020;border:1.5px solid #c9cedb}
.ap-bt:disabled{opacity:.5;cursor:not-allowed}
.ap textarea{width:100%;min-height:96px;border:1.5px solid #c9cedb;border-radius:12px;padding:10px;font:inherit;font-size:15px}
.ap .er{color:#b0352a;font-size:14px}
.ap .ok{text-align:center;padding:10px 4px}
.ap .ok b{display:block;font-size:20px;margin:6px 0}
.ap .hn{font-size:13px;color:#5b6274}
.ap-op{border-top:1px solid #e3e6ef;padding:12px 16px 16px}
.ap-op h3{margin:0 0 8px;font-size:17px}
.ap-op img{display:block;width:100%;height:auto;border-radius:10px;border:1px solid #e3e6ef;background:#f4f5f7;margin-bottom:10px}
.ap-op.on{background:#eaf7f0}
`;

export default function AprovarPage({ params }: { params: { id: string } }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<"" | "ajuste">("");
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<"" | "aprovado" | "ajuste">("");
  const [imgOk, setImgOk] = useState(true);
  const [escolhida, setEscolhida] = useState(0);

  useEffect(() => {
    fetch(`/api/aprovar/${encodeURIComponent(params.id)}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Link não encontrado."); return j; })
      .then((j: Dados) => { setDados(j); if (j.status === "aprovado") { setFeito("aprovado"); setEscolhida(j.escolha || 0); } })
      .catch((e) => setErro(e.message));
  }, [params.id]);

  const enviar = async (acao: "aprovar" | "ajuste", escolha = 0) => {
    setEnviando(true); setErro(null);
    try {
      const r = await fetch(`/api/aprovar/${encodeURIComponent(params.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao, comentario, escolha }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não foi possível registrar.");
      setFeito(acao === "aprovar" ? "aprovado" : "ajuste"); if (escolha) setEscolhida(escolha);
    } catch (e: any) { setErro(e.message); }
    setEnviando(false);
  };

  if (erro && !dados) return <main className="ap"><style>{CSS}</style><div className="ap-card"><div className="ap-top"><b>Compass Brindes · Aprovação de layout</b></div><p className="er" style={{ padding: 16 }}>{erro}</p></div></main>;
  if (!dados) return <main className="ap"><style>{CSS}</style><p>Carregando…</p></main>;
  const id = encodeURIComponent(params.id);
  if (dados.opcoes > 1) return (
    <main className="ap">
      <style>{CSS}</style>
      <div className="ap-card">
        <div className="ap-top">
          <b>Compass Brindes · Escolha do layout</b>
          <span>{dados.cliente ? dados.cliente + " · " : ""}{dados.pedido ? `pedido ${dados.pedido}` : ""}</span>
        </div>
        <div className="ap-body">
          {dados.produto && <div className="ap-prod">{dados.produto}</div>}
          {feito === "aprovado" ? <div className="ok">✅<b>Opção {escolhida} escolhida!</b><p className="hn">Obrigado. Já seguimos com a produção e avisamos pelo WhatsApp.</p></div>
            : feito === "ajuste" ? <div className="ok">✏️<b>Ajuste solicitado</b><p className="hn">Recebemos o seu pedido. Vamos ajustar e mandar uma nova versão pelo WhatsApp.</p></div>
            : <p className="hn">Confira as {dados.opcoes} opções abaixo e toque em <b>Escolher</b> na que preferir. A produção só começa depois da sua escolha.</p>}
          {erro && <p className="er">{erro}</p>}
        </div>
        {Array.from({ length: dados.opcoes }, (_, i) => i + 1).map((n) => (
          <section key={n} className={`ap-op${escolhida === n ? " on" : ""}`}>
            <h3>Opção {n}{escolhida === n ? " ✅" : ""}</h3>
            <img src={`/api/aprovar/${id}/imagem?n=${n}`} alt={`Layout opção ${n}`} />
            {!feito && <button type="button" className="ap-bt ap-sim" disabled={enviando} onClick={() => enviar("aprovar", n)}>{enviando ? "Registrando…" : `✅ Escolher a opção ${n}`}</button>}
          </section>
        ))}
        {!feito && <div className="ap-body">
          {modo === "ajuste" ? <>
            <label htmlFor="aj" style={{ fontSize: 14, fontWeight: 600 }}>O que precisa ajustar?</label>
            <textarea id="aj" value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ex.: gostei da opção 2, mas com a logo maior…" />
            <button type="button" className="ap-bt ap-sim" disabled={enviando || !comentario.trim()} onClick={() => enviar("ajuste")}>{enviando ? "Enviando…" : "Enviar pedido de ajuste"}</button>
            <button type="button" className="ap-bt ap-aj" onClick={() => setModo("")}>Voltar</button>
          </> : <button type="button" className="ap-bt ap-aj" onClick={() => setModo("ajuste")}>✏️ Nenhuma serve, pedir ajuste</button>}
        </div>}
      </div>
    </main>
  );

  return (
    <main className="ap">
      <style>{CSS}</style>
      <div className="ap-card">
        <div className="ap-top">
          <b>Compass Brindes · Aprovação de layout</b>
          <span>{dados.cliente ? dados.cliente + " · " : ""}{dados.pedido ? `pedido ${dados.pedido}` : ""}{dados.versao > 1 ? ` · versão ${dados.versao}` : ""}</span>
        </div>
        {imgOk ? <img className="ap-img" src={`/api/aprovar/${encodeURIComponent(params.id)}/imagem`} alt="Layout para aprovação" onError={() => setImgOk(false)} /> : <p className="hn" style={{ padding: 16 }}>O layout também foi enviado em PDF na conversa do WhatsApp.</p>}
        <div className="ap-body">
          {dados.produto && <div className="ap-prod">{dados.produto}</div>}
          {feito === "aprovado" ? (
            <div className="ok">✅<b>Layout aprovado!</b><p className="hn">Obrigado. Já seguimos com a produção e avisamos pelo WhatsApp.</p></div>
          ) : feito === "ajuste" ? (
            <div className="ok">✏️<b>Ajuste solicitado</b><p className="hn">Recebemos o seu pedido. Vamos ajustar e mandar uma nova versão pelo WhatsApp.</p></div>
          ) : (
            <>
              <p className="hn">Confira cores, textos, logo e posição. A produção só começa depois da sua aprovação.</p>
              {modo === "ajuste" ? (
                <>
                  <label htmlFor="aj" style={{ fontSize: 14, fontWeight: 600 }}>O que precisa ajustar?</label>
                  <textarea id="aj" value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ex.: aumentar a logo, trocar a cor do texto…" />
                  <button type="button" className="ap-bt ap-sim" disabled={enviando || !comentario.trim()} onClick={() => enviar("ajuste")}>{enviando ? "Enviando…" : "Enviar pedido de ajuste"}</button>
                  <button type="button" className="ap-bt ap-aj" onClick={() => setModo("")}>Voltar</button>
                </>
              ) : (
                <>
                  <button type="button" className="ap-bt ap-sim" disabled={enviando} onClick={() => enviar("aprovar")}>{enviando ? "Registrando…" : "✅ Aprovar layout"}</button>
                  <button type="button" className="ap-bt ap-aj" onClick={() => setModo("ajuste")}>✏️ Pedir ajuste</button>
                </>
              )}
              {erro && <p className="er">{erro}</p>}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
