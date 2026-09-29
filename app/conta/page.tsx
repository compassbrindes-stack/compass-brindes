"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CONTA_EVENT,
  buscarCliente,
  contaConfigurada,
  criarConta,
  entrar,
  lerRetornoDoEmail,
  listarOrcamentos,
  pedirNovaSenha,
  sair,
  salvarCliente,
  sessaoAtual,
  trocarSenha,
  type Cliente,
  type OrcamentoSalvo,
} from "@/lib/conta";
import { fetchAddressByCep, formatCEP, formatCpfCnpj, isValidCpfCnpj, onlyDigits } from "@/lib/validators";

type Aba = "entrar" | "criar" | "esqueci";

export default function ContaPage() {
  const [pronto, setPronto] = useState(false);
  const [logado, setLogado] = useState(false);
  const [recuperacao, setRecuperacao] = useState(false);

  useEffect(() => {
    const retorno = lerRetornoDoEmail();
    if (retorno === "recuperacao") setRecuperacao(true);
    const atualizar = () => setLogado(Boolean(sessaoAtual()));
    atualizar();
    setPronto(true);
    window.addEventListener(CONTA_EVENT, atualizar);
    return () => window.removeEventListener(CONTA_EVENT, atualizar);
  }, []);

  if (!pronto) return <div className="container section" />;

  if (!contaConfigurada()) {
    return (
      <div className="container section conta">
        <h2>Minha conta</h2>
        <p className="section-lede">A área de clientes estará disponível em breve.</p>
        <Link className="btn btn-primary" href="/produtos">
          Ver produtos
        </Link>
      </div>
    );
  }

  return (
    <div className="container section conta">
      {logado ? (
        <>
          {recuperacao && <NovaSenha onPronto={() => setRecuperacao(false)} />}
          <MinhaConta />
        </>
      ) : (
        <Acesso />
      )}
    </div>
  );
}

// ---------- Entrar / Criar conta ----------

function Acesso() {
  const [aba, setAba] = useState<Aba>("entrar");

  return (
    <div className="conta__acesso">
      <div className="conta__intro">
        <p className="hero-eyebrow">Área do cliente</p>
        <h2>Sua conta na Compass</h2>
        <p>
          O cadastro é opcional: você pode navegar e pedir orçamentos sem conta. Com a conta, seus
          dados ficam guardados, o orçamento já vem preenchido e você acompanha seus pedidos.
        </p>
        <ul className="conta__beneficios">
          <li>Orçamento preenchido automaticamente</li>
          <li>Histórico dos seus orçamentos</li>
          <li>Dados da empresa sempre atualizados</li>
        </ul>
      </div>

      <div className="conta__card">
        <div className="conta__abas" role="tablist">
          <button role="tab" aria-selected={aba === "entrar"} className={aba === "entrar" ? "is-active" : ""} onClick={() => setAba("entrar")}>
            Entrar
          </button>
          <button role="tab" aria-selected={aba === "criar"} className={aba === "criar" ? "is-active" : ""} onClick={() => setAba("criar")}>
            Criar conta
          </button>
        </div>
        {aba === "entrar" && <FormEntrar onEsqueci={() => setAba("esqueci")} />}
        {aba === "criar" && <FormCriar />}
        {aba === "esqueci" && <FormEsqueci onVoltar={() => setAba("entrar")} />}
      </div>
    </div>
  );
}

function FormEntrar({ onEsqueci }: { onEsqueci: () => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const r = await entrar(email.trim(), senha);
    if ("erro" in r) setErro(r.erro ?? null);
    setEnviando(false);
  }

  return (
    <form onSubmit={enviar}>
      <div className="form-field">
        <label htmlFor="login-email">E-mail</label>
        <input id="login-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="form-field">
        <label htmlFor="login-senha">Senha</label>
        <input id="login-senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
      </div>
      {erro && <p className="form-error">{erro}</p>}
      <button className="btn btn-primary conta__submit" disabled={enviando}>
        {enviando ? "Entrando..." : "Entrar"}
      </button>
      <button type="button" className="conta__link" onClick={onEsqueci}>
        Esqueci minha senha
      </button>
    </form>
  );
}

function FormCriar() {
  const [nome, setNome] = useState("");
  const [sobrenome, setSobrenome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [lgpd, setLgpd] = useState(false);
  const [novidades, setNovidades] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    if (senha !== senha2) return setErro("As senhas não conferem.");
    if (cnpj.trim() && !isValidCpfCnpj(cnpj)) return setErro("CPF ou CNPJ inválido. Confira os números.");
    if (!lgpd) return setErro("Para criar a conta, é preciso aceitar a Política de Privacidade.");
    setEnviando(true);
    const r = await criarConta(email.trim(), senha, {
      nome: nome.trim(),
      sobrenome: sobrenome.trim(),
      empresa: empresa.trim(),
      cnpj: cnpj.trim(),
      telefone: telefone.trim(),
      consentimento_lgpd: true,
      aceita_novidades: novidades,
    });
    setEnviando(false);
    if ("erro" in r) setErro(r.erro ?? null);
    else if ("confirmarEmail" in r) setAviso("Conta criada! Enviamos um e-mail para confirmar seu endereço antes do primeiro acesso.");
  }

  if (aviso) return <p className="conta__ok">{aviso}</p>;

  return (
    <form onSubmit={enviar}>
      <div className="form-row">
        <div className="form-field">
          <label htmlFor="cad-nome">Nome</label>
          <input id="cad-nome" autoComplete="given-name" required value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="cad-sobrenome">Sobrenome</label>
          <input id="cad-sobrenome" autoComplete="family-name" value={sobrenome} onChange={(e) => setSobrenome(e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-field">
          <label htmlFor="cad-empresa">Empresa <small>(opcional)</small></label>
          <input id="cad-empresa" autoComplete="organization" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="cad-cnpj">CPF ou CNPJ <small>(opcional)</small></label>
          <input id="cad-cnpj" inputMode="numeric" value={cnpj} onChange={(e) => setCnpj(formatCpfCnpj(e.target.value))} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-field">
          <label htmlFor="cad-email">E-mail</label>
          <input id="cad-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="cad-telefone">Telefone / WhatsApp</label>
          <input id="cad-telefone" type="tel" autoComplete="tel" required value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(49) 99999-9999" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-field">
          <label htmlFor="cad-senha">Senha</label>
          <input id="cad-senha" type="password" autoComplete="new-password" required minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} />
          <span className="form-hint">Mínimo de 8 caracteres.</span>
        </div>
        <div className="form-field">
          <label htmlFor="cad-senha2">Repita a senha</label>
          <input id="cad-senha2" type="password" autoComplete="new-password" required value={senha2} onChange={(e) => setSenha2(e.target.value)} />
        </div>
      </div>
      <label className="conta__check">
        <input type="checkbox" checked={lgpd} onChange={(e) => setLgpd(e.target.checked)} />
        <span>
          Li e aceito a <Link href="/politica-de-privacidade" target="_blank">Política de Privacidade</Link> e autorizo a
          Compass a guardar meus dados para atendimento e orçamentos.
        </span>
      </label>
      <label className="conta__check">
        <input type="checkbox" checked={novidades} onChange={(e) => setNovidades(e.target.checked)} />
        <span>Quero receber novidades e campanhas da Compass (opcional).</span>
      </label>
      {erro && <p className="form-error">{erro}</p>}
      <button className="btn btn-primary conta__submit" disabled={enviando}>
        {enviando ? "Criando conta..." : "Criar minha conta"}
      </button>
    </form>
  );
}

function FormEsqueci({ onVoltar }: { onVoltar: () => void }) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const r = await pedirNovaSenha(email.trim());
    setEnviando(false);
    if ("erro" in r) setErro(r.erro ?? null);
    else setMsg("Se este e-mail tiver conta, você vai receber um link para criar uma nova senha.");
  }

  return (
    <form onSubmit={enviar}>
      <p className="form-hint" style={{ marginBottom: 12 }}>
        Informe seu e-mail. Enviaremos um link para você criar uma nova senha. Se não receber, fale
        com a gente pelo WhatsApp.
      </p>
      <div className="form-field">
        <label htmlFor="rec-email">E-mail</label>
        <input id="rec-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {erro && <p className="form-error">{erro}</p>}
      {msg && <p className="conta__ok">{msg}</p>}
      <button className="btn btn-primary conta__submit" disabled={enviando}>
        {enviando ? "Enviando..." : "Enviar link"}
      </button>
      <button type="button" className="conta__link" onClick={onVoltar}>
        Voltar para Entrar
      </button>
    </form>
  );
}

function NovaSenha({ onPronto }: { onPronto: () => void }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    const r = await trocarSenha(senha);
    if ("erro" in r) setErro(r.erro ?? null);
    else setOk(true);
  }

  return (
    <div className="conta__card" style={{ marginBottom: 24 }}>
      {ok ? (
        <p className="conta__ok">
          Senha alterada! <button className="conta__link" onClick={onPronto}>Fechar</button>
        </p>
      ) : (
        <form onSubmit={enviar}>
          <h3>Crie sua nova senha</h3>
          <div className="form-field">
            <label htmlFor="nova-senha">Nova senha</label>
            <input id="nova-senha" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
          {erro && <p className="form-error">{erro}</p>}
          <button className="btn btn-primary">Salvar nova senha</button>
        </form>
      )}
    </div>
  );
}

// ---------- Minha conta ----------

const CAMPOS_VAZIOS: Omit<Cliente, "id" | "consentimento_lgpd"> = {
  email: "",
  nome: "",
  sobrenome: "",
  empresa: "",
  cnpj: "",
  telefone: "",
  cep: "",
  endereco: "",
  numero: "",
  complemento: "",
  cidade: "",
  estado: "",
  aceita_novidades: false,
};

function MinhaConta() {
  const [dados, setDados] = useState({ ...CAMPOS_VAZIOS });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [orcamentos, setOrcamentos] = useState<OrcamentoSalvo[]>([]);

  useEffect(() => {
    (async () => {
      const [c, o] = await Promise.all([buscarCliente(), listarOrcamentos()]);
      const email = sessaoAtual()?.user.email ?? "";
      if (c) {
        setDados({
          ...CAMPOS_VAZIOS,
          ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ""])),
          aceita_novidades: Boolean(c.aceita_novidades),
          email: c.email || email,
        } as typeof CAMPOS_VAZIOS);
      } else {
        setDados((d) => ({ ...d, email }));
      }
      setOrcamentos(o);
      setCarregando(false);
    })();
  }, []);

  function campo(nome: keyof typeof CAMPOS_VAZIOS) {
    return {
      value: String(dados[nome] ?? ""),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDados((d) => ({ ...d, [nome]: e.target.value })),
    };
  }

  async function onCep(valor: string) {
    const cep = formatCEP(valor);
    setDados((d) => ({ ...d, cep }));
    if (onlyDigits(cep).length === 8) {
      const end = await fetchAddressByCep(onlyDigits(cep));
      if (end) {
        setDados((d) => ({
          ...d,
          cidade: end.cidade,
          estado: end.estado,
          endereco: d.endereco?.trim() ? d.endereco : [end.logradouro, end.bairro].filter(Boolean).join(", "),
        }));
      }
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    if (dados.cnpj && !isValidCpfCnpj(dados.cnpj)) return setErro("CPF ou CNPJ inválido. Confira os números.");
    setSalvando(true);
    const r = await salvarCliente({
      nome: dados.nome,
      sobrenome: dados.sobrenome,
      empresa: dados.empresa,
      cnpj: dados.cnpj,
      telefone: dados.telefone,
      cep: dados.cep,
      endereco: dados.endereco,
      numero: dados.numero,
      complemento: dados.complemento,
      cidade: dados.cidade,
      estado: (dados.estado ?? "").toUpperCase().slice(0, 2),
      aceita_novidades: Boolean(dados.aceita_novidades),
    });
    setSalvando(false);
    if ("erro" in r) setErro(r.erro ?? null);
    else setMsg("Dados salvos! Eles serão usados para preencher seus próximos orçamentos.");
  }

  if (carregando) return <p>Carregando sua conta...</p>;

  return (
    <div className="conta__painel">
      <div className="conta__topo">
        <div>
          <p className="hero-eyebrow">Área do cliente</p>
          <h2>Olá{dados.nome ? `, ${dados.nome}` : ""}!</h2>
          <p className="form-hint">{dados.email}</p>
        </div>
        <button className="btn btn-outline" onClick={() => sair()}>
          Sair
        </button>
      </div>

      <div className="conta__grid">
        <form className="conta__card" onSubmit={salvar}>
          <h3>Meus dados</h3>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="mc-nome">Nome</label>
              <input id="mc-nome" {...campo("nome")} />
            </div>
            <div className="form-field">
              <label htmlFor="mc-sobrenome">Sobrenome</label>
              <input id="mc-sobrenome" {...campo("sobrenome")} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="mc-empresa">Empresa</label>
              <input id="mc-empresa" {...campo("empresa")} />
            </div>
            <div className="form-field">
              <label htmlFor="mc-cnpj">CPF ou CNPJ</label>
              <input id="mc-cnpj" inputMode="numeric" value={dados.cnpj ?? ""} onChange={(e) => setDados((d) => ({ ...d, cnpj: formatCpfCnpj(e.target.value) }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="mc-telefone">Telefone / WhatsApp</label>
              <input id="mc-telefone" type="tel" {...campo("telefone")} />
            </div>
            <div className="form-field">
              <label htmlFor="mc-cep">CEP</label>
              <input id="mc-cep" inputMode="numeric" value={dados.cep ?? ""} onChange={(e) => onCep(e.target.value)} placeholder="00000-000" />
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="mc-endereco">Endereço</label>
            <input id="mc-endereco" {...campo("endereco")} placeholder="Rua, bairro" />
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="mc-numero">Número</label>
              <input id="mc-numero" {...campo("numero")} />
            </div>
            <div className="form-field">
              <label htmlFor="mc-complemento">Complemento</label>
              <input id="mc-complemento" {...campo("complemento")} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="mc-cidade">Cidade</label>
              <input id="mc-cidade" {...campo("cidade")} />
            </div>
            <div className="form-field">
              <label htmlFor="mc-estado">Estado</label>
              <input id="mc-estado" maxLength={2} {...campo("estado")} placeholder="UF" />
            </div>
          </div>
          <label className="conta__check">
            <input type="checkbox" checked={Boolean(dados.aceita_novidades)} onChange={(e) => setDados((d) => ({ ...d, aceita_novidades: e.target.checked }))} />
            <span>Quero receber novidades e campanhas da Compass.</span>
          </label>
          {erro && <p className="form-error">{erro}</p>}
          {msg && <p className="conta__ok">{msg}</p>}
          <button className="btn btn-primary conta__submit" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar dados"}
          </button>
        </form>

        <div className="conta__card">
          <h3>Meus orçamentos</h3>
          {orcamentos.length === 0 ? (
            <p className="form-hint">
              Você ainda não enviou orçamentos com esta conta. <Link href="/produtos">Ver produtos</Link>
            </p>
          ) : (
            <ul className="conta__orcamentos">
              {orcamentos.map((o) => (
                <li key={o.id}>
                  <div>
                    <strong>{o.numero_pedido ?? "Orçamento"}</strong>
                    <span>{new Date(o.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                  <p>{o.itens.map((i) => `${i.nome} (${i.quantidade})`).join(", ")}</p>
                </li>
              ))}
            </ul>
          )}
          <Link className="btn btn-outline" href="/orcamento" style={{ marginTop: 12 }}>
            Ir para Meu orçamento
          </Link>
        </div>
      </div>
    </div>
  );
}
