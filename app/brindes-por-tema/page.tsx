import Link from "next/link";
import { FEATURED_THEME_SLUG, THEMES } from "@/lib/themes";

export const metadata = {
  title: "Brindes por Tema — Compass Brindes Corporativos",
  description:
    "Brindes corporativos por ocasião: Outubro Rosa, Novembro Azul, SIPAT, datas comemorativas, viagem, lazer e mais.",
};

export default function BrindesPorTemaPage() {
  const temas = THEMES.filter((t) => t.skus.length > 0);
  const destaque = temas.find((t) => t.slug === FEATURED_THEME_SLUG);
  const outros = temas.filter((t) => t.slug !== FEATURED_THEME_SLUG);

  return (
    <div className="container section">
      <h2>Brindes por tema</h2>
      <p className="section-lede">
        Escolha a ocasião e veja os brindes que combinam com ela. Não achou o que procura? Fale com a
        gente pelo WhatsApp que montamos uma seleção para a sua ação.
      </p>

      {destaque && (
        <Link href={"/produtos?tema=" + destaque.slug} className="theme-featured">
          <span className="theme-featured__emoji" aria-hidden="true">
            {destaque.emoji}
          </span>
          <span className="theme-featured__body">
            <span className="theme-featured__eyebrow">Em destaque este mês</span>
            <span className="theme-featured__title">{destaque.nome}</span>
            <span className="theme-featured__text">{destaque.descricao}</span>
          </span>
          <span className="theme-featured__cta">Ver brindes →</span>
        </Link>
      )}

      <div className="theme-grid">
        {outros.map((tema) => (
          <Link key={tema.slug} href={"/produtos?tema=" + tema.slug} className="category-card theme-card">
            <span className="theme-card__emoji" aria-hidden="true">
              {tema.emoji}
            </span>
            <span>{tema.nome}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
