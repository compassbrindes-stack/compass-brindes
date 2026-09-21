import Image from "next/image";
import Link from "next/link";

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
const whatsappUrl = WHATSAPP_NUMBER
  ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
      "Olá! Vim pelo site da Compass Brindes e gostaria de um orçamento."
    )}`
  : "/orcamento";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="logo" href="/">
          <Image
            src="/logo-compass.png"
            alt="Compass Brindes Corporativos"
            width={336}
            height={138}
            priority
            className="logo-img logo-img--header"
          />
        </Link>
        <form className="site-search" action="/produtos" method="GET">
          <input
            type="search"
            name="q"
            placeholder="Buscar produtos..."
            aria-label="Buscar produtos"
          />
          <button type="submit" aria-label="Buscar">
            Buscar
          </button>
        </form>
        <nav className="main-nav">
          <Link href="/">Início</Link>
          <Link href="/produtos">Produtos</Link>
          <Link href="/#como-funciona">Como funciona</Link>
          <Link href="/orcamento">Meu orçamento</Link>
          <Link href="/catalogo">Catálogo em PDF</Link>
          <a className="site-header__phone" href="tel:+5549936180446">
            (49) 93618-0446
          </a>
          <a
            className="btn btn-primary"
            href={whatsappUrl}
            target={WHATSAPP_NUMBER ? "_blank" : undefined}
            rel={WHATSAPP_NUMBER ? "noreferrer" : undefined}
          >
            Falar com a Compass
          </a>
        </nav>
      </div>
    </header>
  );
}
