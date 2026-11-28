// @ts-nocheck
"use client";
/* Etiquetas de volume (28/11) — mesma ferramenta do gestor (Logística › Etiquetas de volume), aqui no site
   para imprimir direto (no gestor do Claude a janela de impressão é bloqueada).
   (A) PDF da etiqueta do Bling: recorta a etiqueta (vetorial) · (B) nº da NF: monta a etiqueta com os dados do Bling.
   Repete por volume, carimba "VOLUME X/Y" e monta a grade na folha A4 com linhas de corte. */
import { useEffect, useRef, useState } from "react";
import * as PDFLib from "pdf-lib";

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const JSBARCODE = "https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js";
function carregarScript(src) {
  return new Promise((ok, erro) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok(true);
    const s = document.createElement("script"); s.src = src; s.async = true; s.onload = () => ok(true); s.onerror = () => erro(new Error("Falha ao carregar " + src));
    document.head.appendChild(s);
  });
}
let _logo = null;
async function logoMarca() {
  if (_logo) return _logo;
  const r = await fetch("/api/marca?tipo=bling&v=1"); if (!r.ok) return null;
  const b = new Uint8Array(await r.arrayBuffer()); let t = ""; for (let i = 0; i < b.length; i++) t += String.fromCharCode(b[i]);
  _logo = { data: "data:image/png;base64," + btoa(t), fmt: (r.headers.get("content-type") || "").includes("jpeg") ? "JPEG" : "PNG" };
  return _logo;
}

const MM = 72 / 25.4;
const ETQ_GRADES = [
  {k:'3', n:3, cols:1, rows:3, nome:'3 por folha', sub:'1 × 3 · melhor para a etiqueta do Bling'},
  {k:'2', n:2, cols:1, rows:2, nome:'2 por folha', sub:'1 × 2 · etiqueta grande'},
  {k:'4', n:4, cols:2, rows:2, nome:'4 por folha', sub:'2 × 2'},
  {k:'6', n:6, cols:2, rows:3, nome:'6 por folha', sub:'2 × 3 · compacta'},
];
const etqTxt = s => String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/•/g, '·').replace(/[^\x0A\x20-\x7E\xA0-\xFF]/g, '');
// 28/11: data URL -> bytes sem fetch (o gestor não deixa fetch em data:)
const etqBytes = u => { const b = atob(String(u).split(',')[1] || ''); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
const etqNum = s => { const d = String(s || '').replace(/\D/g, ''); return d ? d.padStart(6, '0') : ''; };
const etqCep = c => { const d = String(c || '').replace(/\D/g, ''); return d.length === 8 ? d.slice(0, 2) + '.' + d.slice(2, 5) + '-' + d.slice(5) : d; };
const etqFone = f => { const d = String(f || '').replace(/\D/g, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : d; };

/* acha a área da etiqueta na página: tira o cabeçalho/rodapé que o navegador põe ao imprimir (data, "Notas fiscais - Bling", URL, 1/1) */
async function etqCaixaPagina(pg, fora = []){
  const vp = pg.getViewport({scale: 1.5});
  const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
  await pg.render({canvasContext: cx, viewport: vp}).promise;
  const {data, width: W, height: H} = cx.getImageData(0, 0, cv.width, cv.height);
  const linha = new Array(H).fill(false), colMin = new Array(H).fill(W), colMax = new Array(H).fill(-1);
  const corta = y => fora.some(([a, b]) => y >= a * 1.5 && y <= b * 1.5);
  for (let y = 0; y < H; y++) if (!corta(y)) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (data[i] + data[i + 1] + data[i + 2] < 600) { linha[y] = true; if (x < colMin[y]) colMin[y] = x; if (x > colMax[y]) colMax[y] = x; } }
  // blocos de linhas com conteúdo, separados por 18pt ou mais de branco
  const gap = 18 * 1.5, blocos = []; let ini = -1, fimB = -1;
  for (let y = 0; y < H; y++) if (linha[y]) { if (ini < 0 || y - fimB > gap) { if (ini >= 0) blocos.push([ini, fimB]); ini = y; } fimB = y; }
  if (ini >= 0) blocos.push([ini, fimB]);
  const borda = 34 * 1.5, fino = 16 * 1.5;
  const uteis = blocos.filter(([a, b]) => !((a < borda || b > H - borda) && b - a < fino));
  const usar = uteis.length ? uteis : blocos;
  if (!usar.length) return null;
  const y0 = usar[0][0], y1 = usar[usar.length - 1][1]; let x0 = W, x1 = 0;
  for (let y = y0; y <= y1; y++) if (linha[y]) { x0 = Math.min(x0, colMin[y]); x1 = Math.max(x1, colMax[y]); }
  const pad = 6, s = 1 / 1.5, ph = vp.height * s; // em pontos PDF (origem embaixo à esquerda)
  return {left: Math.max(0, x0 * s - pad), right: Math.min(vp.width * s, x1 * s + pad), top: Math.min(ph, ph - y0 * s + pad), bottom: Math.max(0, ph - y1 * s - pad)};
}
async function etqLerPdf(buf){
  const lib = window.pdfjsLib; if (!lib) throw new Error('Leitor de PDF indisponível.');
  const pdf = await lib.getDocument({data: new Uint8Array(buf.slice(0))}).promise;
  const out = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 30); i++){
    const pg = await pdf.getPage(i);
    const tc = (await pg.getTextContent()).items, alt = pg.getViewport({scale: 1}).height;
    // faixas do cabeçalho/rodapé do navegador (data e hora, "Notas fiscais - Bling", endereço bling.com.br, "1/1"), em pontos a partir do topo
    const fora = tc.filter(t => /\d{2}\/\d{2}\/\d{4},\s*\d{1,2}:\d{2}|Notas fiscais\s*-\s*Bling|bling\.com\.br|^\s*\d+\/\d+\s*$/i.test(t.str)).map(t => { const yTopo = alt - t.transform[5], h = Math.abs(t.transform[3]) || 8; return [yTopo - h - 3, yTopo + 4]; }).filter(([a, b]) => b < 60 || a > alt - 60);
    const caixa = await etqCaixaPagina(pg, fora); if (!caixa) continue;
    const txt = tc.map(t => t.str).join(' ');
    const nf = etqNum(((/Nota\s*Fiscal\s*:?\s*(\d{1,9})/i.exec(txt)) || [])[1]);
    const dest = ((/Destinat[áa]rio[^\n]*?\d{4}\s+(?:Nota\s*Fiscal\s*:?\s*\d+\s+)?(.+?)(?:\s+-\s+Fone|\s{2,}|$)/i.exec(txt)) || [])[1] || '';
    out.push({tipo:'pdf', pagina: i - 1, caixa, nf, dest: dest.trim(), vol: 1});
  }
  return out;
}

/* código de barras do CEP (Code128) como PNG; sem a biblioteca, a etiqueta sai sem barras */
function etqBarras(txt){
  try { if (!window.JsBarcode || !txt) return null; const cv = document.createElement('canvas');
    window.JsBarcode(cv, txt, {format: 'CODE128', displayValue: false, margin: 0, height: 120, width: 4}); return cv.toDataURL('image/png'); } catch(e){ return null; }
}
/* modo B: desenha a etiqueta (190 × 88 mm, mesmo desenho da do Bling) numa página própria, depois entra na grade igual à do PDF */
async function etqDesenharDados(out, d){
  const {StandardFonts, rgb} = PDFLib;
  const W = 190 * MM, H = 88 * MM, pg = out.addPage([W, H]);
  const f = await out.embedFont(StandardFonts.Helvetica), fb = await out.embedFont(StandardFonts.HelveticaBold);
  const preto = rgb(0.08, 0.08, 0.08), cinza = rgb(0.35, 0.35, 0.35);
  const txt = (s, x, y, tam, fonte = f, cor = preto, maxW = W - x - 10) => { let t = etqTxt(s); while (t && fonte.widthOfTextAtSize(t, tam) > maxW) t = t.slice(0, -1); pg.drawText(t, {x, y, size: tam, font: fonte, color: cor}); };
  const quebra = (s, tam, fonte, maxW) => { const pal = etqTxt(s).split(/\s+/), l = []; let a = ''; pal.forEach(p => { const n = a ? a + ' ' + p : p; if (fonte.widthOfTextAtSize(n, tam) > maxW && a) { l.push(a); a = p; } else a = n; }); if (a) l.push(a); return l; };
  let y = H - 14;
  try { const lg = await logoMarca(); if (lg && lg.data) { const bytes = etqBytes(lg.data); const img = lg.fmt === 'JPEG' ? await out.embedJpg(bytes) : await out.embedPng(bytes); const h = 30, w = h * img.width / img.height; pg.drawImage(img, {x: 10, y: H - 10 - h, width: Math.min(w, 150), height: h * Math.min(1, 150 / w)}); } } catch(e){}
  txt('COMPASS BRINDES', 175, y - 6, 10, fb); txt('RUA PADRE JOSE ANCHIETA, 116 - CENTRO', 175, y - 18, 8.5, f, cinza);
  txt('98460-000 - Iraí (RS) · CNPJ 26.123.176/0001-24', 175, y - 29, 8.5, f, cinza);
  y = H - 62;
  pg.drawLine({start: {x: 10, y: y + 8}, end: {x: W - 10, y: y + 8}, thickness: 0.6, color: rgb(0.7, 0.7, 0.7)});
  txt('DESTINATÁRIO', 10, y - 4, 8, fb, cinza);
  const nfTxt = `Nota Fiscal: ${d.nf}${d.serie ? ' · série ' + d.serie : ''}`; pg.drawText(etqTxt(nfTxt), {x: W - 10 - fb.widthOfTextAtSize(etqTxt(nfTxt), 11), y: y - 4, size: 11, font: fb, color: preto});
  y -= 20;
  quebra(d.nome, 13, fb, W - 20).slice(0, 2).forEach(l => { txt(l, 10, y, 13, fb); y -= 15; });
  [d.rua, [d.bairro, d.cidade && d.uf ? `${d.cidade} - ${d.uf}` : d.cidade].filter(Boolean).join(' - '), [d.cep ? 'CEP ' + etqCep(d.cep) : '', d.fone ? 'Fone ' + d.fone : ''].filter(Boolean).join(' · ')].filter(Boolean).forEach(l => { txt(l, 10, y, 10.5); y -= 13; });
  const bar = etqBarras(d.cep);
  const bh = Math.max(28, Math.min(48, y - 22));
  if (bar) { const img = await out.embedPng(etqBytes(bar)); pg.drawImage(img, {x: 10, y: y - bh - 2, width: 150, height: bh}); txt(d.cep, 10, y - bh - 12, 8, f, cinza); }
  // 28/11: nº da NF grande ao lado do código de barras (identificação do documento)
  if (d.nf) { txt('NF', 185, y - 36, 20, fb); txt(d.nf, 185 + fb.widthOfTextAtSize('NF', 20) + 8, y - 36, 32, fb); }
  if (d.transp) { const t = 'Transportadora: ' + d.transp; txt(t, W - 10 - Math.min(f.widthOfTextAtSize(etqTxt(t), 9), W * 0.55), 14, 9, f, cinza, W * 0.55); }
  return pg;
}

/* monta o PDF final: uma etiqueta por volume, "VOLUME X/Y" em cada, n por folha A4, linhas de corte */
async function etqMontarPdf(fontes, pdfBytes, grade){
  const {PDFDocument, StandardFonts, rgb, degrees} = PDFLib;
  const out = await PDFDocument.create(); out.setTitle('Etiquetas de volume - Compass Brindes');
  const fb = await out.embedFont(StandardFonts.HelveticaBold), f = await out.embedFont(StandardFonts.Helvetica);
  const src = pdfBytes ? await PDFDocument.load(pdfBytes, {ignoreEncryption: true}) : null;
  // páginas embutidas (uma por etiqueta de origem)
  const emb = [];
  for (const s of fontes){
    if (s.tipo === 'pdf') { const pg = src.getPage(s.pagina); emb.push(await out.embedPage(pg, s.caixa)); }
    else { const tmp = await PDFDocument.create(); await etqDesenharDados(tmp, s.dados); const [e] = await out.embedPdf(await tmp.save(), [0]); emb.push(e); }
  }
  const itens = []; fontes.forEach((s, i) => { const n = Math.max(1, Math.min(99, +s.vol || 1)); for (let v = 1; v <= n; v++) itens.push({e: emb[i], tipo: s.tipo, v, n, nf: s.nf || (s.dados && s.dados.nf) || '', dest: s.dest || (s.dados && s.dados.nome) || ''}); });
  const PW = 210 * MM, PH = 297 * MM, cw = PW / grade.cols, ch = PH / grade.rows, m = 5 * MM, faixa = 13 * MM;
  const cinza = rgb(0.6, 0.6, 0.6);
  for (let p = 0; p < itens.length; p += grade.n){
    const pg = out.addPage([PW, PH]);
    // linhas de corte pontilhadas
    for (let c = 1; c < grade.cols; c++) pg.drawLine({start: {x: c * cw, y: 0}, end: {x: c * cw, y: PH}, thickness: 0.4, color: cinza, dashArray: [3, 3]});
    for (let r = 1; r < grade.rows; r++) pg.drawLine({start: {x: 0, y: r * ch}, end: {x: PW, y: r * ch}, thickness: 0.4, color: cinza, dashArray: [3, 3]});
    itens.slice(p, p + grade.n).forEach((it, k) => {
      const col = k % grade.cols, row = Math.floor(k / grade.cols);
      const x0 = col * cw + m, yTop = PH - row * ch - m, w = cw - 2 * m, hUtil = ch - 2 * m - faixa;
      const esc = Math.min(w / it.e.width, hUtil / it.e.height), ew = it.e.width * esc, eh = it.e.height * esc;
      pg.drawPage(it.e, {x: x0 + (w - ew) / 2, y: yTop - eh, width: ew, height: eh});
      // 28/11: etiqueta do Bling: nº da NF grande na área livre à direita do código de barras
      if (it.tipo === 'pdf' && it.nf) { const lx = x0 + (w - ew) / 2, tn = Math.min(34, eh * 0.15), tl = Math.max(6, tn * 0.26), xn = lx + ew * 0.42, yn = yTop - eh + eh * 0.12;
        const tp = tn * 0.62; pg.drawText('NF', {x: xn, y: yn, size: tp, font: fb, color: rgb(0, 0, 0)}); pg.drawText(it.nf, {x: xn + fb.widthOfTextAtSize('NF', tp) + tn * 0.25, y: yn, size: tn, font: fb, color: rgb(0, 0, 0)}); }
      // carimbo do volume
      const yb = yTop - eh - faixa + 2 * MM, hb = faixa - 3 * MM;
      pg.drawRectangle({x: x0, y: yb, width: w, height: hb, borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 1.2, color: rgb(1, 1, 1)});
      const tam = Math.min(20, hb * 0.62), vt = `VOLUME ${it.v}/${it.n}`;
      pg.drawText(vt, {x: x0 + 3 * MM, y: yb + (hb - tam * 0.72) / 2, size: tam, font: fb, color: rgb(0, 0, 0)});
      const info = etqTxt([it.nf ? 'NF ' + it.nf : '', it.dest].filter(Boolean).join(' · ')); let inf = info; const maxI = w - fb.widthOfTextAtSize(vt, tam) - 9 * MM, ti = 8.5;
      while (inf && f.widthOfTextAtSize(inf, ti) > maxI) inf = inf.slice(0, -1);
      if (inf !== info && inf.length > 1) inf = inf.slice(0, -1) + '.';
      pg.drawText(inf, {x: x0 + w - 3 * MM - f.widthOfTextAtSize(inf, ti), y: yb + (hb - ti * 0.72) / 2, size: ti, font: f, color: rgb(0.25, 0.25, 0.25)});
    });
  }
  return {bytes: await out.save(), paginas: Math.ceil(itens.length / grade.n), total: itens.length};
}


const caixaSt = { border: "1px solid #d9dfe1", borderRadius: 12, background: "#fff", padding: 16 };
const h3St = { fontSize: 16, fontWeight: 700, margin: 0 };
const mutSt = { fontSize: 12.5, color: "#5d6a70" };
const chipSt = (on) => ({ padding: "8px 14px", borderRadius: 8, border: "1px solid " + (on ? "#0b2027" : "#d9dfe1"), background: on ? "#0b2027" : "#fff", color: on ? "#fff" : "#0b2027", fontWeight: 600, fontSize: 14, cursor: "pointer" });
const inputSt = { width: "100%", border: "1px solid #c9d3d6", borderRadius: 8, padding: "9px 12px", fontSize: 15 };

export default function EtiquetasCliente({ chave }: { chave: string }) {
  const [modo, setModo] = useState("pdf");
  const [pdfBytes, setPdfBytes] = useState(null);
  const [arq, setArq] = useState("");
  const [fontes, setFontes] = useState([]);
  const [numNf, setNumNf] = useState("");
  const [grade, setGrade] = useState("3");
  const [ocup, setOcup] = useState("");
  const [msg, setMsg] = useState("");
  const [res, setRes] = useState(null);
  const [libs, setLibs] = useState(false);
  const prev = useRef(null);
  const G = ETQ_GRADES.find((g) => g.k === grade) || ETQ_GRADES[0];

  useEffect(() => {
    try { const g = localStorage.getItem("compass-etq-grade"); if (g) setGrade(g); } catch {}
    (async () => {
      try {
        await carregarScript(PDFJS); window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        await carregarScript(JSBARCODE).catch(() => {});
        setLibs(true);
      } catch (e) { setMsg("Não foi possível carregar o leitor de PDF. Recarregue a página."); }
    })();
  }, []);
  const escolherGrade = (k) => { setGrade(k); try { localStorage.setItem("compass-etq-grade", k); } catch {} };

  const buscarApi = async (numero) => {
    const r = await fetch(`/api/etiquetas/nf?numero=${encodeURIComponent(numero)}`, { headers: { Authorization: "Bearer " + chave }, cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Não foi possível buscar a NF.");
    return j;
  };
  const abrirPdf = async (file) => {
    if (!file || !libs) return; setMsg(""); setRes(null); setOcup("Lendo o PDF…"); setArq(file.name);
    try {
      const buf = await file.arrayBuffer(); setPdfBytes(buf);
      let l = await etqLerPdf(buf); if (!l.length) throw new Error("Não achei etiqueta nesse PDF.");
      setFontes(l); setOcup("Buscando os volumes da NF no Bling…");
      l = await Promise.all(l.map(async (s) => { if (!s.nf) return s; try { const d = await buscarApi(s.nf); return { ...s, dest: s.dest || d.nome, vol: d.volBling || s.vol, volBling: d.volBling, origemVol: d.origemVol, pedido: d.pedido, transp: d.transp }; } catch { return s; } }));
      setFontes(l);
    } catch (e) { setMsg(e.message || "Não foi possível ler o PDF."); }
    setOcup("");
  };
  const buscarNf = async () => {
    setMsg(""); setRes(null); setOcup("Buscando a NF no Bling…");
    try { const d = await buscarApi(numNf); setFontes((f) => [...f.filter((x) => x.tipo === "dados"), { tipo: "dados", dados: d, nf: d.nf, dest: d.nome, vol: d.vol, volBling: d.volBling, origemVol: d.origemVol, pedido: d.pedido, transp: d.transp }]); setNumNf(""); }
    catch (e) { setMsg(e.message || "Não foi possível buscar a NF."); }
    setOcup("");
  };
  const setVol = (i, v) => { setRes(null); setFontes((f) => f.map((x, k) => (k === i ? { ...x, vol: v } : x))); };
  const tirar = (i) => { setRes(null); setFontes((f) => f.filter((x, k) => k !== i)); };
  const trocarModo = (m) => { setModo(m); setFontes([]); setPdfBytes(null); setArq(""); setRes(null); setMsg(""); };

  useEffect(() => {
    if (!fontes.length || !libs) { setRes(null); if (prev.current) prev.current.innerHTML = ""; return; }
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const r = await etqMontarPdf(fontes.map((x) => ({ ...x, vol: Math.max(1, Math.min(99, parseInt(x.vol, 10) || 1)) })), pdfBytes, G);
        if (!vivo) return; setRes(r);
        const pdf = await window.pdfjsLib.getDocument({ data: r.bytes.slice(0) }).promise;
        if (!vivo || !prev.current) return;
        const alvo = prev.current; alvo.innerHTML = "";
        for (let i = 1; i <= Math.min(pdf.numPages, 12); i++) {
          const pg = await pdf.getPage(i); const vp0 = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale: (240 / vp0.width) * 2 });
          const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height; cv.style.width = "240px"; cv.style.border = "1px solid #d9dfe1"; cv.style.background = "#fff";
          await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise; if (!vivo) return;
          const fig = document.createElement("figure"); fig.style.margin = "0"; fig.appendChild(cv);
          const cap = document.createElement("figcaption"); cap.style.cssText = "font-size:12px;color:#5d6a70;text-align:center"; cap.textContent = `Folha ${i} de ${pdf.numPages}`; fig.appendChild(cap); alvo.appendChild(fig);
        }
      } catch (e) { if (vivo) setMsg("Não foi possível montar as etiquetas: " + (e.message || e)); }
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [fontes, grade, pdfBytes, libs]); // eslint-disable-line react-hooks/exhaustive-deps

  const nomeArq = () => "etiquetas-" + (fontes.map((x) => x.nf).filter(Boolean).join("-") || "volumes") + ".pdf";
  const blobUrl = () => URL.createObjectURL(new Blob([res.bytes], { type: "application/pdf" }));
  const baixar = () => { if (!res) return; const a = document.createElement("a"); a.href = blobUrl(); a.download = nomeArq(); a.click(); };
  const imprimir = () => {
    if (!res) return;
    const url = blobUrl();
    const fr = document.createElement("iframe"); fr.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0"; fr.src = url;
    fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch { window.open(url, "_blank"); } setTimeout(() => fr.remove(), 120000); };
    document.body.appendChild(fr);
  };

  return (
    <div className="container section" style={{ maxWidth: 1180 }}>
      <h2 style={{ marginBottom: 4 }}>Etiquetas de volume</h2>
      <p style={mutSt}>Uma etiqueta por volume com &quot;VOLUME 1/N&quot;, várias por folha A4, prontas para imprimir e recortar.</p>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", marginTop: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={caixaSt}>
            <h3 style={h3St}>1. Etiqueta</h3>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" style={chipSt(modo === "pdf")} onClick={() => trocarModo("pdf")}>PDF do Bling</button>
              <button type="button" style={chipSt(modo === "nf")} onClick={() => trocarModo("nf")}>Número da NF</button>
            </div>
            {modo === "pdf" ? (
              <label style={{ marginTop: 12, display: "block", border: "2px dashed #c9d3d6", borderRadius: 10, padding: "22px 14px", textAlign: "center", cursor: "pointer" }}
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); abrirPdf(e.dataTransfer.files && e.dataTransfer.files[0]); }}>
                <strong style={{ fontSize: 14.5 }}>{arq || "Escolher ou arrastar o PDF da etiqueta"}</strong>
                <span style={{ ...mutSt, display: "block", marginTop: 4 }}>Bling › Notas fiscais › Imprimir etiqueta › salvar como PDF. Pode ter várias NFs, uma por página.</span>
                <input type="file" accept="application/pdf,.pdf" style={{ display: "none" }} onChange={(e) => abrirPdf(e.target.files && e.target.files[0])} />
              </label>
            ) : (
              <form style={{ display: "flex", gap: 8, marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); buscarNf(); }}>
                <input aria-label="Número da NF" inputMode="numeric" style={inputSt} placeholder="Nº da NF, ex.: 321" value={numNf} onChange={(e) => setNumNf(e.target.value)} />
                <button className="btn btn-primary" type="submit" disabled={!numNf.trim() || !!ocup}>Buscar</button>
              </form>
            )}
            {ocup && <p style={{ ...mutSt, marginTop: 8 }}>{ocup}</p>}
          </div>

          {!!fontes.length && (
            <div style={caixaSt}>
              <h3 style={h3St}>2. Volumes</h3>
              {fontes.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i ? "1px solid #eef1f2" : "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.nf ? "NF " + s.nf : `Etiqueta ${i + 1}`}</div>
                    <div style={{ ...mutSt, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.dest || "Destinatário do PDF"}{s.transp ? " · " + s.transp : ""}</div>
                    <div style={{ ...mutSt, fontSize: 11.5 }}>{s.volBling ? (s.origemVol === "xml" ? `XML da NF: ${s.volBling} volume(s)` : `Pedido ${s.pedido || ""}: ${s.volBling} volume(s)`) + " · se teve carta de correção, ajuste ao lado" : "Volumes não achados no Bling: confira"}</div>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>Volumes
                    <input inputMode="numeric" style={{ ...inputSt, width: 64, textAlign: "center" }} value={s.vol} onChange={(e) => setVol(i, e.target.value.replace(/\D/g, "").slice(0, 2))} /></label>
                  {modo === "nf" && <button type="button" onClick={() => tirar(i)} aria-label="Tirar etiqueta" style={{ border: 0, background: "none", fontSize: 20, cursor: "pointer", color: "#5d6a70" }}>×</button>}
                </div>
              ))}
            </div>
          )}

          <div style={caixaSt}>
            <h3 style={h3St}>3. Etiquetas por folha A4</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }} role="radiogroup" aria-label="Etiquetas por folha">
              {ETQ_GRADES.map((g) => (
                <button key={g.k} type="button" role="radio" aria-checked={grade === g.k} onClick={() => escolherGrade(g.k)}
                  style={{ display: "flex", gap: 10, alignItems: "center", textAlign: "left", padding: 10, borderRadius: 10, cursor: "pointer", background: "#fff", border: grade === g.k ? "2px solid #0b2027" : "1px solid #d9dfe1" }}>
                  <span style={{ display: "grid", gap: 2, width: 30, height: 42, padding: 3, border: "1px solid #bbb", gridTemplateColumns: `repeat(${g.cols},1fr)`, gridTemplateRows: `repeat(${g.rows},1fr)`, flexShrink: 0 }}>
                    {Array.from({ length: g.n }).map((_, k) => <i key={k} style={{ background: "#c9d3d6" }} />)}
                  </span>
                  <span><strong style={{ display: "block", fontSize: 14 }}>{g.nome}</strong><span style={{ ...mutSt, fontSize: 11.5 }}>{g.sub}</span></span>
                </button>
              ))}
            </div>
          </div>

          {res && (
            <div style={caixaSt}>
              <p style={{ margin: 0, fontSize: 14 }}><strong>{res.total} etiqueta(s)</strong> em <strong>{res.paginas} folha(s)</strong>{res.total % G.n ? ` · a última folha usa ${res.total % G.n} de ${G.n} posições` : ""}.</p>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button className="btn btn-primary" type="button" onClick={imprimir}>Imprimir</button>
                <button className="btn btn-outline" type="button" onClick={baixar}>Baixar PDF</button>
              </div>
              <p style={{ ...mutSt, marginTop: 8 }}>Na impressão: papel A4, escala 100% (tamanho real), sem &quot;ajustar à página&quot;.</p>
            </div>
          )}
          {msg && <p style={{ fontSize: 13.5 }}>{msg}</p>}
        </div>

        <div style={{ ...caixaSt, background: "#f4f6f7", minHeight: 300 }}>
          <h3 style={{ ...h3St, marginBottom: 12 }}>Pré-visualização</h3>
          {!fontes.length && <p style={mutSt}>Escolha o PDF da etiqueta ou busque a NF para ver as folhas aqui.</p>}
          <div ref={prev} style={{ display: "flex", flexWrap: "wrap", gap: 14 }} />
        </div>
      </div>
    </div>
  );
}
