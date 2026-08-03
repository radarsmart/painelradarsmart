import { buildBriefingFromOffer } from "./from-offer";

function parseBenefitLines(benefits: string): string[] {
  return benefits
    .split("\n")
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
}

// Descricao fixa da garota-propaganda da Radar Smart — repetir essa mesma
// descricao em todo prompt e o que faz o Gemini/Veo gerar "a mesma pessoa"
// de video pra video (ele nao tem memoria entre gerações, entao a
// consistencia visual depende inteiramente do texto ser sempre igual aqui).
const SPOKESPERSON_DESCRIPTION =
  "Mulher brasileira, entre 28 e 33 anos, cabelo castanho caramelo longo e ondulado " +
  "(efeito balayage), pele morena clara, sorriso largo e caloroso, maquiagem natural, " +
  "brincos de argola dourados pequenos. Veste blazer (verde esmeralda ou azul-marinho) " +
  "sobre camisa/blusa branca — visual profissional-casual. Transmite confiança, simpatia " +
  "e credibilidade, como uma amiga que entende de compras e da dicas boas. Fala direto pra " +
  "camera, em portugues do Brasil, com entonacao natural e animada (nao robotica).";

type PromptOption = { slug: string; label: string; description: string };

export const GEMINI_FORMAT_OPTIONS: PromptOption[] = [
  {
    slug: "talking_head",
    label: "Falando direto pra câmera",
    description: "Ela fala direto pra camera, plano fixo, estilo depoimento/dica de amiga.",
  },
  {
    slug: "walking_talking",
    label: "Andando e falando",
    description: "Ela caminha em um ambiente (rua ou casa) enquanto fala pra camera, camera acompanha o movimento.",
  },
  {
    slug: "product_in_hand",
    label: "Produto na mão",
    description: "Ela segura e mostra o produto na mao enquanto fala, com cortes pro produto de perto.",
  },
  {
    slug: "before_after",
    label: "Antes / depois",
    description: "Corte rapido entre um momento 'problema' (sem o produto) e o 'depois' (com o produto), com ela narrando a virada.",
  },
];

export const GEMINI_LIGHTING_OPTIONS: PromptOption[] = [
  {
    slug: "window_light",
    label: "Luz natural de janela",
    description: "Luz natural quente entrando por uma janela, ambiente interno aconchegante.",
  },
  {
    slug: "golden_hour_outdoor",
    label: "Golden hour ao ar livre",
    description: "Luz dourada de fim de tarde, ambiente urbano ao ar livre, predios desfocados ao fundo.",
  },
  {
    slug: "soft_studio",
    label: "Estúdio com luz suave",
    description: "Iluminacao de estudio suave e uniforme, fundo neutro levemente desfocado.",
  },
  {
    slug: "bright_daylight",
    label: "Luz do dia bem clara",
    description: "Luz de dia bem clara e nitida, ambiente aberto e arejado.",
  },
];

export const GEMINI_ANGLE_OPTIONS: PromptOption[] = [
  {
    slug: "front_closeup",
    label: "Close frontal",
    description: "Camera na altura dos olhos, close no rosto e ombros, contato visual direto.",
  },
  {
    slug: "three_quarter",
    label: "Três quartos",
    description: "Camera levemente de lado (three-quarter), plano do peito pra cima.",
  },
  {
    slug: "waist_up",
    label: "Plano americano",
    description: "Camera um pouco mais afastada, mostrando da cintura pra cima, mais espaco pra gestos.",
  },
  {
    slug: "low_angle",
    label: "Levemente de baixo",
    description: "Camera um pouco abaixo da linha dos olhos, transmite mais confianca/autoridade.",
  },
];

function pickOption(options: PromptOption[], slug?: string): PromptOption {
  if (slug) {
    const found = options.find((option) => option.slug === slug);
    if (found) return found;
  }
  return options[Math.floor(Math.random() * options.length)];
}

export type GeminiPromptOptions = {
  format?: string;
  lighting?: string;
  angle?: string;
};

// Formata os dados ja derivados de uma oferta real (preco, desconto,
// beneficios, dor do cliente) como um prompt descritivo pronto pra colar no
// Gemini/Veo — texto corrido em portugues, com a garota-propaganda da Radar
// Smart falando pra camera. O usuario cola isso direto no site/app do Gemini
// e gera o video la, manual.
export async function buildGeminiVideoPrompt(
  offerId: string,
  options: GeminiPromptOptions = {},
): Promise<{ prompt: string; productName: string }> {
  const briefing = await buildBriefingFromOffer(offerId);
  const benefits = parseBenefitLines(briefing.product_benefits);

  const format = pickOption(GEMINI_FORMAT_OPTIONS, options.format);
  const lighting = pickOption(GEMINI_LIGHTING_OPTIONS, options.lighting);
  const angle = pickOption(GEMINI_ANGLE_OPTIONS, options.angle);

  const priceLine = briefing.product_discount
    ? `de R$ ${briefing.competitor_price ?? "?"} por R$ ${briefing.product_price} (${briefing.product_discount})`
    : `por R$ ${briefing.product_price}`;

  const benefitsSpoken = benefits
    .slice(0, 3)
    .map((benefit) => benefit.replace(/\.+\s*$/, ""))
    .join(". ");

  const promptLines = [
    `Video vertical (9:16), estilo TikTok/Reels, 15-20 segundos, ritmo dinamico com cortes rapidos.`,
    ``,
    `Personagem (sempre a mesma, garota-propaganda da Radar Smart): ${SPOKESPERSON_DESCRIPTION}`,
    ``,
    `Formato da cena: ${format.description}`,
    `Iluminacao: ${lighting.description}`,
    `Angulo de camera: ${angle.description}`,
    ``,
    `Produto: ${briefing.product_name}${briefing.product_category ? ` (categoria: ${briefing.product_category})` : ""}.`,
    `Preco: ${priceLine}.`,
    ``,
    `Roteiro falado (ela fala isso em portugues, com naturalidade, nao lendo):`,
    `Abertura (0-3s), tom de cumplicidade sobre a dor do cliente: "${briefing.product_pain}"`,
    `Meio (3-14s), contando os beneficios como quem da uma dica: "${benefitsSpoken}."`,
    `Fechamento (14-20s), preco em destaque e chamada pra acao: "Só R$ ${briefing.product_price}${briefing.product_discount ? `, ${briefing.product_discount}` : ""}! Corre no link da Radar Smart antes que acabe."`,
    ``,
    `Texto na tela: preco em destaque (${priceLine}) aparece sobreposto perto do fechamento.`,
    `Estilo de audio: a propria fala dela como narracao, com musica de fundo leve e comercial por baixo.`,
  ];

  return { prompt: promptLines.join("\n"), productName: briefing.product_name };
}
