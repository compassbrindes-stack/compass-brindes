// Proteção simples para páginas/rotas internas de administração (ex.: lista
// de leads do catálogo). Compara uma chave (enviada por query string ?key=
// ou cabeçalho Authorization: Bearer) com o valor configurado em
// LEADS_ADMIN_SECRET nas variáveis de ambiente do Vercel.
//
// Não é um sistema de login completo — é o mesmo nível de proteção já usado
// em /api/sync (SYNC_SECRET), pensado para uso interno da equipe da Compass.

export function isAdminAuthorized(key: string | null | undefined): boolean {
  const secret = process.env.LEADS_ADMIN_SECRET;

  // Se o segredo não estiver configurado, a área fica bloqueada por padrão
  // (mais seguro do que liberar acesso por engano).
  if (!secret) return false;

  return key === secret;
}
