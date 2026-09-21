import { getAllProducts, getCategories } from "@/lib/products";
import { ProductCard } from "@/components/product-card";
import { getCategoryIcon } from "@/lib/category-icons";
import Link from "next/link";

export const revalidate = 0;

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: { categoria?: string; fornecedor?: string; q?: string };
}) {
  const [allProducts, categories] = await Promise.all([getAllProducts(), getCategories()]);

  const query = searchParams.q?.trim().toLowerCase();

  const products = allProducts.filter((p) => {
    if (searchParams.categoria && p.category !== searchParams.categoria) return false;
    if (searchParams.fornecedor && p.supplier !== searchParams.fornecedor) return false;
    if (query) {
      const haystack = `${p.name} ${p.description ?? ""} ${p.category}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return (
    <div className="container section">
      <h2>Produtos</h2>

      <form action="/produtos" method="GET" className="form-row" style={{ marginBottom: 16 }}>
        <div className="form-field" style={{ marginBottom: 0 }}>
          <input
            type="search"
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="Buscar por nome, descrição ou categoria..."
            aria-label="Buscar produtos"
          />
        </div>
        <button className="btn btn-outline" type="submit">
          Buscar
        </button>
      </form>

      <div
        className="produtos-filters"
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        <Link className="btn btn-outline" href="/produtos">
          Todas as categorias
        </Link>
        {categories.map((category) => (
          <Link
            key={category}
            className="btn btn-outline"
            href={`/produtos?categoria=${encodeURIComponent(category)}`}
          >
            <span aria-hidden="true" style={{ marginRight: 6 }}>
              {getCategoryIcon(category)}
            </span>
            {category}
          </Link>
        ))}
      </div>

      {products.length === 0 ? (
        <p className="empty-state">Nenhum produto encontrado para este filtro.</p>
      ) : (
        <div className="product-grid" style={{ marginTop: 24 }}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
