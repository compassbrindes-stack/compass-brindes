// Catálogo em PDF com download direto, sem cadastro.
// (Até 27/09/2026 a página pedia nome, empresa, e-mail e telefone antes do
// download. Os cadastros feitos até então continuam em /admin/leads.)

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
const whatsappUrl = WHATSAPP_NUMBER
  ? "https://wa.me/" +
    WHATSAPP_NUMBER +
    "?text=" +
    encodeURIComponent("Olá! Vi o catálogo da Compass Brindes e gostaria de um orçamento.")
  : "/orcamento";

export const metadata = {
  title: "Catálogo em PDF — Compass Brindes Corporativos",
  description: "Baixe o catálogo completo de brindes corporativos da Compass em PDF.",
};

export default function CatalogoPage() {
  return (
    <div className="container section" style={{ maxWidth: 620 }}>
      <h2>Catálogo em PDF</h2>
      <p className="section-lede">
        Baixe o catálogo completo da Compass Brindes Corporativos, com fotos e descrição de todos os
        produtos. É só clicar no botão abaixo.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
        <a className="btn btn-primary" href="/api/catalogo/pdf" download>
          Baixar catálogo em PDF
        </a>
        <a
          className="btn btn-outline"
          href={whatsappUrl}
          target={WHATSAPP_NUMBER ? "_blank" : undefined}
          rel={WHATSAPP_NUMBER ? "noreferrer" : undefined}
        >
          Pedir orçamento no WhatsApp
        </a>
      </div>

      <p className="form-hint" style={{ marginTop: 14 }}>
        O arquivo é gerado na hora com os produtos atualizados e pode levar alguns segundos para
        começar a baixar.
      </p>
    </div>
  );
}
