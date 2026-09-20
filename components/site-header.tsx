import Link from "next/link";

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
const whatsappUrl = WHATSAPP_NUMBER
  ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
      "Ola! Vim pelo site da Compass Brindes e gostaria de um orcamento."
    )}`
  : "/orcamento";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="logo" href="/">
          COMPASS
          <span>Brindes corporativos</span>
        </Link>
        <nav className="main-nav">
          <Link href="/">Inicio</Link>
          <Link href="/produtos">Produtos</Link>
          <Link href="/#como-funciona">Como funciona</Link>
          <Link href="/orcamento">Meu orcamento</Link>
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
