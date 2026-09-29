// Temas de brindes (página /brindes-por-tema).
// Cada tema lista os SKUs do catálogo próprio (data/catalogo-app.json) que
// combinam com a ocasião. A busca por texto não serve para isso, porque as
// descrições dos produtos não citam datas nem públicos ("Outubro Rosa",
// "para elas" etc.). Para incluir um produto num tema, basta adicionar o SKU
// na lista. Temas sem nenhum produto válido não aparecem no site.

export type Theme = {
  slug: string;
  nome: string;
  emoji: string;
  descricao: string;
  skus: string[];
};

const SKU = {
  bolsaCouro: "1942486-bolsa-couro-sintetico-12l-c090b630",
  bolsaTermicaOxford: "1942483-bolsa-termica-oxford-11l-c189b650",
  bolsaTermica10: "xbz-02798-bolsa-termica-10l",
  somC043: "1947187-caixa-de-som-c043b620",
  somC060: "1947192-caixa-de-som-c060b310",
  somC080: "1947185-caixa-de-som-c080b020",
  canecaChopp: "1938267-caneca-chopp-c040b700",
  caneca12: "xbz-06033-caneca-termica-12l", // a C188B960 era repetida e foi excluída
  caneca900: "1941780-caneca-termica-900ml-c091b950",
  canecaC060: "1938400-caneca-termica-c060b610",
  canetaAros: "1947204-caneta-metal-aros-cb-er143b",
  canetaLisa: "1947196-caneta-metal-lisa-c082b670",
  canetaTouch120: "1947206-caneta-metal-touch-c050b120",
  canetaTouch190: "1947202-caneta-metal-touch-c050b190",
  chaveiroAbridor: "1947208-chaveiro-abridor-c098b240",
  trena1: "1942482-chaveiro-trena-plastico-1m-c082b040",
  trena2: "1942487-chaveiro-trena-plastico-2-metros-c082b320",
  copoC040: "1938314-copo-c040b800",
  copoC187: "1938403-copo-c187b630",
  copoCafe: "1938401-copo-cafe-c082b450",
  copoSom: "1938402-copo-caixa-de-som-c187b490",
  copoCuia: "1934039-copo-cuia",
  copoTradicional: "1934024-copo-tradicional",
  coqueteleira: "1938405-coqueteleira-c092b370",
  coqueteleiraInox: "1938404-coqueteleira-inox-c190b390",
  escova: "1947215-escova-c152b480",
  escovaCoracao: "1947211-escova-espelho-coracao-c189b190",
  escovaRedonda: "1947214-escova-espelho-redonda-c103b420",
  fone: "1947217-fone-de-ouvido-bluetooth-touch-com-case-carregador-c050b210",
  garrafa400: "1938408-garrafa-c042b05",
  garrafa14: "1938406-garrafa-c186b770",
  garrafa1l: "1947238-garrafa-c186b780",
  garrafaDupla: "1938407-garrafa-c189b100",
  flip650: "1938411-garrafa-flip-650ml-c040b980",
  flip550: "1938409-garrafa-flip-c040b970",
  garrafa15: "1941594-garrafa-termica-15l-c190b330",
  garrafa780: "1941224-garrafa-termica-780ml-c185b180",
  garrafa800: "1941593-garrafa-termica-800ml-c190b140",
  churrasco2: "1947220-kit-churrasco-c074b470",
  churrasco5: "1941773-kit-churrasco-c082b170",
  mochila: "1947225-mochila-c013b200",
  necessaire: "1947227-necessaire-c190b190",
  portaJoias: "1947231-porta-joias-c016b22b0",
  squeeze500a: "1941590-squeeze-inox-500ml-c091b880",
  squeeze500b: "1941589-squeeze-inox-500ml-c913b9i0",
  squeeze600: "1941591-squeeze-inox-600ml-c185b580",
  squeeze750: "1941592-squeeze-inox-750ml-c188b210",
  squeeze880: "1941770-squeeze-inox-880ml-c187b800",
  xbzCaneca12: "xbz-06033-caneca-termica-12l",
  xbzCopo500: "xbz-14724-copo-termico-inox-500ml",
  xbzCopo380: "xbz-04014-copo-termico-inox-380ml-multiuso",
  xbzGarrafa450: "xbz-18639-garrafa-termica-inox-450ml",
  xbzKitGarrafa: "xbz-18639kit-kit-garrafa-termica",
  jardinagem: "xbz-09059-kit-jardinagem-3-pecas",
  caniveteChave: "canivete-chave-de-boca-01",
  canivetePesca: "canivete-inox-presilha-pesca-01",
  canivetePremium: "canivete-premium-hunter-clip-01",
  caniveteAnatomico: "canivete-inox-cabo-anatomico-01",
  camisetaMasc: "vestuario-camiseta-poliamida-masculina",
  babylookFem: "vestuario-babylook-poliamida-feminina",
} as const;

const autocuidado = [SKU.escovaCoracao, SKU.escovaRedonda, SKU.escova, SKU.necessaire, SKU.portaJoias];
const hidratacao = [SKU.squeeze500a, SKU.squeeze500b, SKU.squeeze600, SKU.squeeze750, SKU.squeeze880, SKU.flip550, SKU.flip650];
const canivetes = [SKU.caniveteChave, SKU.canivetePesca, SKU.canivetePremium, SKU.caniveteAnatomico];
const canetas = [SKU.canetaAros, SKU.canetaLisa, SKU.canetaTouch120, SKU.canetaTouch190];
const cafe = [SKU.copoCafe, SKU.canecaC060, SKU.xbzCopo380];

// Tema em destaque no topo da página (troque o slug conforme a época do ano).
export const FEATURED_THEME_SLUG = "outubro-rosa";

export const THEMES: Theme[] = [
  {
    slug: "outubro-rosa",
    nome: "Outubro Rosa",
    emoji: "🎗️",
    descricao:
      "Brindes de autocuidado e bem-estar para campanhas de conscientização sobre a saúde da mulher. Consulte as cores disponíveis de cada item.",
    skus: [...autocuidado, SKU.squeeze500a, SKU.squeeze500b, SKU.flip550, SKU.copoCafe],
  },
  {
    slug: "novembro-azul",
    nome: "Novembro Azul",
    emoji: "💙",
    descricao: "Brindes para campanhas de cuidado com a saúde do homem.",
    skus: [SKU.churrasco5, SKU.churrasco2, ...canivetes, SKU.canecaChopp, SKU.squeeze750, SKU.chaveiroAbridor],
  },
  {
    slug: "para-elas",
    nome: "Para Elas",
    emoji: "💐",
    descricao: "Presentes com cuidado e praticidade para o dia a dia.",
    skus: [...autocuidado, SKU.bolsaCouro, SKU.canecaC060, SKU.copoCafe],
  },
  {
    slug: "para-eles",
    nome: "Para Eles",
    emoji: "🕶️",
    descricao: "Churrasco, ferramentas de bolso e acessórios úteis.",
    skus: [SKU.churrasco5, SKU.churrasco2, ...canivetes, SKU.chaveiroAbridor, SKU.canecaChopp, SKU.coqueteleiraInox, SKU.mochila],
  },
  {
    slug: "dia-das-maes",
    nome: "Dia das Mães",
    emoji: "🌷",
    descricao: "Presentes delicados e úteis para homenagear as mães.",
    skus: [...autocuidado, SKU.bolsaCouro, SKU.canecaC060, SKU.garrafa780],
  },
  {
    slug: "dia-dos-pais",
    nome: "Dia dos Pais",
    emoji: "👔",
    descricao: "Kits de churrasco, canivetes e acessórios para os pais.",
    skus: [SKU.churrasco5, SKU.churrasco2, ...canivetes, SKU.canecaChopp, SKU.somC080, SKU.fone],
  },
  {
    slug: "dia-da-mulher",
    nome: "Dia da Mulher",
    emoji: "💜",
    descricao: "Brindes para celebrar e reconhecer as mulheres da equipe.",
    skus: [...autocuidado, SKU.canecaC060, SKU.copoCafe, SKU.squeeze500b],
  },
  {
    slug: "dia-da-secretaria",
    nome: "Dia da Secretária",
    emoji: "🗂️",
    descricao: "Itens de escritório e cuidado pessoal para homenagear quem organiza tudo.",
    skus: [...canetas, SKU.portaJoias, SKU.necessaire, ...cafe, SKU.escovaCoracao],
  },
  {
    slug: "para-verao",
    nome: "Para Verão",
    emoji: "☀️",
    descricao: "Bebida gelada, som e bolsas térmicas para os dias quentes.",
    skus: [SKU.bolsaTermicaOxford, SKU.bolsaTermica10, SKU.copoC040, SKU.copoC187, SKU.xbzCopo500, SKU.canecaChopp, SKU.coqueteleira, SKU.somC043, SKU.squeeze600],
  },
  {
    slug: "para-inverno",
    nome: "Para Inverno",
    emoji: "🧣",
    descricao: "Canecas e garrafas térmicas para café, chá e chimarrão.",
    skus: [SKU.caneca12, SKU.xbzCaneca12, SKU.caneca900, SKU.garrafa15, SKU.garrafa800, SKU.garrafa780, SKU.copoCuia, ...cafe],
  },
  {
    slug: "usar-em-casa",
    nome: "Usar em Casa",
    emoji: "🏠",
    descricao: "Térmicos e utilidades para a rotina em casa.",
    skus: [SKU.garrafa15, SKU.garrafa14, SKU.garrafa1l, SKU.caneca12, SKU.canecaC060, SKU.jardinagem, SKU.copoCafe, SKU.somC060],
  },
  {
    slug: "levar-na-viagem",
    nome: "Levar na Viagem",
    emoji: "🧳",
    descricao: "Mochila, nécessaire e itens que cabem na mala.",
    skus: [SKU.mochila, SKU.necessaire, SKU.portaJoias, SKU.bolsaCouro, SKU.bolsaTermica10, SKU.fone, SKU.flip550, SKU.squeeze500a],
  },
  {
    slug: "esporte-fitness",
    nome: "Esporte / Fitness",
    emoji: "🏋️",
    descricao: "Hidratação e acessórios para quem se exercita.",
    skus: [SKU.camisetaMasc, SKU.babylookFem, ...hidratacao, SKU.mochila, SKU.fone],
  },
  {
    slug: "hora-do-lazer",
    nome: "Hora do Lazer",
    emoji: "🎲",
    descricao: "Som, churrasco e drinks para os momentos de descanso.",
    skus: [SKU.somC043, SKU.somC060, SKU.somC080, SKU.copoSom, SKU.coqueteleira, SKU.coqueteleiraInox, SKU.churrasco5, SKU.canecaChopp, SKU.bolsaTermicaOxford, SKU.chaveiroAbridor],
  },
  {
    slug: "brindes-sipat",
    nome: "Brindes SIPAT",
    emoji: "🦺",
    descricao: "Brindes úteis para a Semana Interna de Prevenção de Acidentes.",
    skus: [SKU.trena1, SKU.trena2, SKU.squeeze500a, SKU.squeeze600, SKU.garrafa400, SKU.xbzGarrafa450, SKU.canetaLisa],
  },
  {
    slug: "feira-e-eventos",
    nome: "Feira e Eventos",
    emoji: "🎪",
    descricao: "Itens de boa saída para distribuir em volume.",
    skus: [...canetas, SKU.chaveiroAbridor, SKU.trena1, SKU.trena2, SKU.squeeze500a, SKU.copoTradicional],
  },
  {
    slug: "brindes-agro",
    nome: "Brindes Agro",
    emoji: "🌾",
    descricao: "Ferramentas e térmicos resistentes para o campo.",
    skus: [SKU.jardinagem, ...canivetes, SKU.trena2, SKU.garrafa15, SKU.garrafa14, SKU.copoCuia, SKU.bolsaTermicaOxford, SKU.caneca12],
  },
];

export function getTheme(slug: string | undefined): Theme | undefined {
  if (!slug) return undefined;
  return THEMES.find((t) => t.slug === slug);
}
