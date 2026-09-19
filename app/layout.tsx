import type { Metadata } from "next";
import "@/app/globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { WhatsappFab } from "@/components/whatsapp-fab";

export const metadata: Metadata = {
  title: "Compass Brindes Corporativos",
  description:
    "Brindes corporativos personalizados. Catálogo integrado com fornecedores XBZ, Asia Import e Spot Gifts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
        <WhatsappFab />
      </body>
    </html>
  );
}
