type GeminiPart = {
  text?: string;
};

type GeminiCandidate = {
  content?: {
    parts?: GeminiPart[];
  };
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

export type LandingCopySuggestion = {
  title: string;
  headline: string;
  subheadline: string;
  badge_text: string;
  product_title: string;
  primary_cta_label: string;
  group_cta_label: string;
  site_cta_label: string;
  price_note: string;
  benefits: string[];
  technical_details: string[];
  social_proof: string[];
  disclaimer: string;
  creative_angle: string;
  ad_primary_text: string;
  ad_headline: string;
  ad_description: string;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function extractGeminiText(response: GeminiResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => toText(part.text))
    .filter(Boolean)
    .join("\n");
}

function buildGeminiModelCandidates(primaryModel: string) {
  return Array.from(
    new Set(
      [primaryModel, "gemini-2.0-flash", "gemini-1.5-flash"]
        .map((value) => toText(value))
        .filter(Boolean),
    ),
  );
}

function buildLandingSystemPrompt() {
  return [
    "Voce e um especialista em landing pages de alta conversao para trafego pago no Brasil.",
    "Sua funcao e criar copy objetiva, etica e persuasiva para campanhas de afiliados do Radar Smart.",
    "Regras obrigatorias:",
    "- Escreva em portugues do Brasil com ortografia correta.",
    "- Foque em conversao sem exagero publicitario.",
    "- Nao invente avaliacoes, estrelas, numeros de vendas ou garantias se nao forem fornecidos.",
    "- Nao use claims medicos, juridicos ou enganosos.",
    "- O texto deve ser adequado para paginas mobile-first.",
    "- Retorne apenas JSON valido.",
  ].join("\n");
}

function buildOfferPrompt(params: {
  productName: string;
  price: number;
  oldPrice?: number | null;
  marketplace: string;
}) {
  const discountInfo =
    params.oldPrice && params.oldPrice > params.price
      ? `De: R$ ${params.oldPrice} por: R$ ${params.price}`
      : `Preco: R$ ${params.price}`;

  return [
    "Crie uma copy curta e persuasiva para WhatsApp/Telegram sobre este produto:",
    `Produto: ${params.productName}`,
    `Preco: ${discountInfo}`,
    `Marketplace: ${params.marketplace}`,
    "",
    "Regras:",
    "- Use emojis adequados.",
    '- Comece com um gancho chamativo (ex: "BAIXOU!", "PROMOCAO!", "OPORTUNIDADE").',
    "- Destaque o valor e a facilidade de compra.",
    "- Seja breve (maximo 4 linhas).",
    "- Nao use hashtags.",
    "- Linguagem amigavel e direta (pt-BR).",
  ].join("\n");
}

async function requestGeminiText(params: {
  apiKey: string;
  model: string;
  body: Record<string, unknown>;
}) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${encodeURIComponent(params.apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify(params.body),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Gemini error: ${response.status}${body ? ` ${body.slice(0, 300)}` : ""}`,
    );
  }

  const payload = (await response.json()) as GeminiResponse;
  const content = extractGeminiText(payload);
  if (!content) {
    throw new Error("Gemini nao retornou conteudo utilizavel.");
  }

  return content;
}

async function requestGeminiWithFallback(params: {
  apiKey: string;
  model: string;
  bodyFactory: () => Record<string, unknown>;
}) {
  let lastError: Error | null = null;

  for (const model of buildGeminiModelCandidates(params.model)) {
    try {
      return await requestGeminiText({
        apiKey: params.apiKey,
        model,
        body: params.bodyFactory(),
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Gemini request failed.");
      const message = lastError.message;
      const shouldTryNextModel =
        message.includes("Gemini error: 404") ||
        message.includes("Gemini error: 429") ||
        message.includes("Gemini error: 500") ||
        message.includes("Gemini error: 503");

      if (!shouldTryNextModel) {
        break;
      }
    }
  }

  throw lastError ?? new Error("Falha ao gerar resposta com Gemini.");
}

async function requestOpenAIText(params: {
  system: string;
  prompt: string;
  temperature: number;
  json?: boolean;
}) {
  const apiKey = toText(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    throw new Error("Gemini indisponivel e OPENAI_API_KEY nao configurada.");
  }

  const model = toText(process.env.OPENAI_FALLBACK_MODEL) || "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      model,
      temperature: params.temperature,
      response_format: params.json ? { type: "json_object" } : undefined,
      messages: [
        {
          role: "system",
          content: params.system,
        },
        {
          role: "user",
          content: params.prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `OpenAI fallback error: ${response.status}${body ? ` ${body.slice(0, 300)}` : ""}`,
    );
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const content = toText(payload.choices?.[0]?.message?.content);
  if (!content) {
    throw new Error("OpenAI fallback nao retornou conteudo utilizavel.");
  }

  return content;
}

export async function generateLandingCopyWithGemini(params: {
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<LandingCopySuggestion> {
  try {
    const content = await requestGeminiWithFallback({
      apiKey: params.apiKey,
      model: params.model,
      bodyFactory: () => ({
        systemInstruction: {
          parts: [
            {
              text: buildLandingSystemPrompt(),
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: params.prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              headline: { type: "STRING" },
              subheadline: { type: "STRING" },
              badge_text: { type: "STRING" },
              product_title: { type: "STRING" },
              primary_cta_label: { type: "STRING" },
              group_cta_label: { type: "STRING" },
              site_cta_label: { type: "STRING" },
              price_note: { type: "STRING" },
              benefits: {
                type: "ARRAY",
                items: { type: "STRING" },
              },
              technical_details: {
                type: "ARRAY",
                items: { type: "STRING" },
              },
              social_proof: {
                type: "ARRAY",
                items: { type: "STRING" },
              },
              disclaimer: { type: "STRING" },
              creative_angle: { type: "STRING" },
              ad_primary_text: { type: "STRING" },
              ad_headline: { type: "STRING" },
              ad_description: { type: "STRING" },
            },
            required: [
              "title",
              "headline",
              "subheadline",
              "badge_text",
              "product_title",
              "primary_cta_label",
              "group_cta_label",
              "site_cta_label",
              "price_note",
              "benefits",
              "technical_details",
              "social_proof",
              "disclaimer",
              "creative_angle",
              "ad_primary_text",
              "ad_headline",
              "ad_description",
            ],
          },
        },
      }),
    });

    return JSON.parse(content) as LandingCopySuggestion;
  } catch {
    const content = await requestOpenAIText({
      system: buildLandingSystemPrompt(),
      prompt: params.prompt,
      temperature: 0.7,
      json: true,
    });

    return JSON.parse(content) as LandingCopySuggestion;
  }
}

export async function generateOfferCopyWithGemini(params: {
  apiKey: string;
  model: string;
  productName: string;
  price: number;
  oldPrice?: number | null;
  marketplace: string;
}): Promise<string> {
  try {
    return await requestGeminiWithFallback({
      apiKey: params.apiKey,
      model: params.model,
      bodyFactory: () => ({
        contents: [
          {
            role: "user",
            parts: [{ text: buildOfferPrompt(params) }],
          },
        ],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 200,
        },
      }),
    });
  } catch {
    return requestOpenAIText({
      system:
        "Voce cria copies curtas de afiliados para Radar Smart com tom direto, natural e foco em clique.",
      prompt: buildOfferPrompt(params),
      temperature: 0.8,
    });
  }
}
