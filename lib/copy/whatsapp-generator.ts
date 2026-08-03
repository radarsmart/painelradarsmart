export interface OfferCopyInput {
  title: string;
  price: number;
  original_price?: number;
  discount_pct?: number;
  coupon_code?: string;
  coupon_discount?: number;
  coupon_description?: string;
  installment_count?: number;
  installment_amount?: number;
  installment_interest_free?: boolean;
  affiliate_url: string;
  image_url?: string;
  category?: string;
  marketplace: string;
  rating?: number;
  reviews_count?: number;
  extra_instructions?: string;
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

type CopyFields = {
  headline: string;
  product_line: string;
  highlight: string;
  benefit_bullets: string[];
  cta_line: string;
  closing_line: string;
};

const CTA_LINK_PHRASE = "Não perca essa oportunidade! Clique aqui:";

function buildPriceBlock(
  price: number,
  originalPrice: number | null,
  discountPct: number | null,
  offer: OfferCopyInput,
): string {
  const lines: string[] = [];

  if (originalPrice && originalPrice > price) {
    const pct = discountPct ?? Math.round(((originalPrice - price) / originalPrice) * 100);
    lines.push(
      `💰 De: ~${formatMoney(originalPrice)}~`,
      `✅ Por: *${formatMoney(price)}*`,
      `🔥 Desconto: ${formatPercent(pct)}`,
    );
  } else {
    lines.push(`✅ Por: *${formatMoney(price)}*`);
  }

  if (offer.installment_count && offer.installment_amount) {
    const suffix = offer.installment_interest_free ? " sem juros" : "";
    lines.push(`💳 ou ${offer.installment_count}x de ${formatMoney(offer.installment_amount)}${suffix}`);
  }

  if (offer.coupon_code) {
    lines.push(`🏷️ Cupom: *${offer.coupon_code}*`);
  }

  return lines.join("\n");
}

function buildCtaLinkBlock(link: string): string {
  return `${CTA_LINK_PHRASE}\n${link}`;
}

function assembleVariant(
  depth: "short" | "medium" | "long",
  fields: CopyFields,
  priceBlock: string,
  ctaLinkBlock: string,
): string {
  if (depth === "short") {
    return [fields.headline, "", priceBlock, "", fields.cta_line, ctaLinkBlock].join("\n");
  }

  if (depth === "medium") {
    return [
      fields.headline,
      "",
      fields.product_line,
      fields.highlight,
      "",
      priceBlock,
      "",
      fields.cta_line,
      ctaLinkBlock,
    ].join("\n");
  }

  return [
    fields.headline,
    "",
    fields.product_line,
    fields.highlight,
    "",
    priceBlock,
    "",
    fields.benefit_bullets.join("\n"),
    "",
    fields.cta_line,
    ctaLinkBlock,
    "",
    fields.closing_line,
  ].join("\n");
}

function buildSystemPrompt(): string {
  return [
    "Voce e um estrategista de marketing de performance e copywriter senior da Radar Smart, especialista em anuncios de afiliado que realmente vendem em canais de ofertas do Telegram e grupos de WhatsApp.",
    "",
    "Antes de escrever, analise o produto, o publico provavel e o contexto de uso, e decida qual abordagem de abertura vai gerar mais desejo de compra PARA ESSE produto especifico. Voce tem liberdade total para escolher a estrategia: chamada direta ao publico (ex: \"Atenção, [publico]!\"), pergunta provocativa, urgencia, curiosidade, beneficio direto, prova social, entre outras. Nao repita sempre a mesma formula de abertura entre ofertas diferentes — varie conforme o que funciona melhor para cada caso, como um profissional de marketing faria ao analisar cada produto individualmente.",
    "",
    "Voce NUNCA escreve preco, valor em R$, percentual de desconto, cupom, parcelamento ou a URL/link — esses blocos sao montados automaticamente pelo sistema com base nos dados reais da oferta, logo apos as linhas que voce gerar. Use os dados de preco apenas para calibrar o tom (produto caro vs. barato), nunca como texto literal.",
    "",
    "Retorne APENAS JSON valido, sem markdown e sem blocos de codigo, no formato:",
    "{",
    '  "headline": "1 linha com 1 emoji no inicio (pode fechar com outro emoji), a abertura que voce escolheu como mais eficaz para esse produto",',
    '  "product_line": "1 linha com 1 emoji no inicio, apresentando o produto de forma chamativa (pode usar *negrito* no nome)",',
    '  "highlight": "1 linha com 1 emoji no inicio, destacando um diferencial ou funcionalidade concreta do produto",',
    '  "benefit_bullets": ["1 linha com 1 emoji no inicio, um beneficio concreto", "opcional: uma segunda linha com outro beneficio, publico especifico ou uso pratico"],',
    '  "cta_line": "1 linha com 1 emoji no inicio, frase de desejo/beneficio que antecede o link (evite comecar com \\"nao perca\\", pois a linha fixa que vem logo depois ja cobre a urgencia de clicar)",',
    '  "closing_line": "1 linha com 1 emoji no inicio, frase curta e calorosa de fechamento"',
    "}",
    "",
    "Regras obrigatorias:",
    "- Escreva em portugues do Brasil, tom humano e conversacional, como indicacao de amigo — nunca robotico.",
    "- Cada campo (e cada item de benefit_bullets) e uma unica linha (sem quebras internas), comecando com exatamente 1 emoji relevante ao conteudo daquela linha.",
    "- benefit_bullets deve ter 1 ou 2 itens, nunca mais que isso.",
    "- Varie os emojis entre os campos — nunca repita o mesmo emoji em campos diferentes da mesma resposta.",
    "- NUNCA escreva preco, R$, %, desconto, cupom, parcelamento, \"economia\" ou a URL/link no texto.",
    "- Personalize a chamada com base no produto, na categoria e no contexto de uso — nunca use um template generico igual para qualquer produto.",
    "- Nao invente dados: frete, estoque, avaliacoes ou garantias so se estiverem no input.",
    "- Se houver rating e reviews_count, pode citar como prova social qualitativa (ex: \"aprovado por quem ja comprou\") sem inventar numeros que nao foram informados.",
    "- Gere urgencia sem mentir.",
    "- Nao incluir assinatura final, rodape de marca ou texto como _Curadoria Radar Smart_.",
    "- O texto precisa funcionar tanto para WhatsApp quanto Telegram.",
  ].join("\n");
}

function buildUserPrompt(offer: OfferCopyInput): string {
  const originalPrice = computeOriginalPrice(offer);
  const discountPct = computeDiscountPct(offer, originalPrice);
  const context = inferProductContext(offer);

  return [
    "Analise a oferta abaixo como um estrategista de marketing e crie os campos de copy que vao gerar mais desejo de compra para ESSE produto, seguindo o formato JSON do system prompt (headline, product_line, highlight, benefit_bullets, cta_line, closing_line).",
    "Lembre-se: NAO escreva preco, R$, % de desconto, cupom ou a URL no texto — isso e montado automaticamente pelo sistema em blocos separados.",
    "",
    "DADOS DA OFERTA (apenas para calibrar o tom — nao escrever os valores no texto):",
    `- Título: ${offer.title}`,
    `- Faixa de preço: ${formatMoney(offer.price)}`,
    `- Havia desconto: ${discountPct ? `sim, aproximadamente ${formatPercent(discountPct)}` : "não"}`,
    `- Cupom disponível: ${offer.coupon_code ? "sim" : "não"}`,
    `- Categoria: ${offer.category || "não informada"}`,
    `- Marketplace: ${offer.marketplace}`,
    `- Avaliação: ${typeof offer.rating === "number" ? offer.rating.toFixed(1) : "não informada"}`,
    `- Número de avaliações: ${typeof offer.reviews_count === "number" ? formatNumber(offer.reviews_count) : "não informado"}`,
    "",
    "CONTEXTO INFERIDO (use como referencia, nao como camisa de forca):",
    `- Público provável: ${context.audience}`,
    `- Problema que resolve: ${context.problem}`,
    `- Gatilho emocional principal: ${context.trigger}`,
    `- Contexto de uso no dia a dia brasileiro: ${context.dailyContext}`,
    `- Exemplos de abertura possíveis (inspiração, não copie literalmente): ${context.openingHints.join(" | ")}`,
    "",
    "REGRAS DE COPY:",
    "- headline precisa parecer natural e específica para o produto, não genérica — escolha a abordagem (chamada ao público, pergunta, urgência, curiosidade, benefício direto etc.) que combina melhor com esse produto e público.",
    "- Use o nome do produto em negrito com asteriscos quando citar: *nome do produto*.",
    "- product_line e highlight juntas devem apresentar o produto e seu principal diferencial.",
    "- benefit_bullets deve trazer 1 ou 2 detalhes extras e concretos (não repita o que já foi dito em highlight).",
    "- cta_line deve gerar desejo genuíno pelo benefício do produto, preparando para o link que vem logo depois (a linha fixa seguinte já diz \"Não perca essa oportunidade! Clique aqui:\", então evite repetir essa mesma ideia em cta_line).",
    "- closing_line deve ser curta e emocional, reforçando o benefício final.",
    ...(offer.extra_instructions
      ? ["", "ORIENTAÇÃO EXTRA DO ANUNCIANTE (siga junto com as regras acima):", offer.extra_instructions]
      : []),
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

function normalizeField(value: unknown): string {
  return stripBrandSignature(normalizeWhitespace(toText(value)));
}

function stripBrandSignature(value: string): string {
  return value
    .replace(/_?\s*curadoria\s+radar\s+smart_?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeFieldList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .map((item) => normalizeField(item))
    .filter(Boolean)
    .slice(0, 2);
}

function normalizeCopyOutput(
  raw: Record<string, unknown>,
  offer: OfferCopyInput,
): WhatsAppCopyVariants {
  const fields: CopyFields = {
    headline: normalizeField(raw.headline ?? raw.hook ?? ""),
    product_line: normalizeField(raw.product_line ?? ""),
    highlight: normalizeField(raw.highlight ?? ""),
    benefit_bullets: normalizeFieldList(raw.benefit_bullets ?? raw.benefit_bullet),
    cta_line: normalizeField(raw.cta_line ?? ""),
    closing_line: normalizeField(raw.closing_line ?? ""),
  };

  if (
    !fields.headline ||
    !fields.product_line ||
    !fields.highlight ||
    !fields.benefit_bullets.length ||
    !fields.cta_line ||
    !fields.closing_line
  ) {
    throw new Error("Resposta de copy incompleta.");
  }

  const originalPrice = computeOriginalPrice(offer);
  const discountPct = computeDiscountPct(offer, originalPrice);
  const priceBlock = buildPriceBlock(offer.price, originalPrice, discountPct, offer);
  const ctaLinkBlock = buildCtaLinkBlock(offer.affiliate_url);

  const hook = fields.headline;
  const short = assembleVariant("short", fields, priceBlock, ctaLinkBlock);
  const medium = assembleVariant("medium", fields, priceBlock, ctaLinkBlock);
  const long = assembleVariant("long", fields, priceBlock, ctaLinkBlock);

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

  return normalizeCopyOutput(raw, normalizedOffer);
}
