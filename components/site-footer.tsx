import Image from "next/image";
import Link from "next/link";

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
const whatsappUrl = WHATSAPP_NUMBER
  ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
      "Olá! Vim pelo site da Compass Brindes e gostaria de um orçamento."
    )}`
  : "/orcamento";

const INSTAGRAM_URL = "https://www.instagram.com/compassbrindes/";
const FACEBOOK_URL = "https://www.instagram.com/compassbrindes/";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__top">
        <div className="logo">
          <Image
            src="/logo-compass.png"
            alt="Compass Brindes Corporativos"
            width={150}
            height={62}
            className="logo-img"
          />
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
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
                <path d="M13.5 8.5h1.8V6h-2c-1.8 0-3 1.2-3 3.1v1.6H8.7v2.5h1.6V18h2.4v-4.8h1.8l.4-2.5h-2.2v-1.3c0-.6.2-.9.8-.9z" fill="currentColor" />
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
            <Link href="/produtos">Catálogo online ↗</Link>
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
