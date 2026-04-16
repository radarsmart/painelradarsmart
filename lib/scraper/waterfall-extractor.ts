import { load } from "cheerio";
import { fetch as undiciFetch, ProxyAgent } from "undici";

export type Marketplace = "mercadolivre" | "amazon" | "shopee" | "generic";

export interface ExtractedProduct {
  title: string;
  price: number | null;
  original_price: number | null;
  currency: string;
  image_url: string | null;
  images: string[];
  description: string | null;
  rating: number | null;
  rating_count: number | null;
  seller: string | null;
  category: string | null;
  url: string;
  marketplace: Marketplace;
  extraction_method: string;
  extracted_at: string;
}

export interface ExtractionAttempt {
  method: string;
  success: boolean;
  duration_ms: number;
  error?: string;
}

export interface ExtractionResult {
  success: boolean;
  product: ExtractedProduct | null;
  attempts: ExtractionAttempt[];
  total_duration_ms: number;
}

type PartialProduct = Omit<
  ExtractedProduct,
  "url" | "marketplace" | "extraction_method" | "extracted_at"
>;

type ExtractorLayer = {
  name: string;
  timeoutMs: number;
  fn: (url: string) => Promise<Partial<PartialProduct>>;
};

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const source = String(value).replace(/[^\d,.-]/g, "").trim();
  if (!source) return null;

  const normalized = source.includes(",") && source.includes(".")
    ? source.lastIndexOf(",") > source.lastIndexOf(".")
      ? source.replace(/\./g, "").replace(",", ".")
      : source.replace(/,/g, "")
    : source.includes(",")
      ? source.replace(",", ".")
      : source;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function asArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => toText(item)).filter(Boolean);
}

function sanitizeUrl(value: unknown): string | null {
  const raw = toText(value);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  return null;
}

function parseJsonSafe(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function pickFirst<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function extractMlItemId(url: string): string | null {
  const decoded = decodeURIComponent(url);
  const match =
    decoded.match(/\b(ML[AB]\d{8,14})\b/i) ||
    decoded.match(/\/p\/(ML[AB]\d{8,14})/i) ||
    decoded.match(/\/(ML[AB]\d{8,14})-/i);

  return match?.[1]?.toUpperCase().replace("-", "") ?? null;
}

function normalizeMarketplaceImage(url: string | null, marketplace: Marketplace): string | null {
  if (!url) return null;
  if (marketplace === "mercadolivre") {
    return url
      .replace(/([_-])I\.(jpg|jpeg|png|webp)$/i, "$1F.$2")
      .replace(/-V(?=\.(jpg|jpeg|png|webp)$)/i, "");
  }
  if (marketplace === "amazon") {
    return url.replace(/\._[A-Z0-9,]+_\./gi, ".");
  }
  return url;
}

export function detectMarketplace(url: string): Marketplace {
  const source = toText(url).toLowerCase();
  if (
    source.includes("mercadolivre.com.br") ||
    source.includes("mercadolibre.com") ||
    source.includes("produto.mercadolivre") ||
    source.includes("meli.la") ||
    /ml[ab]\d{8,14}/i.test(source)
  ) {
    return "mercadolivre";
  }
  if (source.includes("amazon.com.br") || source.includes("amazon.com") || source.includes("amzn.to")) {
    return "amazon";
  }
  if (source.includes("shopee.com.br") || source.includes("shopee.com")) {
    return "shopee";
  }
  return "generic";
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${ms}ms`)), ms),
    ),
  ]);
}

async function extractViaMLApi(url: string): Promise<Partial<PartialProduct>> {
  const itemId = extractMlItemId(url);
  if (!itemId) throw new Error("Item ID nao encontrado na URL.");

  const accessToken = toText(process.env.ML_ACCESS_TOKEN);
  const endpoint = `https://api.mercadolibre.com/items/${itemId}`;

  const response = await undiciFetch(endpoint, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });

  if (!response.ok) {
    throw new Error(`ML API ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const pictures = Array.isArray(data.pictures)
    ? (data.pictures as Array<Record<string, unknown>>)
        .map((picture) => sanitizeUrl(picture.secure_url) ?? sanitizeUrl(picture.url))
        .filter((item): item is string => Boolean(item))
    : [];

  const thumb = sanitizeUrl(data.thumbnail) ?? sanitizeUrl(data.secure_thumbnail);
  const imageUrl = pickFirst<string>(pictures[0], thumb);

  return {
    title: toText(data.title),
    price: toMoney(data.price),
    original_price: toMoney(data.original_price),
    currency: toText(data.currency_id) || "BRL",
    image_url: imageUrl,
    images: pictures,
    description: toText(data.title) || null,
    rating: null,
    rating_count: toMoney(data.sold_quantity),
    seller: data.seller_id ? toText(data.seller_id) : null,
    category: toText(data.category_id) || null,
  };
}

async function extractViaCheerio(url: string): Promise<Partial<PartialProduct>> {
  const response = await undiciFetch(url, {
    headers: DEFAULT_HEADERS,
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const $ = load(html);

  const title =
    toText($('meta[property="og:title"]').attr("content")) ||
    toText($('meta[name="title"]').attr("content")) ||
    toText($("h1").first().text()) ||
    toText($("title").first().text());

  const imageUrl =
    sanitizeUrl($('meta[property="og:image"]').attr("content")) ??
    sanitizeUrl($('meta[name="twitter:image"]').attr("content"));

  let price: number | null = null;
  let originalPrice: number | null = null;

  $('script[type="application/ld+json"]').each((_, element) => {
    if (price !== null && originalPrice !== null) return;
    const raw = toText($(element).html());
    const parsed = parseJsonSafe(raw);
    if (!parsed) return;

    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const obj = node as Record<string, unknown>;
      const offers = Array.isArray(obj.offers)
        ? (obj.offers[0] as Record<string, unknown>)
        : obj.offers && typeof obj.offers === "object"
          ? (obj.offers as Record<string, unknown>)
          : obj;

      price = price ?? toMoney(offers.price);
      originalPrice =
        originalPrice ??
        toMoney(offers.highPrice) ??
        toMoney(offers.priceBeforeDiscount) ??
        toMoney(offers.listPrice);
    }
  });

  if (!price) {
    const selectors = [
      '[data-testid="price"]',
      ".price__fraction",
      ".ui-pdp-price__second-line .andes-money-amount__fraction",
      ".a-price .a-offscreen",
      "#priceblock_ourprice",
      ".product-price",
      '[itemprop="price"]',
      ".price",
      ".offer-price",
    ];

    for (const selector of selectors) {
      const value = toMoney($(selector).first().text());
      if (value) {
        price = value;
        break;
      }
    }
  }

  if (!originalPrice) {
    originalPrice =
      toMoney($(".ui-pdp-price__original-value").first().text()) ??
      toMoney($("#priceblock_listprice").first().text()) ??
      toMoney($(".a-text-price .a-offscreen").first().text());
  }

  const description =
    toText($('meta[property="og:description"]').attr("content")) ||
    toText($('meta[name="description"]').attr("content")) ||
    null;

  const rating =
    toMoney($('[itemprop="ratingValue"]').attr("content")) ??
    toMoney($(".a-icon-alt").first().text());
  const ratingCount =
    toMoney($('[itemprop="ratingCount"]').attr("content")) ??
    toMoney($(".ui-pdp-review__amount").first().text());
  const seller =
    toText($("#sellerProfileTriggerId").first().text()) ||
    toText($(".ui-pdp-seller__header__title").first().text()) ||
    null;

  if (!title) {
    throw new Error("Titulo nao encontrado no HTML.");
  }

  return {
    title: title.slice(0, 300),
    price,
    original_price: originalPrice,
    currency: "BRL",
    image_url: imageUrl,
    images: imageUrl ? [imageUrl] : [],
    description,
    rating,
    rating_count: ratingCount,
    seller,
    category: null,
  };
}

async function extractViaFirecrawl(url: string): Promise<Partial<PartialProduct>> {
  const apiKey = toText(process.env.FIRECRAWL_API_KEY);
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY nao configurado.");

  const response = await undiciFetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["extract"],
      extract: {
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            price: { type: "number" },
            original_price: { type: "number" },
            image_url: { type: "string" },
            description: { type: "string" },
            rating: { type: "number" },
            seller: { type: "string" },
          },
          required: ["title"],
        },
      },
    }),
  });

  if (!response.ok) throw new Error(`Firecrawl ${response.status}`);
  const data = (await response.json()) as {
    data?: {
      extract?: Record<string, unknown>;
      json?: Record<string, unknown>;
    };
  };

  const extracted = data.data?.extract ?? data.data?.json;
  if (!extracted || !toText(extracted.title)) {
    throw new Error("Firecrawl nao extraiu titulo.");
  }

  const imageUrl = sanitizeUrl(extracted.image_url);

  return {
    title: toText(extracted.title),
    price: toMoney(extracted.price),
    original_price: toMoney(extracted.original_price),
    currency: "BRL",
    image_url: imageUrl,
    images: imageUrl ? [imageUrl] : [],
    description: toText(extracted.description) || null,
    rating: toMoney(extracted.rating),
    rating_count: null,
    seller: toText(extracted.seller) || null,
    category: null,
  };
}

async function extractViaBrightData(url: string): Promise<Partial<PartialProduct>> {
  const customerId = toText(process.env.BRIGHTDATA_CUSTOMER_ID);
  const zone = toText(process.env.BRIGHTDATA_ZONE) || "web_unlocker";
  const password =
    toText(process.env.BRIGHTDATA_API_KEY) ||
    toText(process.env.BRIGHTDATA_PASSWORD);

  if (!customerId || !password) {
    throw new Error("BRIGHTDATA_CUSTOMER_ID/BRIGHTDATA_API_KEY nao configurados.");
  }

  const proxyAgent = new ProxyAgent(
    `http://brd-customer-${customerId}-zone-${zone}:${password}@brd.superproxy.io:22225`,
  );

  const response = await undiciFetch(url, {
    headers: DEFAULT_HEADERS,
    dispatcher: proxyAgent,
  });

  if (!response.ok) throw new Error(`BrightData fetch ${response.status}`);
  const html = await response.text();
  const $ = load(html);

  const title =
    toText($("#productTitle").first().text()) ||
    toText($('meta[property="og:title"]').attr("content"));
  if (!title) throw new Error("Titulo nao encontrado via BrightData.");

  const price =
    toMoney($(".a-price .a-offscreen").first().text()) ??
    toMoney($("#priceblock_ourprice").first().text()) ??
    toMoney($(".a-price-whole").first().text());

  const imageUrl =
    sanitizeUrl($("#landingImage").attr("src")) ??
    sanitizeUrl($('meta[property="og:image"]').attr("content"));

  return {
    title,
    price,
    original_price: null,
    currency: "BRL",
    image_url: imageUrl,
    images: imageUrl ? [imageUrl] : [],
    description: toText($('meta[name="description"]').attr("content")) || null,
    rating: null,
    rating_count: null,
    seller: toText($("#sellerProfileTriggerId").text()) || null,
    category: null,
  };
}

async function extractViaShopeeApi(url: string): Promise<Partial<PartialProduct>> {
  void url;
  throw new Error("Shopee API: implementar conforme rota existente.");
}

function getLayersForMarketplace(marketplace: Marketplace): ExtractorLayer[] {
  switch (marketplace) {
    case "mercadolivre":
      return [
        { name: "ml_api_official", fn: extractViaMLApi, timeoutMs: 8000 },
        { name: "html_cheerio", fn: extractViaCheerio, timeoutMs: 10000 },
        { name: "firecrawl", fn: extractViaFirecrawl, timeoutMs: 15000 },
      ];
    case "amazon":
      return [
        { name: "html_cheerio", fn: extractViaCheerio, timeoutMs: 10000 },
        { name: "firecrawl", fn: extractViaFirecrawl, timeoutMs: 15000 },
        { name: "brightdata", fn: extractViaBrightData, timeoutMs: 20000 },
      ];
    case "shopee":
      return [
        { name: "shopee_api", fn: extractViaShopeeApi, timeoutMs: 8000 },
        { name: "firecrawl", fn: extractViaFirecrawl, timeoutMs: 15000 },
      ];
    default:
      return [
        { name: "html_cheerio", fn: extractViaCheerio, timeoutMs: 10000 },
        { name: "firecrawl", fn: extractViaFirecrawl, timeoutMs: 15000 },
      ];
  }
}

function hasEnoughData(product: Partial<PartialProduct>): product is PartialProduct {
  return Boolean(toText(product.title)) && (product.price !== null || Boolean(product.image_url));
}

function completeProduct(
  partial: Partial<PartialProduct>,
  url: string,
  marketplace: Marketplace,
  extractionMethod: string,
): ExtractedProduct {
  const image = normalizeMarketplaceImage(sanitizeUrl(partial.image_url), marketplace);
  const images = asArray(partial.images);
  const normalizedImages = Array.from(
    new Set(
      [image, ...images.map((item) => normalizeMarketplaceImage(sanitizeUrl(item), marketplace))]
        .filter((item): item is string => Boolean(item)),
    ),
  );

  return {
    title: toText(partial.title),
    price: partial.price ?? null,
    original_price: partial.original_price ?? null,
    currency: toText(partial.currency) || "BRL",
    image_url: image,
    images: normalizedImages,
    description: toText(partial.description) || null,
    rating: partial.rating ?? null,
    rating_count: partial.rating_count ?? null,
    seller: toText(partial.seller) || null,
    category: toText(partial.category) || null,
    url,
    marketplace,
    extraction_method: extractionMethod,
    extracted_at: new Date().toISOString(),
  };
}

export async function extractProduct(url: string): Promise<ExtractionResult> {
  const startTime = Date.now();
  const sourceUrl = toText(url);
  const marketplace = detectMarketplace(sourceUrl);
  const attempts: ExtractionAttempt[] = [];
  const layers = getLayersForMarketplace(marketplace);

  for (const layer of layers) {
    const layerStart = Date.now();
    try {
      const product = await withTimeout(layer.fn(sourceUrl), layer.timeoutMs);
      if (!hasEnoughData(product)) {
        throw new Error("Dados insuficientes: falta titulo ou (preco/imagem).");
      }

      attempts.push({
        method: layer.name,
        success: true,
        duration_ms: Date.now() - layerStart,
      });

      return {
        success: true,
        product: completeProduct(product, sourceUrl, marketplace, layer.name),
        attempts,
        total_duration_ms: Date.now() - startTime,
      };
    } catch (error) {
      attempts.push({
        method: layer.name,
        success: false,
        duration_ms: Date.now() - layerStart,
        error:
          error instanceof Error
            ? error.message.slice(0, 200)
            : "Erro desconhecido.",
      });
    }
  }

  return {
    success: false,
    product: null,
    attempts,
    total_duration_ms: Date.now() - startTime,
  };
}
