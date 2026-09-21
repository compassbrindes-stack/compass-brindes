import { NextResponse } from "next/server";
import { getAllProducts } from "@/lib/products";
import { buildCatalogPdf } from "@/lib/catalog-pdf";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = await getAllProducts();
    const pdfBytes = await buildCatalogPdf(products);

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="catalogo-compass-brindes.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Erro ao gerar catálogo em PDF:", error);
    return NextResponse.json(
      { error: "Não foi possível gerar o catálogo agora. Tente novamente em instantes." },
      { status: 500 }
    );
  }
}
