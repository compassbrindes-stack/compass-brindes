import Link from "next/link";
import { getAllProducts, getCategories } from "@/lib/products";
import { ProductCard } from "@/components/product-card";

export const revalidate = 0;

export default async function HomePage() {
  const [products, categories] = await Promise.all([getAllProducts(), getCategories()]);
  const featured = products.slice(0, 8);

  return (
    <>
      <section className="hero container">
        <h1>Brindes corporativos personalizados para a sua marca</h1>
        <p>
          Catálogo com produtos dos nossos fornecedores parceiros — XBZ, Asia Import e Spot Gifts —
          tudo em um só lugar. Monte seu orçamento e fale com a gente pelo WhatsApp.
        </p>
        <div className="hero-actions">
          <Link className="btn btn-primary" href="/produtos">
            Ver todos os produtos
          </Link>
          <Link className="btn btn-outline" href="/orcamento">
            Meu orçamento
          </Link>
        </div>
      </section>

      <section className="section container">
        <h2>Categorias</h2>
        <div className="category-grid">
          {categories.map((category) => (
            <Link
              key={category}
              className="category-card"
              href={`/produtos?categoria=${encodeURIComponent(category)}`}
            >
              {category}
            </Link>
          ))}
        </div>
      </section>

      <section className="section container">
        <h2>Destaques</h2>
        <div className="product-grid">
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </>
  );
}
