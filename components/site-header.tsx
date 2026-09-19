import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="logo" href="/">
          Compass <span>Brindes</span>
        </Link>
        <nav className="main-nav">
          <Link href="/produtos">Produtos</Link>
          <Link href="/orcamento">Meu orçamento</Link>
        </nav>
      </div>
    </header>
  );
}
