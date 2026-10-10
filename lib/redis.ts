// Acesso simples ao Redis (Upstash) ligado ao projeto na Vercel.
// Só funciona no servidor (rotas de API).

export async function redis<T = unknown>(command: (string | number)[]): Promise<T> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("Banco de dados não configurado (KV_REST_API_URL / KV_REST_API_TOKEN ausentes).");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const data = await res.json();
  if (data.error) throw new Error(String(data.error));
  return data.result as T;
}

export async function redisGetJSON<T>(key: string): Promise<T | null> {
  const raw = await redis<string | null>(["GET", key]);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function redisSetJSON(key: string, value: unknown, ttlSeconds?: number) {
  const cmd: (string | number)[] = ["SET", key, JSON.stringify(value)];
  if (ttlSeconds) cmd.push("EX", ttlSeconds);
  await redis(cmd);
}
