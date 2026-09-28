// Faixa de largura total com fotos reais de brindes já entregues pela Compass.
// As fotos ficam em public/trabalho-*.webp (560x700). Para trocar ou incluir
// uma foto, basta adicionar o arquivo lá e uma linha na lista abaixo.

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
const whatsappUrl = WHATSAPP_NUMBER
  ? "https://wa.me/" +
    WHATSAPP_NUMBER +
    "?text=" +
    encodeURIComponent("Olá! Vi os trabalhos no site da Compass Brindes e gostaria de um orçamento.")
  : "/orcamento";

type Trabalho = { src: string; legenda: string; alt: string };

// Os 6 primeiros aparecem na colagem do computador; no celular todos rolam na faixa.
const TRABALHOS: Trabalho[] = [
  { src: "/trabalho-garrafas-nomes.webp", legenda: "Garrafas com nome", alt: "Garrafas térmicas pretas gravadas com logotipo e nome de cada colaboradora" },
  { src: "/trabalho-canivetes-supratick.webp", legenda: "Canivetes gravados", alt: "Canivetes de inox gravados a laser com a marca do cliente" },
  { src: "/trabalho-garrafas-cj-med.webp", legenda: "Garrafas térmicas", alt: "Duas garrafas térmicas azuis gravadas a laser" },
  { src: "/trabalho-kit-churrasco-cresol.webp", legenda: "Kit churrasco", alt: "Kit churrasco com faca, garfo e estojo gravados com a marca do cliente" },
  { src: "/trabalho-powerbank-alvorada.webp", legenda: "Power banks", alt: "Carregadores portáteis gravados a laser com arte personalizada" },
  { src: "/trabalho-facas-erm-tech.webp", legenda: "Facas personalizadas", alt: "Facas com cabo de madeira gravadas com o logotipo do cliente" },
  { src: "/trabalho-mochila-kit.webp", legenda: "Kit mochila", alt: "Mochila, nécessaire e fone de ouvido com placas da marca do cliente" },
  { src: "/trabalho-coqueteleiras-cj-med.webp", legenda: "Coqueteleiras", alt: "Duas coqueteleiras térmicas azuis gravadas a laser" },
  { src: "/trabalho-copo-som-scherer.webp", legenda: "Copo com caixa de som", alt: "Copo térmico preto com caixa de som, gravado com a marca do cliente" },
  { src: "/trabalho-canetas-scherer.webp", legenda: "Canetas paquímetro", alt: "Canetas brancas em formato de paquímetro impressas com a marca do cliente" },
];

const PROMESSAS = ["Gravação a laser", "Atendimento personalizado", "Entrega para toda a região"];

export function WorkBanner() {
  const colagem = TRABALHOS.slice(0, 6);

  return (
    <section className="work-banner" aria-labelledby="work-banner-title">
      <div className="work-banner__inner">
        <div className="work-banner__text">
          <p className="work-banner__eyebrow">Trabalhos entregues</p>
          <h2 id="work-banner-title">
            Sua marca em <em>boas companhias.</em>
          </h2>
          <p className="work-banner__lede">
            Brindes reais, personalizados e entregues pela Compass para empresas, eventos e datas
            especiais.
          </p>
          <ul className="work-banner__promises">
            {PROMESSAS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <a
            className="work-banner__cta"
            href={whatsappUrl}
            target={WHATSAPP_NUMBER ? "_blank" : undefined}
            rel={WHATSAPP_NUMBER ? "noreferrer" : undefined}
          >
            Faça seu orçamento
          </a>
        </div>

        <div className="work-banner__collage" aria-hidden="false">
          {colagem.map((t, i) => (
            <figure key={t.src} className={"work-card work-card--" + (i + 1)}>
              <img src={t.src} alt={t.alt} width={560} height={700} loading="lazy" decoding="async" />
              <figcaption>{t.legenda}</figcaption>
            </figure>
          ))}
        </div>

        <div className="work-banner__strip">
          {TRABALHOS.map((t) => (
            <figure key={t.src} className="work-card">
              <img src={t.src} alt={t.alt} width={560} height={700} loading="lazy" decoding="async" />
              <figcaption>{t.legenda}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="work-banner__stripe" aria-hidden="true" />
    </section>
  );
}
