import Link from "next/link";

// Página em preparação — intencionalmente sem link em nenhum menu do site.
// Assim que estiver pronta para publicação, basta adicionar um link para
// "/brindes-por-tema" no site-header ou na home.

export const metadata = {
  title: "Brindes por Tema — Compass Brindes Corporativos",
};

const TEMAS = [
  { nome: "Para Elas", emoji: "💐", busca: "para elas" },
  { nome: "Para Eles", emoji: "🕶️", busca: "para eles" },
  { nome: "Para Crianças", emoji: "🧸", busca: "criança" },
  { nome: "Para Verão", emoji: "☀️", busca: "verão" },
  { nome: "Para Inverno", emoji: "🧣", busca: "inverno" },
  { nome: "Sol e Chuva", emoji: "🌦️", busca: "sol chuva" },
  { nome: "Usar em Casa", emoji: "🏠", busca: "casa" },
  { nome: "Levar na Viagem", emoji: "🧳", busca: "viagem" },
  { nome: "Esporte / Fitness", emoji: "🏋️", busca: "esporte" },
  { nome: "Dia das Mães", emoji: "🌷", busca: "dia das mães" },
  { nome: "Dia dos Pais", emoji: "👔", busca: "dia dos pais" },
  { nome: "Hora do Lazer", emoji: "🎲", busca: "lazer" },
  { nome: "Outubro Rosa", emoji: "🎗️", busca: "outubro rosa" },
  { nome: "Dia da Secretária", emoji: "🗂️", busca: "secretária" },
  { nome: "Dia da Mulher", emoji: "💜", busca: "dia da mulher" },
  { nome: "Novembro Azul", emoji: "💙", busca: "novembro azul" },
  { nome: "Ecológicos", emoji: "🌱", busca: "ecológico" },
  { nome: "Brindes SIPAT", emoji: "🦺", busca: "sipat" },
  { nome: "Brindes Bambu", emoji: "🎋", busca: "bambu" },
  { nome: "Feira e Eventos", emoji: "🎪", busca: "evento" },
  { nome: "Brindes Agro", emoji: "🌾", busca: "agro" },
  { nome: "Para Pets", emoji: "🐾", busca: "pet" },
];

export default function BrindesPorTemaPage() {
  return (
    <div className="container section">
      <h2>Brindes por Tema</h2>
      <p className="section-lede">
        Selecione um tema e encontre os brindes ideais para cada ocasião. (Página em preparação —
        ainda não divulgada no menu do site.)
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 14,
        }}
      >
        {TEMAS.map((tema) => (
          <Link
            key={tema.nome}
            href={`/produtos?q=${encodeURIComponent(tema.busca)}`}
            className="category-card"
            style={{ alignItems: "center", textAlign: "center", gap: 10 }}
          >
            <span style={{ fontSize: "2rem" }}>{tema.emoji}</span>
            <span>{tema.nome}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
