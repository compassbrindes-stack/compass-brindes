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
            width={168}
            height={69}
            priority
            className="logo-img"
          />
        </Link>
        <nav className="main-nav">
          <Link href="/">Início</Link>
          <Link href="/produtos">Produtos</Link>
          <Link href="/#como-funciona">Como funciona</Link>
          <Link href="/orcamento">Meu orçamento</Link>
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
