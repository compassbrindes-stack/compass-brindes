// Armazenamento de pedidos usando o banco de dados Redis (Upstash) conectado
// ao projeto na Vercel. Funciona apenas no servidor (rotas de API).

import { onlyDigits } from "@/lib/validators";
import type { QuoteItem } from "@/lib/quote-storage";

const PREFIXO_PEDIDO = "CB";
const CHAVE_CONTADOR = "compass:pedido:seq";
const NUMERO_INICIAL = 999; // primeiro pedido gerado será CB1000

export interface OrderCustomer {
  nome: string;
  sobrenome: string;
  cpfCnpj: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  cidade: string;
  estado: string;
  telefone: string;
}

export interface Order {
  orderNumber: string;
  createdAt: string;
  items: QuoteItem[];
  customer: OrderCustomer;
}

async function redisCommand<T = unknown>(command: (string | number)[]): Promise<T> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Banco de dados não configurado (KV_REST_API_URL / KV_REST_API_TOKEN ausentes)."
    );
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(String(data.error));
  }
  return data.result as T;
}

function clientKey(cpfCnpjDigits: string) {
  return `compass:cliente:${cpfCnpjDigits}:pedidos`;
}

function orderKey(orderNumber: string) {
  return `compass:pedido:${orderNumber}`;
}

async function nextOrderNumber(): Promise<string> {
  // Garante que o contador comece em 999 (só na primeira vez).
  await redisCommand(["SETNX", CHAVE_CONTADOR, NUMERO_INICIAL]);
  const n = await redisCommand<number>(["INCR", CHAVE_CONTADOR]);
  return `${PREFIXO_PEDIDO}${n}`;
}

export async function createOrder(
  items: QuoteItem[],
  customer: OrderCustomer
): Promise<Order> {
  const orderNumber = await nextOrderNumber();
  const order: Order = {
    orderNumber,
    createdAt: new Date().toISOString(),
    items,
    customer,
  };

  await redisCommand(["SET", orderKey(orderNumber), JSON.stringify(order)]);

  const doc = onlyDigits(customer.cpfCnpj);
  if (doc) {
    await redisCommand(["RPUSH", clientKey(doc), orderNumber]);
  }

  return order;
}

export async function getOrdersByDocument(cpfCnpj: string): Promise<Order[]> {
  const doc = onlyDigits(cpfCnpj);
  if (!doc) return [];

  const orderNumbers = await redisCommand<string[]>(["LRANGE", clientKey(doc), "0", "-1"]);
  if (!orderNumbers || orderNumbers.length === 0) return [];

  const orders: Order[] = [];
  for (const orderNumber of orderNumbers) {
    const raw = await redisCommand<string | null>(["GET", orderKey(orderNumber)]);
    if (raw) {
      try {
        orders.push(JSON.parse(raw) as Order);
      } catch {
        // ignora registros corrompidos
      }
    }
  }

  return orders.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
