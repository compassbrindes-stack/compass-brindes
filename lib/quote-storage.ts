"use client";

// Lista de orçamento guardada no navegador do visitante (localStorage).
// Simples de propósito: não há backend de carrinho neste momento.

export interface QuoteItem {
  productId: string;
  name: string;
  supplierName: string;
  slug: string;
  quantity: number;
}

const STORAGE_KEY = "compass-brindes-quote";

export function getQuoteItems(): QuoteItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QuoteItem[]) : [];
  } catch {
    return [];
  }
}

function saveQuoteItems(items: QuoteItem[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("compass-brindes-quote-updated"));
}

export function addQuoteItem(item: Omit<QuoteItem, "quantity">, quantity: number) {
  const items = getQuoteItems();
  const existing = items.find((i) => i.productId === item.productId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    items.push({ ...item, quantity });
  }
  saveQuoteItems(items);
}

export function updateQuoteItemQuantity(productId: string, quantity: number) {
  const items = getQuoteItems().map((i) => (i.productId === productId ? { ...i, quantity } : i));
  saveQuoteItems(items);
}

export function removeQuoteItem(productId: string) {
  const items = getQuoteItems().filter((i) => i.productId !== productId);
  saveQuoteItems(items);
}
