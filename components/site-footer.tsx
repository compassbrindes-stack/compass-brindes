import Link from "next/link";

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
const whatsappUrl = WHATSAPP_NUMBER
  ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
      "Olá! Vim pelo site da Compass Brindes e gostaria de um orçamento."
    )}`
  : "/orcamento";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__top">
        <div className="logo">
          COMPASS
          <span>Brindes corporativos</span>
        </div>

        <div style={{ maxWidth: 280, fontSize: "0.85rem" }}>
          Brindes personalizados para marcas que querem ser lembradas pelo cuidado.
          <div style={{ marginTop: 14 }}>
            <a href="https://instagram.com/compassbrindes" target="_blank" rel="noreferrer">
              @compassbrindes no Instagram
            </a>
          </div>
        </div>

        <div className="site-footer__contact">
          <div className="label">Atendimento direto</div>
          <div className="phone">(49) 93618-0446</div>
          <a href={whatsappUrl} target={WHATSAPP_NUMBER ? "_blank" : undefined} rel="noreferrer">
            Falar pelo WhatsApp
          </a>
          <div style={{ marginTop: 8 }}>
            <Link href="/produtos">Catálogo online</Link>
          </div>
        </div>
      </div>

      <div className="container site-footer__bottom">
        <span>&copy; {new Date().getFullYear()} Compass Brindes Corporativos &mdash; todos os produtos sob consulta, preços podem variar por quantidade.</span>
        <span>Feito para aproximar.</span>
      </div>
    </footer>
  );
}
