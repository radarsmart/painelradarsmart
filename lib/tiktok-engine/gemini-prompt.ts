import { buildBriefingFromOffer } from "./from-offer";

function parseBenefitLines(benefits: string): string[] {
  return benefits
    .split("\n")
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
}

// O Gemini so gera ~10s de video por vez e corta a fala no meio se o texto
// nao couber nesse tempo. Fala natural em portugues fica em torno de 2,3-2,5
// palavras/segundo — 18 palavras cabem com folga em 8s, evitando corte.
const MAX_WORDS_PER_SCENE = 18;

function capWords(text: string, maxWords = MAX_WORDS_PER_SCENE): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(" ")}...`;
}

// Descricao fixa da garota-propaganda da Radar Smart — repetir essa mesma
// descricao em todo prompt e o que faz o Gemini/Veo gerar uma pessoa visualmente
// consistente de cena pra cena (ele nao tem memoria entre gerações, entao a
// consistencia depende do texto ser sempre igual aqui).
// Evita linguagem tipo "sempre a mesma pessoa"/"recrie essa pessoa" — o
// Gemini interpreta isso como pedido pra reproduzir uma pessoa REAL
// especifica e recusa por politica de deepfake. Descrevendo como uma
// personagem fictícia gerada por IA, o proprio texto identico em toda cena
// ja garante a consistencia visual, sem soar como recriacao de alguem real.
const SPOKESPERSON_DESCRIPTION =
  "Personagem fictícia gerada por IA, uma apresentadora de vídeos de ofertas: " +
  "mulher brasileira, entre 28 e 33 anos, cabelo castanho caramelo longo e ondulado " +
  "(efeito balayage), pele morena clara, sorriso largo e caloroso, maquiagem natural, " +
  "brincos de argola dourados pequenos. Veste blazer (verde esmeralda ou azul-marinho) " +
  "sobre camisa/blusa branca — visual profissional-casual. Transmite confiança, simpatia " +
  "e credibilidade, como uma amiga que entende de compras e da dicas boas. Fala direto pra " +
  "camera, em portugues do Brasil, com entonacao natural e animada (nao robotica).";

// Card final fixo com o logo/marca — mesma paleta de cor usada no nome
// "RADAR SMART" no site (dourado #9e6a18 sobre grafite escuro #22223B),
// pra fechar todo video com a mesma identidade visual.
const OUTRO_BRAND_CARD =
  "Card de encerramento (sem pessoa, so o logo) com o logo da Radar Smart — um emblema " +
  "circular com aneis dourados e, no centro, um icone de carrinho de compras combinado " +
  "com mira de radar, tambem em dourado, sobre fundo verde-escuro/grafite. Abaixo do " +
  "emblema, o nome \"RADAR SMART\" em letras maiusculas: \"RADAR\" em grafite escuro " +
  "(#22223B) e \"SMART\" em dourado (#9e6a18), fundo limpo e neutro.";

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

export type GeminiVideoScene = {
  label: string;
  durationHint: string;
  prompt: string;
};

function sceneSetupBlock(args: {
  index: number;
  total: number;
  format: PromptOption;
  lighting: PromptOption;
  angle: PromptOption;
}): string[] {
  const { index, total, format, lighting, angle } = args;
  const lines = [
    `Cena ${index} de ${total} de um vídeo publicitário gerado em partes — cada cena é um vídeo curto separado (~8 segundos) que depois será editado em sequência no CapCut.`,
    `Vídeo vertical (9:16).`,
  ];

  if (index > 1) {
    lines.push(
      "Continuação direta da cena anterior: mesma personagem, mesma roupa, mesmo ambiente, mesma luz e mesmo ângulo — ela continua falando de onde parou, sem repetir introdução nem recomeçar o cumprimento.",
    );
  }

  lines.push(
    ``,
    `Personagem: ${SPOKESPERSON_DESCRIPTION}`,
    ``,
    `Formato da cena: ${format.description}`,
    `Iluminação: ${lighting.description}`,
    `Ângulo de câmera: ${angle.description}`,
  );

  return lines;
}

// Gera o video em CENAS separadas (nao 1 prompt so) porque o Gemini limita
// a geracao a uns 10s e corta a fala no meio se o roteiro for mais longo do
// que isso — cada cena aqui fica dentro de ~8s de fala (com folga de
// seguranca) pra sair inteira, sem cortar palavra. O usuario cola uma cena
// de cada vez no Gemini e depois junta os clipes em ordem no CapCut.
export async function buildGeminiVideoScenes(
  offerId: string,
  options: GeminiPromptOptions = {},
): Promise<{ scenes: GeminiVideoScene[]; productName: string; imageUrl: string | null }> {
  const briefing = await buildBriefingFromOffer(offerId);
  const benefits = parseBenefitLines(briefing.product_benefits);

  const format = pickOption(GEMINI_FORMAT_OPTIONS, options.format);
  const lighting = pickOption(GEMINI_LIGHTING_OPTIONS, options.lighting);
  const angle = pickOption(GEMINI_ANGLE_OPTIONS, options.angle);

  const priceLine = briefing.product_discount
    ? `de R$ ${briefing.competitor_price ?? "?"} por R$ ${briefing.product_price} (${briefing.product_discount})`
    : `por R$ ${briefing.product_price}`;

  const benefitsSpoken = capWords(
    benefits
      .slice(0, 2)
      .map((benefit) => benefit.replace(/\.+\s*$/, ""))
      .join(". "),
  );

  const painLine = capWords(briefing.product_pain);
  const ctaLine = capWords(
    `Só R$ ${briefing.product_price}${briefing.product_discount ? `, ${briefing.product_discount}` : ""}! Corre no link da Radar Smart antes que acabe.`,
  );

  const imageUrl = briefing.product_image_urls?.[0] ?? null;

  const productLine = [
    `Produto: ${briefing.product_name}${briefing.product_category ? ` (categoria: ${briefing.product_category})` : ""}. Preço: ${priceLine}.`,
    imageUrl
      ? `IMPORTANTE: anexe a imagem de referência do produto (baixada em ${imageUrl}) ao gerar esta cena — o produto na cena precisa ser visualmente igual ao da imagem anexada, não um produto genérico inventado.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const totalScenes = 4;

  const scene1: GeminiVideoScene = {
    label: "Cena 1 — Abertura (gancho)",
    durationHint: "~7-8 segundos",
    prompt: [
      ...sceneSetupBlock({ index: 1, total: totalScenes, format, lighting, angle }),
      ``,
      productLine,
      ``,
      `Ela fala isso em português, com naturalidade (não parece estar lendo), em no máximo 7-8 segundos, terminando a frase dentro desse tempo, tom de cumplicidade sobre a dor do cliente:`,
      `"${painLine}"`,
    ].join("\n"),
  };

  const scene2: GeminiVideoScene = {
    label: "Cena 2 — Benefícios",
    durationHint: "~7-8 segundos",
    prompt: [
      ...sceneSetupBlock({ index: 2, total: totalScenes, format, lighting, angle }),
      ``,
      productLine,
      ``,
      `Ela fala isso em português, com naturalidade, em no máximo 7-8 segundos, contando os benefícios como quem dá uma dica pra amiga:`,
      `"${benefitsSpoken}"`,
    ].join("\n"),
  };

  const scene3: GeminiVideoScene = {
    label: "Cena 3 — Preço e chamada para ação",
    durationHint: "~7-8 segundos",
    prompt: [
      ...sceneSetupBlock({ index: 3, total: totalScenes, format, lighting, angle }),
      ``,
      productLine,
      ``,
      `Ela fala isso em português, com naturalidade, em no máximo 7-8 segundos, empolgada, com o preço em destaque:`,
      `"${ctaLine}"`,
      ``,
      `Texto na tela: preço em destaque (${priceLine}) aparece sobreposto enquanto ela fala.`,
    ].join("\n"),
  };

  const scene4: GeminiVideoScene = {
    label: "Cena 4 — Encerramento (logo)",
    durationHint: "~2-3 segundos",
    prompt: [
      `Cena ${totalScenes} de ${totalScenes} de um vídeo publicitário gerado em partes — a cena final, só o card de encerramento (sem pessoa).`,
      `Vídeo vertical (9:16), ~2-3 segundos, sem fala, sem música com letra (instrumental leve ou silêncio).`,
      ``,
      OUTRO_BRAND_CARD,
    ].join("\n"),
  };

  return {
    scenes: [scene1, scene2, scene3, scene4],
    productName: briefing.product_name,
    imageUrl,
  };
}
