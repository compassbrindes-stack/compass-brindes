// Geração do catálogo em PDF com os produtos atuais do site.
// Usa pdf-lib (sem dependências externas de imagem) para montar um PDF
// somente de texto, organizado por categoria — rápido e confiável mesmo
// com muitos produtos.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { Product } from "@/lib/types";

const PAGE_WIDTH = 595.28; // A4 em pontos
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 48;
const MARGIN_BOTTOM = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

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

export async function buildCatalogPdf(products: Product[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle("Catálogo Compass Brindes Corporativos");
  pdfDoc.setAuthor("Compass Brindes Corporativos");
  pdfDoc.setSubject("Catálogo de produtos para brindes corporativos");

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

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
      const descriptionLines = wrapText(
        cleanDescription(product.description).slice(0, 320),
        fontRegular,
        9.5,
        CONTENT_WIDTH
      ).slice(0, 4);

      const colorsText = product.variants
        .map((v) => v.color)
        .filter((c): c is string => Boolean(c))
        .join(", ");

      const blockHeight = 16 + descriptionLines.length * 13 + (colorsText ? 13 : 0) + 14;
      ensureSpace(blockHeight);

      page.drawText(product.name, {
        x: MARGIN_X,
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
        page.drawText(line, { x: MARGIN_X, y, size: 9.5, font: fontRegular, color: COLOR_TEXT });
        y -= 13;
      }

      if (colorsText) {
        page.drawText(`Cores disponíveis: ${colorsText}`, {
          x: MARGIN_X,
          y,
          size: 9,
          font: fontItalic,
          color: COLOR_MUTED,
        });
        y -= 13;
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
