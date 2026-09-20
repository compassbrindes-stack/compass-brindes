import { getAllProducts, getCategories } from "@/lib/products";
import { ProductCard } from "@/components/product-card";
import Link from "next/link";

export const revalidate = 0;

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: { categoria?: string; fornecedor?: string };
}) {
  const [allProducts, categories] = await Promise.all([getAllProducts(), getCategories()]);

  const products = allProducts.filter((p) => {
    if (searchParams.categoria && p.category !== searchParams.categoria) return false;
    if (searchParams.fornecedor && p.supplier !== searchParams.fornecedor) return false;
    return true;
  });

  return (
    <div className="container section">
      <h2>Produtos</h2>

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
