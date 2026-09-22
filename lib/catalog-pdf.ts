// Geração do catálogo em PDF com os produtos atuais do site.
// Layout inspirado em catálogos profissionais do setor de brindes: capa com
// logo, página de índice por categoria e páginas de produto com fotos
// grandes ao lado de um bloco de texto enxuto (código, nome, descrição).

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { Product } from "@/lib/types";
import { LOGO_DATA_URI } from "@/lib/logo";

const PAGE_WIDTH = 595.28; // A4 em pontos
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 48;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const TEXT_COL_WIDTH = 168; // largura do bloco de texto de cada produto
const COL_GAP = 22;
const IMAGE_MAX = 196; // lado máximo (quadrado) da foto do produto

const COLOR_PRIMARY_DARK = rgb(0x0b / 255, 0x44 / 255, 0x36 / 255); // verde escuro da marca
const COLOR_PRIMARY = rgb(0x16 / 255, 0xa3 / 255, 0x4a / 255); // verde da marca
const COLOR_TEXT = rgb(0.13, 0.15, 0.15);
const COLOR_MUTED = rgb(0.44, 0.46, 0.44);
const COLOR_LINE = rgb(0.85, 0.86, 0.82);
const COLOR_PAGE_BG_SOFT = rgb(0xf4 / 255, 0xf4 / 255, 0xed / 255);

// Paleta usada nos cartões da página de índice, alternada por categoria.
const INDEX_PALETTE = [
  rgb(0x0b / 255, 0x44 / 255, 0x36 / 255),
  rgb(0x16 / 255, 0xa3 / 255, 0x4a / 255),
  rgb(0x5c / 255, 0x6f / 255, 0x6a / 255),
  rgb(0xb9 / 255, 0x8a / 255, 0x3a / 255),
];

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

  // Logo — embutida localmente, sem depender de rede.
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

  const byCategory = new Map<string, Product[]>();
  for (const product of products) {
    const list = byCategory.get(product.category) ?? [];
    list.push(product);
    byCategory.set(product.category, list);
  }
  const categories = Array.from(byCategory.keys()).sort();

  let page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN_TOP;
  const pageCategoryLabel = new Map<PDFPage, string>();
  let currentCategoryLabel = "";

  function newPage() {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN_TOP;
    if (currentCategoryLabel) pageCategoryLabel.set(page, currentCategoryLabel);
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN_BOTTOM) {
      newPage();
    }
  }

  // ---------------------------------------------------------------------
  // Capa
  // ---------------------------------------------------------------------
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 220, width: PAGE_WIDTH, height: 220, color: COLOR_PRIMARY_DARK });
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

  // ---------------------------------------------------------------------
  // Índice por categoria
  // ---------------------------------------------------------------------
  newPage();
  page.drawText("ÍNDICE", { x: MARGIN_X, y, size: 20, font: fontBold, color: COLOR_PRIMARY_DARK });
  y -= 30;

  const INDEX_COLS = 2;
  const INDEX_GAP = 16;
  const indexCardWidth = (CONTENT_WIDTH - INDEX_GAP * (INDEX_COLS - 1)) / INDEX_COLS;
  const indexCardHeight = 64;

  for (let i = 0; i < categories.length; i++) {
    const col = i % INDEX_COLS;
    if (col === 0) ensureSpace(indexCardHeight + 14);

    const cardX = MARGIN_X + col * (indexCardWidth + INDEX_GAP);
    const cardTopY = y;
    const accent = INDEX_PALETTE[i % INDEX_PALETTE.length];
    const count = (byCategory.get(categories[i]) ?? []).length;

    page.drawRectangle({
      x: cardX,
      y: cardTopY - indexCardHeight,
      width: indexCardWidth,
      height: indexCardHeight,
      color: COLOR_PAGE_BG_SOFT,
    });
    page.drawRectangle({
      x: cardX,
      y: cardTopY - indexCardHeight,
      width: 4,
      height: indexCardHeight,
      color: accent,
    });

    const nameLines = wrapText(categories[i].toUpperCase(), fontBold, 10.5, indexCardWidth - 24).slice(0, 2);
    let ny = cardTopY - 18;
    for (const line of nameLines) {
      page.drawText(line, { x: cardX + 14, y: ny, size: 10.5, font: fontBold, color: accent });
      ny -= 13;
    }
    page.drawText(`${count} ${count === 1 ? "produto" : "produtos"}`, {
      x: cardX + 14,
      y: cardTopY - indexCardHeight + 12,
      size: 8.5,
      font: fontRegular,
      color: COLOR_MUTED,
    });

    if (col === INDEX_COLS - 1 || i === categories.length - 1) {
      y -= indexCardHeight + 14;
    }
  }

  newPage();

  // ---------------------------------------------------------------------
  // Páginas de produtos, por categoria
  // ---------------------------------------------------------------------
  for (const category of categories) {
    currentCategoryLabel = category;
    ensureSpace(44);
    if (!pageCategoryLabel.has(page)) pageCategoryLabel.set(page, currentCategoryLabel);

    page.drawText(category.toUpperCase(), {
      x: MARGIN_X,
      y,
      size: 15,
      font: fontBold,
      color: COLOR_PRIMARY_DARK,
    });
    y -= 6;
    page.drawLine({
      start: { x: MARGIN_X, y },
      end: { x: PAGE_WIDTH - MARGIN_X, y },
      thickness: 1.2,
      color: COLOR_PRIMARY,
    });
    y -= 26;

    const items = byCategory.get(category) ?? [];
    for (const product of items) {
      const productImage = imageByProduct.get(product);
      const photoColX = MARGIN_X + TEXT_COL_WIDTH + COL_GAP;
      const photoColWidth = PAGE_WIDTH - MARGIN_X - photoColX;

      const codigo = product.supplierCode ? product.supplierCode : product.supplierSku;
      const nameLines = wrapText(product.name, fontBold, 11, TEXT_COL_WIDTH).slice(0, 3);
      const descriptionLines = wrapText(
        cleanDescription(product.description).slice(0, 260),
        fontRegular,
        9,
        TEXT_COL_WIDTH
      ).slice(0, 6);

      const colorsText = product.variants
        .map((v) => v.color)
        .filter((c): c is string => Boolean(c))
        .join(", ");
      const colorLines = colorsText
        ? wrapText(`Cores: ${colorsText}`, fontItalic, 8.5, TEXT_COL_WIDTH).slice(0, 2)
        : [];

      const extraLines: string[] = [];
      if (product.material) extraLines.push(`Material: ${product.material}`);
      if (product.minQuantity) extraLines.push(`Qtd. mínima: ${product.minQuantity} un.`);

      const textBlockHeight =
        12 + // código
        nameLines.length * 13 +
        4 +
        descriptionLines.length * 11.5 +
        extraLines.length * 11.5 +
        colorLines.length * 11 +
        10;

      const photoDims = productImage ? scaledImageDims(productImage, IMAGE_MAX) : { width: 0, height: 0 };
      const blockHeight = Math.max(textBlockHeight, photoDims.height) + 24;
      ensureSpace(blockHeight);
      if (!pageCategoryLabel.has(page)) pageCategoryLabel.set(page, currentCategoryLabel);

      const blockTopY = y;

      // Código do produto
      page.drawText(codigo || "", {
        x: MARGIN_X,
        y,
        size: 8.5,
        font: fontBold,
        color: COLOR_PRIMARY,
      });
      y -= 14;

      for (const line of nameLines) {
        page.drawText(line, { x: MARGIN_X, y, size: 11, font: fontBold, color: COLOR_TEXT });
        y -= 13;
      }
      y -= 4;

      for (const line of descriptionLines) {
        page.drawText(line, { x: MARGIN_X, y, size: 9, font: fontRegular, color: COLOR_MUTED });
        y -= 11.5;
      }

      for (const line of extraLines) {
        page.drawText(line, { x: MARGIN_X, y, size: 9, font: fontRegular, color: COLOR_TEXT });
        y -= 11.5;
      }

      for (const line of colorLines) {
        page.drawText(line, { x: MARGIN_X, y, size: 8.5, font: fontItalic, color: COLOR_MUTED });
        y -= 11;
      }

      // Foto, alinhada à direita do bloco, com o topo no início do bloco.
      if (productImage) {
        const photoX = photoColX + Math.max(0, (photoColWidth - photoDims.width) / 2);
        const photoY = blockTopY - photoDims.height;
        page.drawImage(productImage, {
          x: photoX,
          y: photoY,
          width: photoDims.width,
          height: photoDims.height,
        });
      }

      y = blockTopY - blockHeight;

      page.drawLine({
        start: { x: MARGIN_X, y: y + 12 },
        end: { x: PAGE_WIDTH - MARGIN_X, y: y + 12 },
        thickness: 0.6,
        color: COLOR_LINE,
      });
    }

    y -= 10;
  }

  // ---------------------------------------------------------------------
  // Rodapé em todas as páginas (exceto a capa)
  // ---------------------------------------------------------------------
  const allPages = pdfDoc.getPages();
  for (let i = 1; i < allPages.length; i++) {
    const p = allPages[i];
    const label = pageCategoryLabel.get(p) ?? "";
    const pageNumber = `${i + 1}`;

    p.drawText(label.toUpperCase(), {
      x: MARGIN_X,
      y: 26,
      size: 7.5,
      font: fontRegular,
      color: COLOR_MUTED,
    });

    const rightText = `${pageNumber}`;
    const rightWidth = fontRegular.widthOfTextAtSize(rightText, 7.5);
    p.drawText(rightText, {
      x: PAGE_WIDTH - MARGIN_X - rightWidth,
      y: 26,
      size: 7.5,
      font: fontRegular,
      color: COLOR_MUTED,
    });

    p.drawText("Compass Brindes Corporativos · (49) 93618-0446 · @compassbrindes", {
      x: MARGIN_X,
      y: 14,
      size: 7,
      font: fontRegular,
      color: COLOR_MUTED,
    });
  }

  return pdfDoc.save();
}
