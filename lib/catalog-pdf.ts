// Geração do catálogo em PDF com os produtos atuais do site.
// Layout enxuto, como catálogos profissionais do setor de brindes:
// cabeçalho compacto na 1ª página (logo + lista breve de categorias) e produtos
// em 3 colunas; categorias pequenas dividem a mesma linha.

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { Product } from "@/lib/types";
import { LOGO_DATA_URI } from "@/lib/logo";

const PAGE_WIDTH = 595.28; // A4 em pontos
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 34;
const MARGIN_TOP = 42;
const MARGIN_BOTTOM = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const PRODUCT_COLS = 3; // produtos lado a lado, na mesma linha (catálogo mais curto)
const PRODUCT_COL_GAP = 16;
const PRODUCT_COL_WIDTH = (CONTENT_WIDTH - PRODUCT_COL_GAP * (PRODUCT_COLS - 1)) / PRODUCT_COLS;
const CARD_IMAGE_MAX = 120; // lado máximo (quadrado) da foto, no topo do card
const ROW_GAP = 14; // espaço vertical entre uma linha de produtos e a próxima

const COLOR_PRIMARY_DARK = rgb(0x0b / 255, 0x44 / 255, 0x36 / 255); // verde escuro da marca
const COLOR_PRIMARY = rgb(0x16 / 255, 0xa3 / 255, 0x4a / 255); // verde da marca
const COLOR_TEXT = rgb(0.13, 0.15, 0.15);
const COLOR_MUTED = rgb(0.44, 0.46, 0.44);
const COLOR_LINE = rgb(0.85, 0.86, 0.82);

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

// Transforma caminhos relativos ("/produtos/x.jpg") em endereço completo.
function resolveImageUrl(url: string, siteUrl?: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = siteUrl || process.env.NEXT_PUBLIC_SITE_URL || "https://www.compassbrindes.com.br";
  return new URL(url, base).toString();
}

// Baixa os bytes de uma imagem com um limite de tempo, para não travar a
// geração do PDF caso algum fornecedor esteja lento ou fora do ar.
async function fetchImageBytes(url: string, timeoutMs = 10000): Promise<Uint8Array | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CompassCatalogo/1.0)" },
    });
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

interface ProductCell {
  product: Product;
  image: PDFImage | undefined;
  codigo: string;
  nameLines: string[];
  descriptionLines: string[];
  extraLines: string[];
  colorLines: string[];
  photoDims: { width: number; height: number };
  cellHeight: number;
}

// Monta o conteúdo (linhas de texto já quebradas e dimensões da foto) de um
// card de produto, para o layout de 3 produtos lado a lado.
function buildProductCell(
  product: Product,
  image: PDFImage | undefined,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  fontItalic: PDFFont
): ProductCell {
  const codigo = product.supplierCode ?? "";
  const nameLines = wrapText(product.name, fontBold, 9.5, PRODUCT_COL_WIDTH).slice(0, 2);
  const descriptionLines = wrapText(
    cleanDescription(product.description).slice(0, 200),
    fontRegular,
    7.5,
    PRODUCT_COL_WIDTH
  ).slice(0, 4);

  const colorsText = product.variants
    .map((v) => v.color)
    .filter((c): c is string => Boolean(c))
    .join(", ");
  const colorLines = colorsText
    ? wrapText(`Cores: ${colorsText}`, fontItalic, 7, PRODUCT_COL_WIDTH).slice(0, 2)
    : [];

  const extraLines: string[] = [];
  if (product.material) extraLines.push(`Material: ${product.material}`);
  if (product.sizes?.length)
    extraLines.push(`Tamanhos: ${product.sizes.map((s) => `${s.label} (${s.code})`).join(" · ")}`);
  if (product.minQuantity) extraLines.push(`Qtd. mínima: ${product.minQuantity} un.`);

  const photoDims = image ? scaledImageDims(image, CARD_IMAGE_MAX) : { width: 0, height: 0 };

  const textHeight =
    2 + // respiro entre a foto e o nome
    (codigo ? 12 : 0) + // linha do código, depois da descrição
    nameLines.length * 11 +
    2 +
    descriptionLines.length * 9.2 +
    extraLines.length * 9.2 +
    colorLines.length * 8.6 +
    4;

  // a foto ocupa sempre a mesma caixa quadrada: as linhas ficam alinhadas
  const cellHeight = (image ? CARD_IMAGE_MAX + 8 : 0) + textHeight;

  return { product, image, codigo, nameLines, descriptionLines, extraLines, colorLines, photoDims, cellHeight };
}

// `siteUrl` é o endereço do próprio site (ex.: https://www.compassbrindes.com.br).
// Ele é necessário para as fotos guardadas no site com caminho relativo
// (ex.: "/produtos/canivete-1.jpg"): sem o endereço completo o servidor não
// consegue baixá-las e o produto saía no PDF sem foto.
export async function buildCatalogPdf(products: Product[], siteUrl?: string): Promise<Uint8Array> {
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
    return fetchImageBytes(resolveImageUrl(url, siteUrl));
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
    // Produtos com sub-aba (ex.: Térmicos - Copos) ganham uma seção própria no PDF.
    const key = product.subcategory ? `${product.category} - ${product.subcategory}` : product.category;
    const list = byCategory.get(key) ?? [];
    list.push(product);
    byCategory.set(key, list);
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
  // Cabeçalho da 1ª página (faixa verde, logo, apresentação e lista breve
  // das categorias). Os produtos começam logo abaixo, na mesma página.
  // ---------------------------------------------------------------------
  const FAIXA = 92;
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - FAIXA, width: PAGE_WIDTH, height: FAIXA, color: COLOR_PRIMARY_DARK });
  page.drawText("COMPASS BRINDES CORPORATIVOS", { x: MARGIN_X, y: PAGE_HEIGHT - 32, size: 10, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Catálogo de Produtos", { x: MARGIN_X, y: PAGE_HEIGHT - 60, size: 22, font: fontBold, color: rgb(1, 1, 1) });
  const dataGeracao = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  page.drawText(`Gerado em ${dataGeracao} · ${products.length} produtos · (49) 93618-0446 · www.compassbrindes.com.br`, {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 78,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.85, 0.9, 0.88),
  });
  if (logoImage) {
    // logo num quadro branco à direita da faixa
    const logoHeight = 40;
    const logoWidth = (logoImage.width / logoImage.height) * logoHeight;
    const bx = PAGE_WIDTH - MARGIN_X - logoWidth - 16;
    page.drawRectangle({ x: bx, y: PAGE_HEIGHT - FAIXA / 2 - logoHeight / 2 - 8, width: logoWidth + 16, height: logoHeight + 16, color: rgb(1, 1, 1) });
    page.drawImage(logoImage, { x: bx + 8, y: PAGE_HEIGHT - FAIXA / 2 - logoHeight / 2, width: logoWidth, height: logoHeight });
  }

  y = PAGE_HEIGHT - FAIXA - 20;
  const introLines = wrapText(
    "Brindes corporativos para empresas que querem presentear com intenção. Produtos sujeitos a disponibilidade; " +
      "preços conforme quantidade e personalização — fale com a gente para um orçamento sob medida.",
    fontRegular,
    9,
    CONTENT_WIDTH
  );
  for (const line of introLines) {
    page.drawText(line, { x: MARGIN_X, y, size: 9, font: fontRegular, color: COLOR_TEXT });
    y -= 12;
  }

  // Categorias: lista breve em 4 colunas (o índice não é clicável)
  y -= 6;
  page.drawText("CATEGORIAS", { x: MARGIN_X, y, size: 9, font: fontBold, color: COLOR_PRIMARY_DARK });
  y -= 13;
  const IDX_COLS = 4;
  const idxW = CONTENT_WIDTH / IDX_COLS;
  const idxRows = Math.ceil(categories.length / IDX_COLS);
  for (let i = 0; i < categories.length; i++) {
    const col = Math.floor(i / idxRows);
    const row = i % idxRows;
    const count = (byCategory.get(categories[i]) ?? []).length;
    let nome = categories[i].replace("Kits Corporativos - ", "").replace(" - ", " · ");
    const cabe = (t: string) => fontRegular.widthOfTextAtSize(`${t} (${count})`, 7.8) <= idxW - 8;
    if (!cabe(nome)) { while (nome.length > 4 && !cabe(nome + "…")) nome = nome.slice(0, -1); nome += "…"; }
    page.drawText(`${nome} (${count})`, {
      x: MARGIN_X + col * idxW,
      y: y - row * 10.5,
      size: 7.8,
      font: fontRegular,
      color: COLOR_TEXT,
    });
  }
  y -= idxRows * 10.5 + 4;
  page.drawLine({ start: { x: MARGIN_X, y }, end: { x: PAGE_WIDTH - MARGIN_X, y }, thickness: 0.6, color: COLOR_LINE });
  y -= 22;

  // ---------------------------------------------------------------------
  // Páginas de produtos, por categoria
  // ---------------------------------------------------------------------
  // Desenha um card de produto (foto, nome, descrição, código, cores) com o topo em rowTopY.
  function drawCell(cell: ProductCell, cellX: number, rowTopY: number) {
    let cy = rowTopY;
    if (cell.image) {
      const photoX = cellX + Math.max(0, (PRODUCT_COL_WIDTH - cell.photoDims.width) / 2);
      const photoY = cy - CARD_IMAGE_MAX + (CARD_IMAGE_MAX - cell.photoDims.height) / 2;
      page.drawImage(cell.image, {
        x: photoX,
        y: photoY,
        width: cell.photoDims.width,
        height: cell.photoDims.height,
      });
      cy -= CARD_IMAGE_MAX + 8;
    }

    cy -= 2; // respiro entre a foto e o nome

    for (const line of cell.nameLines) {
      page.drawText(line, { x: cellX, y: cy, size: 9.5, font: fontBold, color: COLOR_TEXT });
      cy -= 11;
    }
    cy -= 2;

    for (const line of cell.descriptionLines) {
      page.drawText(line, { x: cellX, y: cy, size: 7.5, font: fontRegular, color: COLOR_MUTED });
      cy -= 9.2;
    }

    // Código Compass (ex.: C043B620) logo depois da descrição, só quando
    // o produto tem um.
    if (cell.codigo) {
      cy -= 2;
      page.drawText(`Código: ${cell.codigo}`, {
        x: cellX,
        y: cy,
        size: 7.5,
        font: fontBold,
        color: COLOR_PRIMARY,
      });
      cy -= 10;
    }

    for (const line of cell.extraLines) {
      page.drawText(line, { x: cellX, y: cy, size: 7.5, font: fontRegular, color: COLOR_TEXT });
      cy -= 9.2;
    }

    for (const line of cell.colorLines) {
      page.drawText(line, { x: cellX, y: cy, size: 7, font: fontItalic, color: COLOR_MUTED });
      cy -= 8.6;
    }
  }

  // Categorias pequenas (1 ou 2 produtos) dividem a mesma linha, cada uma com
  // seu título em cima das suas colunas, para não sobrar espaço em branco.
  const pequenas = (c: string) => (byCategory.get(c) ?? []).length < PRODUCT_COLS;
  const secoes: string[][] = [];
  for (const c of categories) {
    const ult = secoes[secoes.length - 1];
    const total = ult ? ult.reduce((n, x) => n + (byCategory.get(x) ?? []).length, 0) : 0;
    if (ult && pequenas(c) && ult.every(pequenas) && total + (byCategory.get(c) ?? []).length <= PRODUCT_COLS) ult.push(c);
    else secoes.push([c]);
  }

  function desenharCompartilhada(secao: string[]) {
    // linha compartilhada
    currentCategoryLabel = secao.join(" · ");
    const segs = secao.map((c) => (byCategory.get(c) ?? []).map((pr) => buildProductCell(pr, imageByProduct.get(pr), fontRegular, fontBold, fontItalic)));
    const rowHeight = Math.max(...segs.flat().map((c) => c.cellHeight));
    ensureSpace(30 + rowHeight + ROW_GAP);
    if (!pageCategoryLabel.has(page)) pageCategoryLabel.set(page, currentCategoryLabel);
    let col = 0;
    const yTitulo = y;
    segs.forEach((cells, k) => {
      const x0 = MARGIN_X + col * (PRODUCT_COL_WIDTH + PRODUCT_COL_GAP);
      const w = cells.length * PRODUCT_COL_WIDTH + (cells.length - 1) * PRODUCT_COL_GAP;
      let titulo = secao[k].toUpperCase();
      while (titulo.length > 4 && fontBold.widthOfTextAtSize(titulo, 11) > w) titulo = titulo.slice(0, -1);
      page.drawText(titulo, { x: x0, y: yTitulo, size: 11, font: fontBold, color: COLOR_PRIMARY_DARK });
      page.drawLine({ start: { x: x0, y: yTitulo - 5 }, end: { x: x0 + w, y: yTitulo - 5 }, thickness: 1.2, color: COLOR_PRIMARY });
      cells.forEach((cell, j) => drawCell(cell, MARGIN_X + (col + j) * (PRODUCT_COL_WIDTH + PRODUCT_COL_GAP), yTitulo - 22));
      col += cells.length;
    });
    y = yTitulo - 22 - rowHeight - ROW_GAP;
    page.drawLine({ start: { x: MARGIN_X, y: y + ROW_GAP / 2 }, end: { x: PAGE_WIDTH - MARGIN_X, y: y + ROW_GAP / 2 }, thickness: 0.6, color: COLOR_LINE });
    y -= 6;
  }

  for (const secao of secoes) {
    if (secao.length > 1) { desenharCompartilhada(secao); continue; }
    const category = secao[0];
    currentCategoryLabel = category;
    const itemsCat = byCategory.get(category) ?? [];
    const primeiraLinha = itemsCat
      .slice(0, PRODUCT_COLS)
      .map((pr) => buildProductCell(pr, imageByProduct.get(pr), fontRegular, fontBold, fontItalic).cellHeight);
    ensureSpace(34 + Math.max(0, ...primeiraLinha) + ROW_GAP); // título não fica sozinho no fim da página
    if (!pageCategoryLabel.has(page)) pageCategoryLabel.set(page, currentCategoryLabel);

    page.drawText(category.toUpperCase(), {
      x: MARGIN_X,
      y,
      size: 13,
      font: fontBold,
      color: COLOR_PRIMARY_DARK,
    });
    y -= 5;
    page.drawLine({
      start: { x: MARGIN_X, y },
      end: { x: PAGE_WIDTH - MARGIN_X, y },
      thickness: 1.2,
      color: COLOR_PRIMARY,
    });
    y -= 18;

    const items = byCategory.get(category) ?? [];
    for (let i = 0; i < items.length; i += PRODUCT_COLS) {
      const rowProducts = items.slice(i, i + PRODUCT_COLS);
      const cells = rowProducts.map((product) =>
        buildProductCell(product, imageByProduct.get(product), fontRegular, fontBold, fontItalic)
      );
      const rowHeight = Math.max(...cells.map((c) => c.cellHeight));
      ensureSpace(rowHeight + ROW_GAP);
      if (!pageCategoryLabel.has(page)) pageCategoryLabel.set(page, currentCategoryLabel);

      const rowTopY = y;

      cells.forEach((cell, col) => drawCell(cell, MARGIN_X + col * (PRODUCT_COL_WIDTH + PRODUCT_COL_GAP), rowTopY));

      y = rowTopY - rowHeight - ROW_GAP;

      page.drawLine({
        start: { x: MARGIN_X, y: y + ROW_GAP / 2 },
        end: { x: PAGE_WIDTH - MARGIN_X, y: y + ROW_GAP / 2 },
        thickness: 0.6,
        color: COLOR_LINE,
      });
    }

    y -= 6;
  }

  // ---------------------------------------------------------------------
  // Rodapé em todas as páginas
  // ---------------------------------------------------------------------
  const allPages = pdfDoc.getPages();
  for (let i = 0; i < allPages.length; i++) {
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
