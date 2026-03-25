type ProductSEOInput = {
  title: string;
  category: string;
  price: number;
  features?: string[];
};

type ProductSEOResult = {
  seo_title: string;
  slug: string;
  meta_description: string;
  content_snippet: string;
  keywords: string[];
  source: "heuristic" | "ai";
};

type ProductSEOOptions = {
  generateText?: (prompt: string) => Promise<string>;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function slugify(value: string): string {
  return toText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function trimToLimit(value: string, limit: number): string {
  const normalized = toText(value);
  if (normalized.length <= limit) return normalized;

  const sliced = normalized.slice(0, limit + 1);
  const breakpoint = Math.max(sliced.lastIndexOf(" "), sliced.lastIndexOf("-"));
  return toText((breakpoint > Math.floor(limit * 0.6) ? sliced.slice(0, breakpoint) : sliced.slice(0, limit)).trim());
}

function splitKeywords(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean);
  }

  return toText(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractJsonCandidate(raw: string): Record<string, unknown> | null {
  const normalized = toText(raw);
  if (!normalized) return null;

  const candidates = [normalized];
  const firstBrace = normalized.indexOf("{");
  const lastBrace = normalized.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(normalized.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      // noop
    }
  }

  return null;
}

function buildBaseKeywords(input: ProductSEOInput): string[] {
  const titleSlug = slugify(input.title).split("-").filter(Boolean);
  const shortPhrase = titleSlug.slice(0, 4).join(" ");
  const compactPhrase = titleSlug.slice(0, 3).join(" ");
  const category = slugify(input.category).replace(/-/g, " ");
  const firstFeature = toText(input.features?.[0]).toLowerCase();

  const candidates = [
    compactPhrase,
    shortPhrase ? `${shortPhrase} barato` : "",
    category ? `${category} promocao` : "",
    compactPhrase ? `comprar ${compactPhrase}` : "",
    firstFeature ? `${compactPhrase} ${firstFeature}` : "",
    compactPhrase ? `melhor preco ${compactPhrase}` : "",
  ];

  return Array.from(
    new Set(
      candidates
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => trimToLimit(item, 32)),
    ),
  ).slice(0, 5);
}

function buildHeuristicSEO(input: ProductSEOInput): ProductSEOResult {
  const category = toText(input.category) || "produto";
  const priceText = Number.isFinite(input.price) ? `R$ ${input.price.toFixed(2).replace(".", ",")}` : "";
  const keywords = buildBaseKeywords(input);
  const shortTitle = trimToLimit(input.title, 36);
  const slugBase = slugify(`melhor-preco-${input.title}`).split("-").slice(0, 8).join("-");
  const featureText = input.features?.filter(Boolean).slice(0, 2).join(" e ") || "bom custo-beneficio";

  return {
    seo_title: trimToLimit(`${shortTitle} com melhor preco no Radar Smart`, 60),
    slug: slugBase || slugify(input.title),
    meta_description: trimToLimit(
      `${shortTitle} por ${priceText}. Veja vantagens, ficha rapida e se vale a pena comprar agora no Radar Smart.`,
      150,
    ),
    content_snippet: trimToLimit(
      `O ${shortTitle} se destaca na categoria ${category} por entregar ${featureText}. Com preco atual de ${priceText}, entra como opcao forte para quem busca compra inteligente e oferta valida agora.`,
      260,
    ),
    keywords,
    source: "heuristic",
  };
}

async function generateWithConfiguredEndpoint(
  prompt: string,
): Promise<string | null> {
  const endpoint = toText(process.env.SEO_GENERATOR_ENDPOINT);
  if (!endpoint) return null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const apiKey = toText(process.env.SEO_GENERATOR_API_KEY);
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ prompt }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Falha ao chamar endpoint SEO AI (HTTP ${response.status}).`);
  }

  return response.text();
}

function normalizeSEOResult(
  payload: Record<string, unknown>,
  fallback: ProductSEOResult,
): ProductSEOResult {
  const seoTitle = trimToLimit(toText(payload.seo_title) || fallback.seo_title, 60);
  const slug = slugify(toText(payload.slug) || fallback.slug) || fallback.slug;
  const metaDescription = trimToLimit(
    toText(payload.meta_description) || fallback.meta_description,
    150,
  );
  const contentSnippet = trimToLimit(
    toText(payload.content_snippet) || fallback.content_snippet,
    260,
  );
  const keywords = splitKeywords(payload.keywords);

  return {
    seo_title: seoTitle,
    slug,
    meta_description: metaDescription,
    content_snippet: contentSnippet,
    keywords: keywords.length ? keywords.slice(0, 5) : fallback.keywords,
    source: "ai",
  };
}

export function buildProductSEOPrompt(productData: ProductSEOInput): string {
  return `
    Voce e um especialista em SEO e Copywriting para e-commerce.
    Otimize o seguinte produto para o blog "Radar Smart":

    Produto: ${productData.title}
    Categoria: ${productData.category}
    Preco: R$ ${productData.price}
    Caracteristicas: ${productData.features?.join(", ") || ""}

    Retorne APENAS um JSON com:
    - seo_title: Um titulo atraente com ate 60 caracteres.
    - slug: Uma URL amigavel (ex: melhor-preco-iphone-15-pro).
    - meta_description: Um resumo de 150 caracteres para o Google.
    - content_snippet: Um paragrafo de 3 linhas destacando por que vale a pena comprar.
    - keywords: 5 palavras-chave separadas por virgula.
  `.trim();
}

export async function generateProductSEO(
  productData: ProductSEOInput,
  options: ProductSEOOptions = {},
): Promise<ProductSEOResult> {
  const fallback = buildHeuristicSEO(productData);
  const prompt = buildProductSEOPrompt(productData);

  let rawResponse: string | null = null;

  if (options.generateText) {
    rawResponse = await options.generateText(prompt);
  } else {
    rawResponse = await generateWithConfiguredEndpoint(prompt);
  }

  if (!rawResponse) {
    return fallback;
  }

  const parsed = extractJsonCandidate(rawResponse);
  if (!parsed) {
    return fallback;
  }

  return normalizeSEOResult(parsed, fallback);
}

export type { ProductSEOInput, ProductSEOResult };
