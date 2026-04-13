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

function extractText(response: GeminiResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => toText(part.text))
    .filter(Boolean)
    .join("\n");
}

export async function generateLandingCopyWithGemini(params: {
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<LandingCopySuggestion> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${encodeURIComponent(params.apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: [
                "Você é um especialista em landing pages de alta conversão para tráfego pago no Brasil.",
                "Sua função é criar copy objetiva, ética e persuasiva para campanhas de afiliados do Radar Smart.",
                "Regras obrigatórias:",
                "- Escreva em português do Brasil com ortografia correta.",
                "- Foque em conversão sem exagero publicitário.",
                "- Não invente avaliações, estrelas, números de vendas ou garantias se não forem fornecidos.",
                "- Não use claims médicos, jurídicos ou enganosos.",
                "- O texto deve ser adequado para páginas mobile-first.",
                "- Retorne apenas JSON válido.",
              ].join("\n"),
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
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini error: ${response.status}`);
  }

  const payload = (await response.json()) as GeminiResponse;
  const content = extractText(payload);
  if (!content) {
    throw new Error("Gemini não retornou conteúdo utilizável.");
  }

  return JSON.parse(content) as LandingCopySuggestion;
}

export async function generateOfferCopyWithGemini(params: {
  apiKey: string;
  model: string;
  productName: string;
  price: number;
  oldPrice?: number | null;
  marketplace: string;
}): Promise<string> {
  const discountInfo =
    params.oldPrice && params.oldPrice > params.price
      ? `De: R$ ${params.oldPrice} por: R$ ${params.price}`
      : `Preço: R$ ${params.price}`;

  const prompt = [
    `Crie uma copy curta e persuasiva para WhatsApp/Telegram sobre este produto:`,
    `Produto: ${params.productName}`,
    `Preço: ${discountInfo}`,
    `Marketplace: ${params.marketplace}`,
    ``,
    `Regras:`,
    `- Use emojis adequados.`,
    `- Comece com um gancho chamativo (ex: "BAIXOU!", "PROMOÇÃO!", "OPORTUNIDADE").`,
    `- Destaque o valor e a facilidade de compra.`,
    `- Seja breve (máximo 4 linhas).`,
    `- Não use hashtags.`,
    `- Linguagem amigável e direta (pt-BR).`,
  ].join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${encodeURIComponent(params.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 200,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini error: ${response.status}`);
  }

  const payload = (await response.json()) as GeminiResponse;
  return extractText(payload);
}
