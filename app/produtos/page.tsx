import { getAllProducts, getCategories } from "@/lib/products";
import { ProductCard } from "@/components/product-card";
import { getCategoryIcon } from "@/lib/category-icons";
import Link from "next/link";
import { getTheme } from "@/lib/themes";

export const revalidate = 0;

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: { categoria?: string; fornecedor?: string; q?: string; tema?: string; genero?: string; tipo?: string };
}) {
  const [allProducts, categories] = await Promise.all([getAllProducts(), getCategories()]);

  const query = searchParams.q?.trim().toLowerCase();
  const theme = getTheme(searchParams.tema);
  const themeSkus = theme ? new Set(theme.skus) : null;

  const products = allProducts.filter((p) => {
    if (
      searchParams.categoria &&
      p.category !== searchParams.categoria &&
      !p.extraCategories?.includes(searchParams.categoria)
    )
      return false;
    if (searchParams.fornecedor && p.supplier !== searchParams.fornecedor) return false;
    if (themeSkus && !themeSkus.has(p.supplierSku)) return false;
    if (searchParams.genero && p.apparel?.genero !== searchParams.genero) return false;
    if (searchParams.tipo && p.subcategory !== searchParams.tipo) return false;
    if (query) {
      const haystack = `${p.name} ${p.description ?? ""} ${p.category} ${p.supplierCode ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  // Dentro da aba Vestuário, sub-abas para separar Masculino e Feminino.
  const categoriaAtual = searchParams.categoria;
  const generos = categoriaAtual
    ? Array.from(
        new Set(
          allProducts
            .filter((p) => p.category === categoriaAtual && p.apparel?.genero)
            .map((p) => p.apparel!.genero as string)
        )
      ).sort((a, b) => b.localeCompare(a))
    : [];
  const iconeGenero: Record<string, string> = { Masculino: "👕", Feminino: "👚" };

  // Sub-abas por tipo (ex.: Térmicos → Copos, Canecas, Garrafas).
  const ORDEM_TIPOS = ["Copos", "Canecas", "Garrafas"];
  const tipos = categoriaAtual
    ? Array.from(
        new Set(
          allProducts
            .filter((p) => p.category === categoriaAtual && p.subcategory)
            .map((p) => p.subcategory as string)
        )
      ).sort((a, b) => {
        const ia = ORDEM_TIPOS.indexOf(a);
        const ib = ORDEM_TIPOS.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
      })
    : [];
  const iconeTipo: Record<string, string> = { Copos: "🥤", Canecas: "☕", Garrafas: "🧉" };

  return (
    <div className="container section">
      {theme ? (
        <>
          <p className="hero-eyebrow" style={{ marginBottom: 4 }}>
            <Link href="/brindes-por-tema">Brindes por tema</Link>
          </p>
          <h2>
            <span aria-hidden="true">{theme.emoji} </span>
            {theme.nome}
          </h2>
          <p className="section-lede">{theme.descricao}</p>
        </>
      ) : (
        <h2>Produtos</h2>
      )}

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

      {generos.length > 0 && categoriaAtual && (
        <div className="subfilters" aria-label="Filtrar por modelo">
          <Link
            className={"subfilter" + (!searchParams.genero ? " is-active" : "")}
            href={"/produtos?categoria=" + encodeURIComponent(categoriaAtual)}
          >
            Todos
          </Link>
          {generos.map((g) => (
            <Link
              key={g}
              className={"subfilter" + (searchParams.genero === g ? " is-active" : "")}
              href={
                "/produtos?categoria=" + encodeURIComponent(categoriaAtual) + "&genero=" + encodeURIComponent(g)
              }
            >
              <span aria-hidden="true">{iconeGenero[g] ?? ""} </span>
              {g}
            </Link>
          ))}
        </div>
      )}

      {tipos.length > 0 && categoriaAtual && (
        <div className="subfilters" aria-label="Filtrar por tipo">
          <Link
            className={"subfilter" + (!searchParams.tipo ? " is-active" : "")}
            href={"/produtos?categoria=" + encodeURIComponent(categoriaAtual)}
          >
            Todos
          </Link>
          {tipos.map((t) => (
            <Link
              key={t}
              className={"subfilter" + (searchParams.tipo === t ? " is-active" : "")}
              href={"/produtos?categoria=" + encodeURIComponent(categoriaAtual) + "&tipo=" + encodeURIComponent(t)}
            >
              <span aria-hidden="true">{iconeTipo[t] ?? ""} </span>
              {t}
            </Link>
          ))}
        </div>
      )}

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
