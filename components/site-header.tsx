import Link from "next/link";
import { LOGO_DATA_URI } from "@/lib/logo";
import { MobileMenuCloser } from "@/components/mobile-menu-closer";
import { QuoteBadge } from "@/components/quote-badge";
import { AccountLink } from "@/components/account-link";

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
const whatsappUrl = WHATSAPP_NUMBER
  ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
      "Olá! Vim pelo site da Compass Brindes e gostaria de um orçamento."
    )}`
  : "/orcamento";

// Topo em duas faixas:
// 1) logo + busca grande + ícones (conta, orçamento) + WhatsApp
// 2) faixa verde com os links principais
// No celular, a faixa verde vira o menu que abre no botão "Menu".
export function SiteHeader() {
  return (
    <header className="site-header hd">
      {/* Menu do celular: checkbox + label abrem/fecham o menu sem precisar de JavaScript. */}
      <input type="checkbox" id="menu-toggle" className="menu-toggle" aria-label="Abrir menu" />

      <div className="hd__top">
        <div className="hd__row">
          <Link className="hd__logo" href="/" aria-label="Compass Brindes Corporativos — página inicial">
            <img src={LOGO_DATA_URI} alt="Compass Brindes Corporativos" />
          </Link>

          <form className="hd__search" action="/produtos" method="GET" role="search">
            <input type="search" name="q" placeholder="Qual brinde você procura?" aria-label="Buscar produtos" />
            <button type="submit" aria-label="Buscar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
                <path d="M16 16l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </form>

          <div className="hd__actions">
            <AccountLink />
            <Link href="/orcamento" className="hd__icon" aria-label="Meu orçamento">
              <span className="hd__icon-img">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 8h14l-1 12H6L5 8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="M9 8V6a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.8" />
                </svg>
                <QuoteBadge />
              </span>
              <span className="hd__icon-label">Orçamento</span>
            </Link>
            <a
              className="hd__wa"
              href={whatsappUrl}
              target={WHATSAPP_NUMBER ? "_blank" : undefined}
              rel={WHATSAPP_NUMBER ? "noreferrer" : undefined}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.2-.4.2-.4.7-1.3a.4.4 0 000-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.8 11.9 11.9 0 004.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 001.9-1.3 2.3 2.3 0 00.2-1.3c-.1-.1-.3-.2-.5-.3z" />
              </svg>
              WhatsApp
            </a>
            <label htmlFor="menu-toggle" className="menu-button" aria-hidden="true">
              <span className="menu-button__icon" />
              Menu
            </label>
          </div>
        </div>
      </div>

      <nav className="hd__nav" id="site-menu" aria-label="Menu principal">
        <div className="hd__nav-row">
          <Link href="/produtos">
            <span aria-hidden="true">☰</span> Produtos por categoria
          </Link>
          <Link href="/brindes-por-tema">Brindes por tema</Link>
          <Link href="/#como-funciona">Como funciona</Link>
          <Link href="/catalogo">Catálogo em PDF</Link>
          <a className="hd__nav-phone" href="tel:+5549936180446">
            (49) 93618-0446
          </a>
        </div>
      </nav>
      <MobileMenuCloser />
    </header>
  );
}
