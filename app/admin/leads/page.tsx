import { isAdminAuthorized } from "@/lib/admin-auth";
import { listCatalogLeads } from "@/lib/catalog-leads";

export const dynamic = "force-dynamic";

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const key = searchParams.key ?? "";
  const autorizado = isAdminAuthorized(key);

  if (!autorizado) {
    return (
      <div className="container section" style={{ maxWidth: 420 }}>
        <h2>Área restrita</h2>
        <p className="section-lede">
          Informe a chave de acesso para ver os cadastros de quem baixou o catálogo.
        </p>
        <form method="get" style={{ marginTop: 20 }}>
          <div className="form-field">
            <label htmlFor="key">Chave de acesso</label>
            <input id="key" name="key" type="password" autoFocus />
          </div>
          <button className="btn btn-primary" type="submit" style={{ marginTop: 8 }}>
            Entrar
          </button>
        </form>
        {key && (
          <p className="form-error" style={{ marginTop: 12 }}>
            Chave incorreta.
          </p>
        )}
      </div>
    );
  }

  const leads = await listCatalogLeads();

  return (
    <div className="container section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2>Leads do catálogo</h2>
          <p className="section-lede">
            {leads.length} {leads.length === 1 ? "pessoa baixou" : "pessoas baixaram"} o catálogo até
            agora.
          </p>
        </div>
        <a
          className="btn btn-outline"
          href={`/api/catalogo-leads/export?key=${encodeURIComponent(key)}`}
        >
          Exportar CSV
        </a>
      </div>

      <div style={{ overflowX: "auto", marginTop: 24 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid var(--color-border, #ddd)" }}>
              <th style={{ padding: "8px 12px" }}>Data</th>
              <th style={{ padding: "8px 12px" }}>Nome</th>
              <th style={{ padding: "8px 12px" }}>Empresa</th>
              <th style={{ padding: "8px 12px" }}>E-mail</th>
              <th style={{ padding: "8px 12px" }}>Telefone</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} style={{ borderBottom: "1px solid var(--color-border, #eee)" }}>
                <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                  {formatarData(lead.createdAt)}
                </td>
                <td style={{ padding: "8px 12px" }}>
                  {lead.nome} {lead.sobrenome}
                </td>
                <td style={{ padding: "8px 12px" }}>{lead.empresa}</td>
                <td style={{ padding: "8px 12px" }}>{lead.email}</td>
                <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{lead.telefone}</td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "16px 12px", color: "var(--color-muted, #777)" }}>
                  Ainda ninguém baixou o catálogo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
