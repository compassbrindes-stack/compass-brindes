// Consulta de CNPJ (dados públicos): razão social, situação, endereço e inscrições estaduais (IE).
// 1º CNPJá aberto (traz as IEs do Cadastro Centralizado de Contribuintes), 2º BrasilAPI (Receita, sem IE).
export interface DadosCnpj {
  cnpj: string;
  razao: string;
  fantasia: string;
  situacao: string;
  abertura: string;
  atividade: string;
  email: string;
  telefone: string;
  endereco: { rua: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string; cep: string };
  ies: { numero: string; uf: string; ativa: boolean; situacao: string; tipo: string }[];
  fonte: string;
}

const so = (s: any) => String(s ?? "").replace(/\D/g, "");

async function cnpja(cnpj: string): Promise<DadosCnpj | null> {
  const r = await fetch(`https://open.cnpja.com/office/${cnpj}`, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!r.ok) return null;
  const j: any = await r.json();
  const a = j.address || {};
  const tel = (j.phones || [])[0];
  return {
    cnpj,
    razao: j.company?.name || "",
    fantasia: j.alias || "",
    situacao: j.status?.text || "",
    abertura: j.founded || "",
    atividade: j.mainActivity?.text || "",
    email: (j.emails || [])[0]?.address || "",
    telefone: tel ? `${tel.area || ""}${tel.number || ""}` : "",
    endereco: { rua: a.street || "", numero: a.number || "", complemento: a.details || "", bairro: a.district || "", cidade: a.city || "", uf: a.state || "", cep: so(a.zip) },
    ies: (j.registrations || []).map((x: any) => ({ numero: so(x.number), uf: x.state || "", ativa: !!x.enabled, situacao: x.status?.text || "", tipo: x.type?.text || "" })),
    fonte: "CNPJá (Receita + cadastro de contribuintes)",
  };
}

async function brasilapi(cnpj: string): Promise<DadosCnpj | null> {
  const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { cache: "no-store" });
  if (!r.ok) return null;
  const j: any = await r.json();
  return {
    cnpj,
    razao: j.razao_social || "",
    fantasia: j.nome_fantasia || "",
    situacao: j.descricao_situacao_cadastral || "",
    abertura: j.data_inicio_atividade || "",
    atividade: j.cnae_fiscal_descricao || "",
    email: j.email || "",
    telefone: so(j.ddd_telefone_1),
    endereco: { rua: [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(" "), numero: j.numero || "", complemento: j.complemento || "", bairro: j.bairro || "", cidade: j.municipio || "", uf: j.uf || "", cep: so(j.cep) },
    ies: [],
    fonte: "BrasilAPI (Receita Federal; sem inscrição estadual)",
  };
}

export async function consultarCnpj(doc: string): Promise<DadosCnpj> {
  const cnpj = so(doc);
  if (cnpj.length !== 14) throw new Error("CNPJ precisa ter 14 números");
  let d: DadosCnpj | null = null;
  try { d = await cnpja(cnpj); } catch { d = null; }
  if (!d || !d.razao) { try { d = await brasilapi(cnpj); } catch { d = null; } }
  if (!d) throw new Error("não encontrei esse CNPJ nas consultas públicas");
  return d;
}
