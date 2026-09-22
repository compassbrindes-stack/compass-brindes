// Geração do catálogo em PDF com os produtos atuais do site.
// Usa pdf-lib para montar o PDF, com a logo na capa e a foto de cada
// produto ao lado da sua descrição (quando a imagem está disponível).

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { Product } from "@/lib/types";
import { LOGO_DATA_URI } from "@/lib/logo";

const PAGE_WIDTH = 595.28; // A4 em pontos
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 48;
const MARGIN_BOTTOM = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const IMAGE_SIZE = 58; // caixa (quadrada) reservada para a foto do produto
const IMAGE_GAP = 12; // espaço entre a foto e o texto

const COLOR_DARK = rgb(0x10 / 255, 0x2b / 255, 0x32 / 255);
const COLOR_ACCENT = rgb(0x3d / 255, 0x6b / 255, 0x5c / 255);
const COLOR_TEXT = rgb(0.15, 0.15, 0.15);
const COLOR_MUTED = rgb(0.42, 0.42, 0.42);
const COLOR_LINE = rgb(0.85, 0.85, 0.85);

function cleanDescription(description?: string): string {
  if (!description) return "";
  return description.replace(/^Descrição:\s*/i, "").trim();
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function base64ToBytes(dataUri: string): Uint8Array {
  const base64 = dataUri.includes(",") ? dataUri.split(",")[1] : dataUri;
  return new Uint8Array(Buffer.from(base64, "base64"));
}

// Baixa os bytes de uma imagem com um limite de tempo, para não travar a
// geração do PDF caso algum fornecedor esteja lento ou fora do ar.
async function fetchImageBytes(url: string, timeoutMs = 6000): Promise<Uint8Array | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

// Baixa várias imagens em paralelo, com um limite de conexões simultâneas.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function scaledImageDims(img: PDFImage, maxSize: number): { width: number; height: number } {
  const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
  return { width: img.width * ratio, height: img.height * ratio };
}

export async function buildCatalogPdf(products: Product[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle("Catálogo Compass Brindes Corporativos");
  pdfDoc.setAuthor("Compass Brindes Corporativos");
  pdfDoc.setSubject("Catálogo de produtos para brindes corporativos");

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Logo (usada na capa) — embutida localmente, sem depender de rede.
  let logoImage: PDFImage | null = null;
  try {
    logoImage = await pdfDoc.embedPng(base64ToBytes(LOGO_DATA_URI));
  } catch {
    logoImage = null;
  }

  // Baixa em paralelo a primeira foto de cada produto (quando existir).
  const imageUrls = products.map((p) => p.images?.[0]);
  const imageBytesList = await mapWithConcurrency(imageUrls, 8, async (url) => {
    if (!url) return null;
    return fetchImageBytes(url);
  });

  const imageByProduct = new Map<Product, PDFImage>();
  for (let i = 0; i < products.length; i++) {
    const bytes = imageBytesList[i];
    if (!bytes) continue;
    try {
      const img = await pdfDoc.embedJpg(bytes);
      imageByProduct.set(products[i], img);
    } catch {
      try {
        const img = await pdfDoc.embedPng(bytes);
        imageByProduct.set(products[i], img);
      } catch {
        // Formato não suportado ou imagem corrompida: segue sem foto.
      }
    }
  }

  let page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN_X;

  function newPage() {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN_X;
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN_BOTTOM) {
      newPage();
    }
  }

  function drawFooter() {
    page.drawText(
      "Compass Brindes Corporativos  ·  (49) 93618-0446  ·  @compassbrindes  ·  Todos os itens sob consulta",
      {
        x: MARGIN_X,
        y: 28,
        size: 8,
        font: fontRegular,
        color: COLOR_MUTED,
      }
    );
  }

  // Capa
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 220, width: PAGE_WIDTH, height: 220, color: COLOR_DARK });
  page.drawText("COMPASS BRINDES CORPORATIVOS", {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 110,
    size: 14,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Catálogo de Produtos", {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 150,
    size: 30,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  const dataGeracao = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  page.drawText(`Gerado em ${dataGeracao} · ${products.length} produtos`, {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 180,
    size: 11,
    font: fontRegular,
    color: rgb(0.85, 0.9, 0.88),
  });

  y = PAGE_HEIGHT - 260;

  // Logo, bem-visível sobre o fundo branco, acima do texto de apresentação.
  if (logoImage) {
    const logoHeight = 36;
    const logoWidth = (logoImage.width / logoImage.height) * logoHeight;
    page.drawImage(logoImage, {
      x: MARGIN_X,
      y: y - logoHeight,
      width: logoWidth,
      height: logoHeight,
    });
    y -= logoHeight + 20;
  }

  const introLines = wrapText(
    "Curadoria de brindes corporativos para empresas que querem presentear com intenção. " +
      "Todos os produtos deste catálogo estão sujeitos a disponibilidade e os preços variam " +
      "conforme quantidade e personalização — fale com a gente para um orçamento sob medida.",
    fontRegular,
    11,
    CONTENT_WIDTH
  );
  for (const line of introLines) {
    page.drawText(line, { x: MARGIN_X, y, size: 11, font: fontRegular, color: COLOR_TEXT });
    y -= 16;
  }

  newPage();

  const byCategory = new Map<string, Product[]>();
  for (const product of products) {
    const list = byCategory.get(product.category) ?? [];
    list.push(product);
    byCategory.set(product.category, list);
  }
  const categories = Array.from(byCategory.keys()).sort();

  for (const category of categories) {
    ensureSpace(40);
    page.drawText(category.toUpperCase(), {
      x: MARGIN_X,
      y,
      size: 16,
      font: fontBold,
      color: COLOR_ACCENT,
    });
    y -= 6;
    page.drawLine({
      start: { x: MARGIN_X, y },
      end: { x: PAGE_WIDTH - MARGIN_X, y },
      thickness: 1,
      color: COLOR_LINE,
    });
    y -= 22;

    const items = byCategory.get(category) ?? [];
    for (const product of items) {
      const productImage = imageByProduct.get(product);
      const textX = productImage ? MARGIN_X + IMAGE_SIZE + IMAGE_GAP : MARGIN_X;
      const textMaxWidth = productImage
        ? CONTENT_WIDTH - IMAGE_SIZE - IMAGE_GAP
        : CONTENT_WIDTH;

      const descriptionLines = wrapText(
        cleanDescription(product.description).slice(0, 320),
        fontRegular,
        9.5,
        textMaxWidth
      ).slice(0, 4);

      const colorsText = product.variants
        .map((v) => v.color)
        .filter((c): c is string => Boolean(c))
        .join(", ");

      const textBlockHeight = 16 + descriptionLines.length * 13 + (colorsText ? 13 : 0) + 14;
      const blockHeight = productImage
        ? Math.max(textBlockHeight, IMAGE_SIZE + 14)
        : textBlockHeight;
      ensureSpace(blockHeight);

      const blockTopY = y;

      if (productImage) {
        const dims = scaledImageDims(productImage, IMAGE_SIZE);
        page.drawImage(productImage, {
          x: MARGIN_X,
          y: blockTopY - dims.height,
          width: dims.width,
          height: dims.height,
        });
      }

      page.drawText(product.name, {
        x: textX,
        y,
        size: 11.5,
        font: fontBold,
        color: COLOR_TEXT,
      });

      const codigo = product.supplierCode ? `Cód. ${product.supplierCode}` : product.supplierSku;
      const codigoWidth = fontRegular.widthOfTextAtSize(codigo, 9);
      page.drawText(codigo, {
        x: PAGE_WIDTH - MARGIN_X - codigoWidth,
        y: y + 1,
        size: 9,
        font: fontItalic,
        color: COLOR_MUTED,
      });
      y -= 16;

      for (const line of descriptionLines) {
        page.drawText(line, { x: textX, y, size: 9.5, font: fontRegular, color: COLOR_TEXT });
        y -= 13;
      }

      if (colorsText) {
        page.drawText(`Cores disponíveis: ${colorsText}`, {
          x: textX,
          y,
          size: 9,
          font: fontItalic,
          color: COLOR_MUTED,
        });
        y -= 13;
      }

      if (productImage) {
        const dims = scaledImageDims(productImage, IMAGE_SIZE);
        y = Math.min(y, blockTopY - dims.height);
      }

      y -= 14;
    }

    y -= 6;
  }

  for (const p of pdfDoc.getPages()) {
    page = p;
    drawFooter();
  }

  return pdfDoc.save();
}
