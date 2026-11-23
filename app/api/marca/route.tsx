// Imagens oficiais da marca Compass (símbolo 10 · Rede de pontos, escolhido em 22/11/2026).
// Geradas na hora com as fontes certas (Sora 800 + JetBrains Mono 700), para usar como
// foto de perfil (WhatsApp, Instagram) e logo do Bling:
//   /api/marca?tipo=whatsapp   → 1080×1080, só o símbolo, fundo azul-noite
//   /api/marca?tipo=instagram  → 1080×1080, logo empilhada, fundo branco
//   /api/marca?tipo=bling      → 1200×400, logo completa, fundo branco
//   /api/marca?tipo=escura     → 1200×400, logo completa, fundo azul-noite
//   /api/marca?tipo=site       → 1100×330, logo completa, fundo transparente (cabeçalho e rodapé do site)
import { ImageResponse } from "next/og";

export const runtime = "edge";

const AZUL_NOITE = "#0B1020";
const AZUL = "#3B4CCA";
const AZUL_CLARO = "#9FB0FF";

async function fonte(familia: string, peso: number): Promise<ArrayBuffer> {
  // sem user-agent de navegador o Google Fonts devolve o arquivo .ttf, que o gerador de imagem aceita
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${familia}:wght@${peso}`, { cache: "force-cache" })).text();
  const url = /src:\s*url\(([^)]+)\)/.exec(css)?.[1];
  if (!url) throw new Error("fonte não encontrada: " + familia);
  return (await fetch(url, { cache: "force-cache" })).arrayBuffer();
}

function Simbolo({ tam, linha }: { tam: number; linha: string }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 48 48">
      <path d="M10 37 L24 10 L39 32 Z" fill="none" stroke={linha} strokeWidth={3} strokeLinejoin="round" />
      <circle cx="10" cy="37" r="7.5" fill="#009639" />
      <circle cx="39" cy="32" r="7.5" fill="#DA291C" />
      <circle cx="24" cy="10" r="7.5" fill="#FFD100" />
    </svg>
  );
}

function Tagline({ tam, cor, folga }: { tam: number; cor: string; folga: number }) {
  const letras = "BRINDES CORPORATIVOS".split("");
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignSelf: "stretch", paddingRight: folga, fontFamily: "JetBrains Mono", fontSize: tam, fontWeight: 700, color: cor }}>
      {letras.map((l, i) => (l === " " ? <div key={i} style={{ width: tam * 0.6, display: "flex" }} /> : <div key={i} style={{ display: "flex" }}>{l}</div>))}
    </div>
  );
}

function Horizontal({ esc, escuro }: { esc: number; escuro?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 * esc }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 18 * esc }}>
        <div style={{ display: "flex", fontFamily: "Sora", fontSize: 132 * esc, fontWeight: 800, letterSpacing: -0.06 * 132 * esc, lineHeight: 0.8, color: escuro ? "#FFFFFF" : AZUL_NOITE }}>compass</div>
        <Simbolo tam={114 * esc} linha={escuro ? AZUL_CLARO : AZUL} />
      </div>
      <Tagline tam={30 * esc} cor={escuro ? AZUL_CLARO : AZUL} folga={132 * esc} />
    </div>
  );
}

export async function GET(req: Request) {
  const tipo = new URL(req.url).searchParams.get("tipo") || "bling";
  const [sora, mono] = await Promise.all([fonte("Sora", 800), fonte("JetBrains+Mono", 700)]);
  const fonts = [
    { name: "Sora", data: sora, weight: 800 as const, style: "normal" as const },
    { name: "JetBrains Mono", data: mono, weight: 700 as const, style: "normal" as const },
  ];
  const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" };

  if (tipo === "whatsapp") {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: AZUL_NOITE }}>
        <Simbolo tam={640} linha={AZUL_CLARO} />
      </div>,
      { width: 1080, height: 1080, fonts, headers },
    );
  }
  if (tipo === "instagram") {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 34, background: "#FFFFFF" }}>
        <Simbolo tam={290} linha={AZUL} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 30 }}>
          <div style={{ display: "flex", fontFamily: "Sora", fontSize: 146, fontWeight: 800, letterSpacing: -0.06 * 146, lineHeight: 0.8, color: AZUL_NOITE }}>compass</div>
          <Tagline tam={33} cor={AZUL} folga={0} />
        </div>
      </div>,
      { width: 1080, height: 1080, fonts, headers },
    );
  }
  const escuro = tipo === "escura";
  // bling: logo justa (pouca margem), para aparecer grande nos PDFs de proposta, pedido e NF
  const transparente = tipo === "site";
  const justa = tipo === "bling" || transparente;
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: transparente ? "transparent" : escuro ? AZUL_NOITE : "#FFFFFF" }}>
      <Horizontal esc={justa ? 1.5 : 1} escuro={escuro} />
    </div>,
    justa ? { width: 1100, height: 330, fonts, headers } : { width: 1200, height: 400, fonts, headers },
  );
}
