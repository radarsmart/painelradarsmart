const RAINFOREST_KEY = process.env.RAINFOREST_API_KEY;
const ZENSCRAPE_KEY = process.env.ZENSCRAPE_API_KEY;

type AmazonFetchResult = {
  raw: Record<string, unknown>;
  title: string;
  price: number | null;
  image: string;
  rating: number | null;
  prime: boolean;
};

type ZenFetchResult = {
  html: string;
  raw: Record<string, unknown>;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toAbsoluteHttpUrl(value: unknown): string {
  const raw = toText(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function extractAmazonAsin(url: string): string | null {
  const source = toText(url).toUpperCase();
  if (!source) return null;

  const patterns = [
    /\/DP\/([A-Z0-9]{10})(?:[/?]|$)/,
    /\/GP\/PRODUCT\/([A-Z0-9]{10})(?:[/?]|$)/,
    /\/PRODUCT\/([A-Z0-9]{10})(?:[/?]|$)/,
    /[?&]ASIN=([A-Z0-9]{10})(?:[&#]|$)/,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

export async function fetchAmazonData(
  asin: string,
  fallbackUrl?: string,
): Promise<AmazonFetchResult> {
  const apiKey =
    toText(RAINFOREST_KEY) ||
    toText(process.env.RAINFORESTAPI_KEY) ||
    toText(process.env.RAINFOREST_API_TOKEN);
  if (!apiKey) {
    throw new Error("RAINFOREST_API_KEY nao configurada.");
  }

  const endpoint = new URL("https://api.rainforestapi.com/request");
  endpoint.searchParams.set("api_key", apiKey);
  endpoint.searchParams.set("type", "product");
  endpoint.searchParams.set("amazon_domain", "amazon.com.br");

  const normalizedAsin = toText(asin);
  const normalizedFallbackUrl = toText(fallbackUrl);
  if (normalizedAsin) {
    endpoint.searchParams.set("asin", normalizedAsin);
  } else if (normalizedFallbackUrl) {
    endpoint.searchParams.set("url", normalizedFallbackUrl);
  } else {
    throw new Error("ASIN ou URL Amazon obrigatorios.");
  }

  const response = await fetch(endpoint, {
    method: "GET",
    cache: "no-store",
    headers: {
      accept: "application/json",
    },
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const reason =
      toText(payload.message) || toText(payload.error) || `HTTP ${response.status}`;
    throw new Error(`Rainforest API falhou: ${reason}`);
  }

  const dataNode = isRecord(payload.data) ? payload.data : {};
  const productNode = isRecord(dataNode.product)
    ? dataNode.product
    : isRecord(payload.product)
      ? payload.product
      : {};
  const buybox = isRecord(productNode.buybox_winner) ? productNode.buybox_winner : {};
  const priceNode = isRecord(buybox.price) ? buybox.price : {};
  const mainImage = isRecord(productNode.main_image) ? productNode.main_image : {};

  return {
    raw: payload,
    title: toText(productNode.title),
    price: toNumber(priceNode.value),
    image: toAbsoluteHttpUrl(mainImage.link),
    rating: toNumber(productNode.rating),
    prime: Boolean(buybox.is_prime),
  };
}

export async function fetchZenData(
  targetUrl: string,
  options?: {
    render?: boolean;
    waitForSelector?: string;
    premium?: boolean;
    keepHeaders?: boolean;
  },
): Promise<ZenFetchResult> {
  const apiKey = toText(ZENSCRAPE_KEY);
  if (!apiKey) {
    throw new Error("ZENSCRAPE_API_KEY nao configurada.");
  }

  const normalizedTargetUrl = toText(targetUrl);
  if (!normalizedTargetUrl) {
    throw new Error("URL alvo obrigatoria para Zenscrape.");
  }

  const endpoint = new URL("https://app.zenscrape.com/api/v1/get");
  endpoint.searchParams.set("apikey", apiKey);
  endpoint.searchParams.set("url", normalizedTargetUrl);
  endpoint.searchParams.set("render", options?.render === false ? "false" : "true");

  if (options?.keepHeaders !== false) {
    endpoint.searchParams.set("keep_headers", "true");
  }
  if (options?.premium !== false) {
    endpoint.searchParams.set("premium", "true");
  }
  if (options?.waitForSelector) {
    endpoint.searchParams.set("wait_for_selector", options.waitForSelector);
  }

  const response = await fetch(endpoint, {
    method: "GET",
    cache: "no-store",
    headers: {
      accept: "application/json,text/html;q=0.9,*/*;q=0.8",
    },
  });

  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(`Zenscrape falhou (HTTP ${response.status}).`);
  }

  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    const scrapingResult = isRecord(parsed.scraping_result) ? parsed.scraping_result : {};
    const html =
      toText(parsed.html) ||
      toText(parsed.body) ||
      toText(parsed.content) ||
      toText(scrapingResult.content) ||
      toText(scrapingResult.html) ||
      rawBody;

    return {
      html,
      raw: parsed,
    };
  } catch {
    return {
      html: rawBody,
      raw: { html: rawBody },
    };
  }
}

export type { AmazonFetchResult, ZenFetchResult };
