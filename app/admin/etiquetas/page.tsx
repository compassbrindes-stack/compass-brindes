import { isAdminAuthorized } from "@/lib/admin-auth";
import EtiquetasCliente from "./etiquetas-cliente";

export const dynamic = "force-dynamic";
export const metadata = { title: "Etiquetas de volume · Compass", robots: { index: false, follow: false } };

export default function EtiquetasPage({ searchParams }: { searchParams: { key?: string } }) {
  const key = searchParams.key ?? "";
  if (!isAdminAuthorized(key)) {
    return (
      <div className="container section" style={{ maxWidth: 420 }}>
        <h2>Etiquetas de volume</h2>
        <p className="section-lede">Área restrita. Informe a chave de acesso (a mesma da lista de leads).</p>
        <form method="get" style={{ marginTop: 20 }}>
          <div className="form-field">
            <label htmlFor="key">Chave de acesso</label>
            <input id="key" name="key" type="password" autoFocus />
          </div>
          <button className="btn btn-primary" type="submit" style={{ marginTop: 8 }}>Entrar</button>
        </form>
        {key && <p className="form-error" style={{ marginTop: 12 }}>Chave incorreta.</p>}
      </div>
    );
  }
  return <EtiquetasCliente chave={key} />;
}
