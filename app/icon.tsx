// Ícone da marca nova (símbolo Rede de pontos sobre azul-noite), 22/11/2026.
import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icone() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B1020", borderRadius: 112 }}>
      <svg width={512 * 0.66} height={512 * 0.66} viewBox="0 0 48 48">
        <path d="M10 37 L24 10 L39 32 Z" fill="none" stroke="#9FB0FF" strokeWidth={3} strokeLinejoin="round" />
        <circle cx="10" cy="37" r="7.5" fill="#009639" />
        <circle cx="39" cy="32" r="7.5" fill="#DA291C" />
        <circle cx="24" cy="10" r="7.5" fill="#FFD100" />
      </svg>
    </div>,
    { ...size },
  );
}
