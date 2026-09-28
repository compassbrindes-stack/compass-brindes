import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/products";
import { AddToQuote } from "@/components/add-to-quote";
import { ProductGallery } from "@/components/product-gallery";
import { ApparelOptions } from "@/components/apparel-options";

export const revalidate = 0;

export default async function ProdutoPage({ params }: { params: { slug: string } }) {
  const product = await getProductBySlug(params.slug);
  if (!product) notFound();

  return (
    <div className="container product-detail">
      <div>
        <ProductGallery images={product.images} alt={product.name} />
      </div>
      <div>
        <span className="badge">{product.supplierName}</span>
        <h1>{product.name}</h1>
        {product.supplierCode && (
          <p style={{ fontSize: 13, color: "var(--color-dark-2, #4a5c60)", margin: "4px 0 0" }}>
            Código do fornecedor: {product.supplierCode}
          </p>
        )}
        <p>{product.description}</p>

        {!product.apparel && product.variants.some((v) => v.color) && (
          <div className="variant-swatches">
            {product.variants.map((v) => (
              <span key={v.sku} className="variant-swatch">
                {v.color}
              </span>
            ))}
          </div>
        )}

        <p>
          {product.priceFrom
            ? `A partir de ${product.priceFrom.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}`
            : "Preço sob consulta"}
          {product.minQuantity ? ` · pedido mínimo de ${product.minQuantity} unidades` : ""}
        </p>

        {product.apparel ? (
          <ApparelOptions
            productId={product.id}
            name={product.name}
            supplierName={product.supplierName}
            productSlug={product.slug}
            apparel={product.apparel}
          />
        ) : (
          <AddToQuote
            productId={product.id}
            name={product.name}
            supplierName={product.supplierName}
            slug={product.slug}
            minQuantity={product.minQuantity}
          />
        )}

        {product.apparel?.sizeChart && (
          <div className="size-chart">
            <h2>Tabela de medidas{product.apparel.tipo ? " — " + product.apparel.tipo : ""}</h2>
            <div className="size-chart__scroll">
              <table>
                <thead>
                  <tr>
                    <th>Tamanho</th>
                    {product.apparel.sizeChart.columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {product.apparel.sizeChart.rows.map((r) => (
                    <tr key={r.size}>
                      <th scope="row">{r.size}</th>
                      {r.values.map((v, i) => (
                        <td key={i}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {product.apparel.sizeChart.note && (
              <p className="size-chart__note">{product.apparel.sizeChart.note}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
