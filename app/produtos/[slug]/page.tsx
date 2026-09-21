import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/products";
import { AddToQuote } from "@/components/add-to-quote";
import { ProductGallery } from "@/components/product-gallery";

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

        {product.variants.some((v) => v.color) && (
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

        <AddToQuote
          productId={product.id}
          name={product.name}
          supplierName={product.supplierName}
          slug={product.slug}
          minQuantity={product.minQuantity}
        />
      </div>
    </div>
  );
}
