import Link from "next/link";
import { getAllProducts, getCategories } from "@/lib/products";
import { ProductCard } from "@/components/product-card";
import { HeroCarousel } from "@/components/hero-carousel";

export const revalidate = 0;
const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
const whatsappUrl = WHATSAPP_NUMBER
  ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
      "Olá! Vim pelo site da Compass Brindes e gostaria de um orçamento."
    )}`
  : "/orcamento";

export default async function HomePage() {
  const [products, categories] = await Promise.all([getAllProducts(), getCategories()]);
  const featured = products.slice(0, 8);

  return (
    <>
      <section className="hero">
        <div className="container">
          <p className="hero-eyebrow">Personalização que vira presença</p>
          <h1>
            Brindes que fazem sua marca <em>ser lembrada.</em>
          </h1>
          <p>
            Curadoria de produtos corporativos para empresas que querem presentear com intenção —
            do primeiro contato ao momento que fica.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/produtos">
              Explorar catálogo
            </Link>
            <Link className="btn btn-outline" href="/orcamento">
              Meu orçamento
            </Link>
          </div>
        </div>
      </section>
      <section className="benefits-grid container">
        <div>
          <h3>Resposta rápida</h3>
          <p>Atendimento direto para tirar dúvidas e montar seu pedido.</p>
        </div>
        <div>
          <h3>Personalização com intenção</h3>
          <p>A gente ajuda a escolher o item certo para cada ação.</p>
        </div>
        <div>
          <h3>Compra mais segura</h3>
          <p>Orçamento claro, curadoria e acompanhamento próximo.</p>
        </div>
      </section>

      <section className="section container">
        <h2>
          Um bom brinde começa <em style={{ fontStyle: "italic", color: "#3d6b5c" }}>antes</em> do
          produto.
        </h2>
        <p className="section-lede">
          O que você quer que as pessoas sintam ao receber sua marca? A Compass ajuda a
          transformar objetivo em escolha — com ideias para cada momento da jornada.
        </p>
        <div className="category-grid">
          {categories.map((category) => (
            <Link
              key={category}
              className="category-card"
              href={"/produtos?categoria=" + encodeURIComponent(category)}
            >
              <span>{category}</span>
              <span className="category-card__arrow">Ver seleção &#8594;</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section container">
        <div className="section-head">
          <div>
            <h2>Presentes que trabalham a favor da sua marca.</h2>
            <p className="section-lede" style={{ marginBottom: 0 }}>
              Alguns favoritos do catálogo Compass. Fale com a gente para definir quantidade,
              personalização e prazo.
            </p>
          </div>
          <Link className="btn btn-primary" href="/produtos">
            Ver catálogo completo
          </Link>
        </div>
        <div className="product-grid">
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="process" id="como-funciona">
        <div className="container process__inner">
          <div>
            <span className="process-eyebrow">Do briefing à entrega</span>
            <h2>
              Sem complicação. <em style={{ fontStyle: "italic" }}>Com direção.</em>
            </h2>
            <p>
              Você conta o momento. A Compass encontra o presente. O resultado é uma marca que
              chega mais perto.
            </p>
            <a
              className="btn"
              style={{ background: "#102b32", color: "#fff" }}
              href={whatsappUrl}
              target={WHATSAPP_NUMBER ? "_blank" : undefined}
              rel="noreferrer"
            >
              Começar uma conversa
            </a>
          </div>
          <div className="process-steps">
            <div className="process-step">
              <span className="num">01</span>
              <div>
                <h3>Conte o contexto</h3>
                <p>Fale sobre sua empresa, sua ação e quem vai receber.</p>
              </div>
            </div>
            <div className="process-step">
              <span className="num">02</span>
              <div>
                <h3>A gente faz a curadoria</h3>
                <p>Você recebe uma seleção coerente com sua marca e seu objetivo.</p>
              </div>
            </div>
            <div className="process-step">
              <span className="num">03</span>
              <div>
                <h3>Sua marca ganha presença</h3>
                <p>Cuidamos dos próximos passos para a experiência chegar inteira.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-final">
        <div className="container cta-final__inner">
          <div>
            <p className="hero-eyebrow" style={{ marginBottom: 8 }}>
              A próxima boa escolha começa aqui
            </p>
            <h2>Vamos encontrar o presente certo</h2>
            <h2 className="accent">para a sua próxima ação?</h2>
          </div>
          <a
            className="btn btn-primary"
            href={whatsappUrl}
            target={WHATSAPP_NUMBER ? "_blank" : undefined}
            rel="noreferrer"
          >
            Falar pelo WhatsApp
          </a>
        </div>
      </section>
    </>
  );
}
