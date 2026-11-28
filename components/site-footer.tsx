import Link from "next/link";
// Logo nova (Rede de pontos, 22/11/2026): gerada em /api/marca com as fontes da marca.
const LOGO_SRC = "/api/marca?tipo=site&v=1";

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
const whatsappUrl = WHATSAPP_NUMBER
  ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
      "Olá! Vim pelo site da Compass Brindes e gostaria de um orçamento."
    )}`
  : "/orcamento";

const INSTAGRAM_URL = "https://www.instagram.com/compassbrindes/";
const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61555851462621"; // página Compass Brindes Corporativos (27/11)

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__top">
        <div className="logo">
          <img src={LOGO_SRC} alt="Compass Brindes Corporativos" className="logo-img" />
        </div>

        <div style={{ maxWidth: 280, fontSize: "0.85rem" }}>
          Brindes personalizados para marcas que querem ser lembradas pelo cuidado.
          <div className="site-footer__social">
            <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" aria-label="Instagram da Compass">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" />
              </svg>
            </a>
            <a href={FACEBOOK_URL} target="_blank" rel="noreferrer" aria-label="Facebook da Compass">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M13.2 19v-6.1h2.1l.3-2.4h-2.4V9c0-.7.2-1.2 1.2-1.2h1.3V5.7c-.2 0-1-.1-1.9-.1-1.9 0-3.1 1.1-3.1 3.2v1.7H8.6v2.4h2.1V19" fill="currentColor" />
              </svg>
            </a>
          </div>
        </div>

        <div className="site-footer__contact">
          <div className="label">Atendimento direto</div>
          <div className="phone">(49) 93618-0446</div>
          <a href={whatsappUrl} target={WHATSAPP_NUMBER ? "_blank" : undefined} rel="noreferrer">
            Falar pelo WhatsApp ↗
          </a>
          <div style={{ marginTop: 8 }}>
            <a href="mailto:compassbrindes@gmail.com">compassbrindes@gmail.com</a>
          </div>
          <div style={{ marginTop: 8 }}>
            <Link href="/produtos">Catálogo online ↗</Link>
          </div>
          <div style={{ marginTop: 8 }}>
            <Link href="/catalogo">Baixar catálogo em PDF ↗</Link>
          </div>
        </div>
      </div>

      <div className="container site-footer__payments">
        <span className="site-footer__payments-label">Formas de pagamento</span>
        <ul className="payment-badges">
          <li className="payment-badge">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="M2.5 9.5h19" stroke="currentColor" strokeWidth="1.7" />
              <path d="M6 15h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            Cartão de crédito
          </li>
          <li className="payment-badge">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2.8l9.2 9.2-9.2 9.2L2.8 12z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              <path d="M8.6 12L12 8.6 15.4 12 12 15.4z" fill="currentColor" />
            </svg>
            PIX
          </li>
          <li className="payment-badge">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 5v14M7 5v14M9.5 5v14M13 5v14M15.5 5v14M19 5v14M21 5v14" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            Boleto
          </li>
        </ul>
      </div>

      <div className="container site-footer__bottom">
        <span>&copy; {new Date().getFullYear()} Compass Brindes Corporativos &mdash; todos os produtos sob consulta, preços podem variar por quantidade.</span>
        <span>
          <Link href="/politica-de-privacidade">Política de Privacidade</Link>
          {" · "}Feito para aproximar.
        </span>
      </div>
    </footer>
  );
}
