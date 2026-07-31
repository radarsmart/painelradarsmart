function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export type BrandModelInput = {
  title: string;
  category?: string | null;
  marketplace?: string | null;
  knownBrand?: string | null;
};

export type BrandModelResult = {
  brand: string | null;
  model: string | null;
};

function buildSystemPrompt(hasKnownBrand: boolean): string {
  return [
    "Voce e um assistente de catalogacao de produtos de e-commerce.",
    "Sua tarefa e extrair marca e modelo a partir do titulo de um anuncio real.",
    "",
    "Regras obrigatorias:",
    "- Retorne APENAS JSON valido, sem markdown e sem blocos de codigo.",
    "- NUNCA invente marca ou modelo que nao esteja implicito no titulo. Se nao tiver certeza, retorne null nesse campo.",
    "- Marca deve ser o nome comercial da marca (ex: 'Samsung', 'Xiaomi', 'Nike'), nao a categoria do produto.",
    "- Modelo deve ser o identificador especifico do produto (ex: 'Galaxy S25 256GB', 'Redmi Note 13 Pro'), sem incluir cor/variacao irrelevante para comparacao de preco, quando possivel.",
    "- Produtos genericos sem marca conhecida (ex: itens de bazar, artesanato, genericos) devem retornar brand: null e model: null.",
    hasKnownBrand
      ? "- A marca ja foi identificada por outra fonte e sera fornecida no input; extraia APENAS o modelo, sem repetir ou alterar a marca fornecida."
      : "",
    "",
    "Formato de saida obrigatorio:",
    "{",
    '  "brand": "string ou null",',
    '  "model": "string ou null"',
    "}",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildUserPrompt(input: BrandModelInput): string {
  return [
    `Titulo do anuncio: ${normalizeWhitespace(input.title)}`,
    input.category ? `Categoria: ${normalizeWhitespace(input.category)}` : "",
    input.marketplace ? `Marketplace: ${normalizeWhitespace(input.marketplace)}` : "",
    input.knownBrand ? `Marca ja identificada: ${normalizeWhitespace(input.knownBrand)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
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
        temperature: 0.1,
        max_tokens: 200,
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

    const content = toText(payload.choices?.[0]?.message?.content ?? "");
    if (!content) {
      throw new Error("OpenAI nao retornou conteudo utilizavel.");
    }

    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      throw new Error("OpenAI retornou JSON invalido para extracao de marca/modelo.");
    }
  }

  throw lastError ?? new Error("Falha ao extrair marca/modelo com OpenAI.");
}

function normalizeField(value: unknown): string | null {
  const text = toText(value);
  if (!text || text.toLowerCase() === "null") return null;
  return text;
}

/**
 * Extrai marca e modelo a partir do titulo de um produto via IA.
 * Nunca lanca por dado ausente/incerto — retorna null nos campos quando nao ha confianca.
 * Falhas de rede/API tambem retornam null (extracao de marca/modelo e um enriquecimento
 * opcional, nunca deve bloquear o fluxo principal de extracao/salvamento de oferta).
 */
export async function extractBrandModel(input: BrandModelInput): Promise<BrandModelResult> {
  const title = toText(input.title);
  if (!title) {
    return { brand: input.knownBrand ? normalizeField(input.knownBrand) : null, model: null };
  }

  const apiKey = toText(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    return { brand: input.knownBrand ? normalizeField(input.knownBrand) : null, model: null };
  }

  try {
    const hasKnownBrand = !!toText(input.knownBrand);
    const raw = await requestOpenAIJson({
      apiKey,
      model: toText(process.env.OPENAI_BRAND_MODEL_EXTRACTION_MODEL) || "gpt-4o-mini",
      systemPrompt: buildSystemPrompt(hasKnownBrand),
      userPrompt: buildUserPrompt(input),
    });

    return {
      brand: hasKnownBrand ? normalizeField(input.knownBrand) : normalizeField(raw.brand),
      model: normalizeField(raw.model),
    };
  } catch {
    return { brand: input.knownBrand ? normalizeField(input.knownBrand) : null, model: null };
  }
}
