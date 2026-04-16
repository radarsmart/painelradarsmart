export interface OfferCopyInput {
  title: string;
  price: number;
  original_price?: number;
  discount_pct?: number;
  coupon_code?: string;
  coupon_discount?: number;
  affiliate_url: string;
  image_url?: string;
  category?: string;
  marketplace: string;
  rating?: number;
  reviews_count?: number;
}

export type WhatsAppCopyVariants = {
  hook: string;
  short: string;
  medium: string;
  long: string;
  message: string;
  full_text: string;
};

type ProductContext = {
  audience: string;
  problem: string;
  trigger: string;
  dailyContext: string;
  openingHints: string[];
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function inferProductContext(offer: OfferCopyInput): ProductContext {
  const raw = `${offer.title} ${offer.category ?? ""}`.toLowerCase();

  const contextMap: Array<{
    test: RegExp;
    audience: string;
    problem: string;
    trigger: string;
    dailyContext: string;
    openingHints: string[];
  }> = [
    {
      test: /(academ|fitness|muscul|treino|corrida|bike|esporte|sport)/i,
      audience: "quem treina, curte esporte ou quer evoluir no desempenho",
      problem: "precisa de algo que ajude a melhorar rotina, conforto ou performance",
      trigger: "desejo e praticidade",
      dailyContext: "treino, atividade física e rotina corrida",
      openingHints: [
        "Pra quem treina e gosta de sentir diferença de verdade...",
        "Se você leva esporte a sério, olha isso aqui...",
        "Pra quem não abre mão de praticidade no treino...",
      ],
    },
    {
      test: /(casa|lar|cozinha|limpeza|organiza|organizador|utensil|domest)/i,
      audience: "quem cuida da casa e quer praticidade no dia a dia",
      problem: "quer ganhar tempo, organização e menos esforço nas tarefas",
      trigger: "praticidade e necessidade",
      dailyContext: "casa, cozinha, limpeza e rotina doméstica",
      openingHints: [
        "Pra facilitar a vida em casa...",
        "Quem ama deixar tudo mais prático vai curtir isso...",
        "Se a rotina da casa anda puxada, isso pode ajudar demais...",
      ],
    },
    {
      test: /(celular|smartphone|fone|headphone|tablet|notebook|tecn|tech|gadget|eletr)/i,
      audience: "quem vive conectado e usa tecnologia o dia inteiro",
      problem: "quer resolver um problema do celular, melhorar uso ou economizar",
      trigger: "necessidade e economia",
      dailyContext: "trabalho, estudo, mobilidade e uso do celular no dia a dia",
      openingHints: [
        "Pra quem vive com o celular na mão...",
        "Se você usa tecnologia o dia inteiro, olha essa dica...",
        "Pra quem gosta de resolver tudo com praticidade...",
      ],
    },
    {
      test: /(beleza|skincare|pele|cabelo|maquiagem|estet|perfume|cosm)/i,
      audience: "quem cuida da aparência e gosta de autocuidado",
      problem: "quer melhorar a rotina de beleza sem complicar",
      trigger: "desejo e autoestima",
      dailyContext: "autocuidado, beleza e rotina prática",
      openingHints: [
        "Dica de ouro pra quem cuida da pele...",
        "Se beleza é prioridade pra você, presta atenção nisso...",
        "Pra quem gosta de se cuidar sem perder tempo...",
      ],
    },
    {
      test: /(beb[eê]|infantil|crian|matern|patern)/i,
      audience: "famílias que precisam de soluções úteis e seguras",
      problem: "quer mais tranquilidade, praticidade e economia",
      trigger: "necessidade e segurança",
      dailyContext: "rotina com filhos, casa e organização",
      openingHints: [
        "Pra quem vive a correria da família...",
        "Se você procura algo útil pro dia a dia em casa...",
        "Uma dica que pode facilitar a rotina com a família...",
      ],
    },
  ];

  const matched = contextMap.find((item) => item.test.test(raw));
  if (matched) {
    return matched;
  }

  return {
    audience: "quem quer comprar melhor e gastar menos",
    problem: "quer achar uma oferta boa sem perder tempo",
    trigger: "economia",
    dailyContext: "compras do dia a dia, presente, uso pessoal ou da casa",
    openingHints: [
      "Olha essa oportunidade rapidinho...",
      "Se você gosta de pagar menos, vale conferir isso...",
      "Uma oferta boa que vale a atenção...",
    ],
  };
}

function computeOriginalPrice(offer: OfferCopyInput): number | null {
  if (typeof offer.original_price === "number" && offer.original_price > offer.price) {
    return offer.original_price;
  }

  if (
    typeof offer.discount_pct === "number" &&
    offer.discount_pct > 0 &&
    offer.discount_pct < 100
  ) {
    const inferred = offer.price / (1 - offer.discount_pct / 100);
    return Number.isFinite(inferred) && inferred > offer.price ? inferred : null;
  }

  return null;
}

function computeDiscountPct(offer: OfferCopyInput, originalPrice: number | null): number | null {
  if (typeof offer.discount_pct === "number" && offer.discount_pct > 0) {
    return clamp(offer.discount_pct, 0, 99);
  }

  if (originalPrice && originalPrice > offer.price) {
    return clamp(((originalPrice - offer.price) / originalPrice) * 100, 0, 99);
  }

  return null;
}

function computeSavings(offer: OfferCopyInput, originalPrice: number | null): number | null {
  if (typeof offer.coupon_discount === "number" && offer.coupon_discount > 0) {
    return offer.coupon_discount;
  }

  if (originalPrice && originalPrice > offer.price) {
    return originalPrice - offer.price;
  }

  return null;
}

function buildSystemPrompt(): string {
  return [
    "Voce e um especialista em copy para WhatsApp e Telegram da Radar Smart.",
    "Sua tarefa e criar mensagens personalizadas, humanas e persuasivas, prontas para copiar e colar.",
    "",
    "Regras obrigatorias:",
    "- Escreva em portugues do Brasil.",
    "- Retorne APENAS JSON valido, sem markdown e sem blocos de codigo.",
    "- Nunca use abertura generica ou template repetido.",
    "- Personalize a chamada com base no produto, na categoria e no contexto de uso.",
    "- A mensagem deve soar como uma indicacao de amigo, nao como anuncio robotico.",
    "- Nao invente dados: frete, estoque, avaliacoes, cupons ou descontos so se estiverem no input.",
    "- Se houver original_price, mostre economia em R$ e percentual.",
    "- Se houver coupon_code, inclua o cupom e o beneficio do desconto apenas se estiver informado.",
    "- Se houver rating e reviews_count, inclua uma linha curta de prova social apenas se fizer sentido.",
    "- Use emojis com moderação.",
    "- Gere urgencia sem mentir.",
    "- O CTA final deve apontar para Radar Smart e o link afiliado.",
    "- Nao incluir assinatura final, rodape de marca ou texto como _Curadoria Radar Smart_.",
    "- O texto precisa funcionar para WhatsApp e Telegram.",
    "",
    "Formato de saida obrigatorio:",
    "{",
    '  "hook": "string curta e forte",',
    '  "short": "versao curta para status/stories",',
    '  "medium": "versao media para grupos",',
    '  "long": "versao longa para canal/telegram"',
    "}",
  ].join("\n");
}

function buildUserPrompt(offer: OfferCopyInput): string {
  const originalPrice = computeOriginalPrice(offer);
  const discountPct = computeDiscountPct(offer, originalPrice);
  const savings = computeSavings(offer, originalPrice);
  const context = inferProductContext(offer);

  const outputStructure = [
    "🎯 [CHAMADA PERSONALIZADA DO PRODUTO]",
    "",
    "*[NOME DO PRODUTO]*",
    "",
    "[DESCRICAO CURTA E HUMANA - 1-2 linhas]",
    "",
    `💰 De: ${originalPrice ? `~${formatMoney(originalPrice)}` : "não informado"}`,
    `✅ Por: ${formatMoney(offer.price)}`,
    savings
      ? `📉 Economia de ${formatMoney(savings)}${discountPct ? ` (${formatPercent(discountPct)} OFF)` : ""}`
      : "",
    offer.coupon_code ? `🏷️ Cupom: ${offer.coupon_code}` : "",
    offer.coupon_code && typeof offer.coupon_discount === "number" && offer.coupon_discount > 0
      ? `💡 Aplique no checkout e garanta mais ${formatMoney(offer.coupon_discount)} de desconto!`
      : "",
    typeof offer.rating === "number" && typeof offer.reviews_count === "number"
      ? `⭐ ${offer.rating.toFixed(1)} estrelas • ${formatNumber(offer.reviews_count)} avaliações`
      : "",
    "",
    "⚡ Estoque limitado — garanta o seu agora!",
    "",
    `👉 ${offer.affiliate_url}`,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    "Crie 3 versões de copy para a oferta abaixo.",
    "",
    "DADOS DA OFERTA:",
    `- Título: ${offer.title}`,
    `- Preço atual: ${formatMoney(offer.price)}`,
    `- Preço original: ${originalPrice ? formatMoney(originalPrice) : "não informado"}`,
    `- Desconto percentual: ${discountPct ? formatPercent(discountPct) : "não informado"}`,
    `- Cupom: ${offer.coupon_code || "não informado"}`,
    `- Valor do cupom: ${offer.coupon_discount ? formatMoney(offer.coupon_discount) : "não informado"}`,
    `- Link afiliado: ${offer.affiliate_url}`,
    `- Imagem: ${offer.image_url || "não informada"}`,
    `- Categoria: ${offer.category || "não informada"}`,
    `- Marketplace: ${offer.marketplace}`,
    `- Avaliação: ${typeof offer.rating === "number" ? offer.rating.toFixed(1) : "não informada"}`,
    `- Número de avaliações: ${typeof offer.reviews_count === "number" ? formatNumber(offer.reviews_count) : "não informado"}`,
    "",
    "CONTEXTO INFERIDO:",
    `- Público provável: ${context.audience}`,
    `- Problema que resolve: ${context.problem}`,
    `- Gatilho emocional principal: ${context.trigger}`,
    `- Contexto de uso no dia a dia brasileiro: ${context.dailyContext}`,
    `- Sugestões de abertura: ${context.openingHints.join(" | ")}`,
    "",
    "REGRAS DE COPY:",
    '- A primeira linha precisa parecer natural e específica para o produto.',
    "- Use o nome do produto em negrito com asteriscos: *nome do produto*.",
    "- Destaque benefício, valor economizado e contexto de uso real.",
    "- Se houver avaliação boa, inclua algo como: ⭐ 4,8 estrelas • 120 avaliações.",
    "- Se houver cupom, inclua o bloco do cupom na mensagem.",
    "- Se houver economia, mostre o valor economizado em R$ e não só o percentual.",
    "- O CTA final deve ser curto, direto e convidar para Radar Smart.",
    "- Não repita a mesma abertura entre short, medium e long.",
    "",
    "FORMATAÇÃO DAS VERSÕES:",
    "- hook: 1 linha curta e forte.",
    "- short: 4 a 6 linhas, ideal para Stories/Status.",
    "- medium: 6 a 9 linhas, ideal para grupos de WhatsApp.",
    "- long: 10 a 14 linhas, ideal para canal de Telegram.",
    "",
    "A estrutura abaixo serve como referência, mas a copy final deve ser personalizada e diferente do modelo pronto:",
    outputStructure,
  ].join("\n");
}

async function requestOpenAIJson(params: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<Record<string, unknown>> {
  const modelCandidates = Array.from(
    new Set([params.model, "gpt-4o-mini"].map((value) => toText(value)).filter(Boolean)),
  );

  let lastError: Error | null = null;

  for (const model of modelCandidates) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      cache: "no-store",
      body: JSON.stringify({
        model,
        temperature: 0.82,
        max_tokens: 1800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const error = new Error(
        `OpenAI error: ${response.status}${body ? ` ${body.slice(0, 300)}` : ""}`,
      );
      lastError = error;

      if (![404, 429, 500, 503].includes(response.status)) {
        break;
      }

      continue;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };

    const content = normalizeWhitespace(String(payload.choices?.[0]?.message?.content ?? ""));
    if (!content) {
      throw new Error("OpenAI nao retornou conteudo utilizavel.");
    }

    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      throw new Error("OpenAI retornou JSON invalido para copy do WhatsApp.");
    }
  }

  throw lastError ?? new Error("Falha ao gerar copy com OpenAI.");
}

function normalizeVariant(value: unknown): string {
  return stripBrandSignature(normalizeWhitespace(toText(value)));
}

function stripBrandSignature(value: string): string {
  return value
    .replace(/_?\s*curadoria\s+radar\s+smart_?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeCopyOutput(raw: Record<string, unknown>): WhatsAppCopyVariants {
  const hook = normalizeVariant(raw.hook ?? raw.opening ?? "");
  const short = normalizeVariant(raw.short ?? raw.message_short ?? raw.message ?? "");
  const medium = normalizeVariant(raw.medium ?? raw.message_medium ?? raw.message ?? "");
  const long = normalizeVariant(raw.long ?? raw.full_text ?? raw.message_long ?? raw.message ?? "");

  if (!hook || !short || !medium || !long) {
    throw new Error("Resposta de copy incompleta.");
  }

  return {
    hook,
    short,
    medium,
    long,
    message: medium,
    full_text: long,
  };
}

export async function generateWhatsAppCopy(
  offer: OfferCopyInput,
): Promise<WhatsAppCopyVariants> {
  const apiKey = toText(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY nao configurada.");
  }

  const price = toNumber(offer.price);
  if (price === null || price <= 0) {
    throw new Error("price invalido.");
  }

  const normalizedOffer: OfferCopyInput = {
    ...offer,
    price,
    original_price: toNumber(offer.original_price ?? null) ?? undefined,
    discount_pct: toNumber(offer.discount_pct ?? null) ?? undefined,
    coupon_discount: toNumber(offer.coupon_discount ?? null) ?? undefined,
    rating: toNumber(offer.rating ?? null) ?? undefined,
    reviews_count: toNumber(offer.reviews_count ?? null) ?? undefined,
    title: normalizeWhitespace(offer.title),
    affiliate_url: normalizeWhitespace(offer.affiliate_url),
    marketplace: normalizeWhitespace(offer.marketplace),
    category: normalizeWhitespace(offer.category ?? ""),
    image_url: normalizeWhitespace(offer.image_url ?? ""),
    coupon_code: normalizeWhitespace(offer.coupon_code ?? ""),
  };

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(normalizedOffer);

  const raw = await requestOpenAIJson({
    apiKey,
    model: toText(process.env.OPENAI_WHATSAPP_COPY_MODEL) || "gpt-4o",
    systemPrompt,
    userPrompt,
  });

  return normalizeCopyOutput(raw);
}
