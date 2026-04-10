import { load } from "cheerio";

type ZenscrapeInput = {
  url: string;
  affiliateUrl?: string | null;
};

export type MercadoLivreZenscrapePreview = {
  title: string;
  price: number | null;
  oldPrice: number | null;
  imageUrl: string;
  productUrl: string;
  affiliateUrl: string;
  rawData: Record<string, unknown>;
};

const ML_BROWSER_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8",
  "accept-encoding": "gzip, deflate, br",
  referer: "https://www.mercadolivre.com.br/",
  "cache-control": "no-cache",
  "sec-ch-ua": '"Chromium";v="123", "Not-A.Brand";v="8"',
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCurrencyLoose(value: unknown): number | null {
  let raw = toText(value);
  if (!raw) return null;

  raw = raw
    .replace(/[Rr]\$/g, "")
    .replace(/\u00a0/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!raw) return null;

  const hasDot = raw.includes(".");
  const hasComma = raw.includes(",");
  if (hasDot && hasComma) {
    if (raw.lastIndexOf(",") > raw.lastIndexOf(".")) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else {
      raw = raw.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAmountFromParts(wholeRaw: string | null, centsRaw: string | null): number | null {
  const whole = String(wholeRaw ?? "").replace(/[^\d]/g, "");
  if (!whole) return null;

  const centsDigits = String(centsRaw ?? "").replace(/[^\d]/g, "");
  if (!centsDigits) {
    return toNumber(whole);
  }

  const cents = centsDigits.length === 1 ? `${centsDigits}0` : centsDigits.slice(0, 2);
  return toNumber(`${whole}.${cents}`);
}

function pickPlausibleOldPrice(
  currentPrice: number | null,
  candidates: Array<number | null | undefined>,
): number | null {
  const valid = candidates.filter(
    (value): value is number =>
      typeof value === "number" &&
      Number.isFinite(value) &&
      value > 0 &&
      (currentPrice === null || value > currentPrice) &&
      (currentPrice === null || value <= currentPrice * 8),
  );

  if (!valid.length) return null;
  return Math.min(...valid);
}

function readFirstDigits(
  $: ReturnType<typeof load>,
  selectors: string[],
): string | null {
  for (const selector of selectors) {
    const value = toText($(selector).first().text()).replace(/[^\d]/g, "");
    if (value) return value;
  }
  return null;
}

function readFirstMetaMoney(
  $: ReturnType<typeof load>,
  selectors: string[],
): number | null {
  for (const selector of selectors) {
    const value = toText($(selector).first().attr("content"));
    const parsed = parseCurrencyLoose(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

async function waitForNaturalDelay(): Promise<void> {
  const delayMs = 1500 + Math.floor(Math.random() * 1000);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readJsonLdProduct($: ReturnType<typeof load>): {
  title: string;
  price: number | null;
  oldPrice: number | null;
  imageUrl: string;
} {
  const scripts = $('script[type="application/ld+json"]')
    .map((_, element) => $(element).contents().text())
    .get()
    .map((item) => toText(item))
    .filter(Boolean);

  for (const scriptContent of scripts) {
    try {
      const parsed = JSON.parse(scriptContent) as unknown;
      const nodes = Array.isArray(parsed) ? parsed : [parsed];

      for (const node of nodes) {
        const record = toRecord(node);
        const graph = Array.isArray(record["@graph"]) ? record["@graph"] : [];
        const candidates = [record, ...graph.map((item) => toRecord(item))];

        for (const candidate of candidates) {
          const typeValue = String(candidate["@type"] ?? "").toLowerCase();
          if (!typeValue.includes("product")) continue;

          const offersValue = candidate.offers;
          const offerRecord = Array.isArray(offersValue)
            ? toRecord(offersValue[0])
            : toRecord(offersValue);
          const priceSpecification = toRecord(offerRecord.priceSpecification);
          const listPrice = toRecord(offerRecord.list_price);

          const imageValue = candidate.image;
          const imageUrl = Array.isArray(imageValue)
            ? normalizeMercadoLivreImageUrl(toText(imageValue[0]))
            : normalizeMercadoLivreImageUrl(toText(imageValue));

          const price =
            parseCurrencyLoose(offerRecord.price) ??
            parseCurrencyLoose(priceSpecification.price) ??
            parseCurrencyLoose(offerRecord.lowPrice) ??
            parseCurrencyLoose(candidate.price);
          const oldPrice = pickPlausibleOldPrice(price, [
            parseCurrencyLoose(offerRecord.original_price),
            parseCurrencyLoose(offerRecord.originalPrice),
            parseCurrencyLoose(offerRecord.price_before_discount),
            parseCurrencyLoose(offerRecord.priceBeforeDiscount),
            parseCurrencyLoose(offerRecord.regular_amount),
            parseCurrencyLoose(offerRecord.regularAmount),
            parseCurrencyLoose(offerRecord.list_price),
            parseCurrencyLoose(offerRecord.listPrice),
            parseCurrencyLoose(listPrice.amount),
            parseCurrencyLoose(offerRecord.highPrice),
            parseCurrencyLoose(candidate.highPrice),
            parseCurrencyLoose(priceSpecification.referencePrice),
            parseCurrencyLoose(priceSpecification.listPrice),
            parseCurrencyLoose(candidate.original_price),
            parseCurrencyLoose(candidate.originalPrice),
          ]);

          return {
            title: toText(candidate.name),
            price,
            oldPrice,
            imageUrl,
          };
        }
      }
    } catch {
      // Ignora blobs JSON-LD invalidos e continua os fallbacks.
    }
  }

  return {
    title: "",
    price: null,
    oldPrice: null,
    imageUrl: "",
  };
}

function normalizeMercadoLivreImageUrl(raw: string): string {
  const value = toText(raw)
    .replace(/\\u0026/g, "&")
    .replace(/\s/g, "")
    .trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/\//.test(value)) return `https:${value}`;
  if (/^www\./i.test(value)) return `https://${value}`;
  return value;
}

function isValidMercadoLivreImageUrl(value: string): boolean {
  const normalized = normalizeMercadoLivreImageUrl(value);
  if (!/^https?:\/\//i.test(normalized)) return false;

  const lower = normalized.toLowerCase();
  if (lower.startsWith("data:")) return false;
  if (
    lower.includes("logo") ||
    lower.includes("sprite") ||
    lower.includes("favicon") ||
    lower.endsWith("/logo.png")
  ) {
    return false;
  }

  if (
    !lower.includes("mlstatic") &&
    !lower.includes("mercadolivre") &&
    !lower.includes("mercadolibre")
  ) {
    return false;
  }

  return true;
}

async function resolveShortUrl(url: string): Promise<string> {
  const source = toText(url);
  if (!source.toLowerCase().includes("meli.la")) return source;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    await waitForNaturalDelay();
    const response = await fetch(source, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: ML_BROWSER_HEADERS,
      cache: "no-store",
    });
    return toText(response.url) || source;
  } catch {
    return source;
  } finally {
    clearTimeout(timeout);
  }
}

function buildZenscrapeUrl(apiKey: string, targetUrl: string): string {
  const endpoint = new URL("https://app.zenscrape.com/api/v1/get");
  endpoint.searchParams.set("apikey", apiKey);
  endpoint.searchParams.set("url", targetUrl);
  endpoint.searchParams.set("render", "true");
  endpoint.searchParams.set("keep_headers", "true");
  endpoint.searchParams.set("wait_for_selector", ".ui-pdp-title");
  endpoint.searchParams.set("premium", "true");
  return endpoint.toString();
}

export async function extractMercadoLivreWithZenscrape(
  input: ZenscrapeInput,
): Promise<MercadoLivreZenscrapePreview> {
  const sourceUrl = await resolveShortUrl(toText(input.url));
  if (!sourceUrl) throw new Error("URL Mercado Livre obrigatoria.");

  const apiKey = toText(process.env.ZENSCRAPE_API_KEY);
  if (!apiKey) {
    throw new Error("ZENSCRAPE_API_KEY nao configurada.");
  }

  // Requisito crítico: render=true precisa estar explícito na URL final.
  const endpointUrl = buildZenscrapeUrl(apiKey, sourceUrl);
  const endpointParsed = new URL(endpointUrl);
  const renderParam = endpointParsed.searchParams.get("render");
  const waitForSelectorParam = endpointParsed.searchParams.get("wait_for_selector");
  if (renderParam !== "true" || waitForSelectorParam !== ".ui-pdp-title") {
    throw new Error(
      "URL do Zenscrape sem parametros obrigatorios (render=true e wait_for_selector=.ui-pdp-title).",
    );
  }

  const response = await fetch(endpointUrl, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(6500),
    headers: {
      ...ML_BROWSER_HEADERS,
      accept: "application/json,text/html;q=0.9,*/*;q=0.8",
    },
  });

  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(`Zenscrape falhou (HTTP ${response.status}).`);
  }

  let html = rawBody;
  let rawData: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    rawData = parsed;
    const scrapingResult = (parsed.scraping_result ?? {}) as Record<string, unknown>;
    html =
      toText(parsed.html) ||
      toText(parsed.body) ||
      toText(parsed.content) ||
      toText(scrapingResult.content) ||
      toText(scrapingResult.html) ||
      rawBody;
  } catch {
    rawData = { html: rawBody };
  }

  if (!html || html.length < 1000) {
    throw new Error("Zenscrape retornou HTML vazio para Mercado Livre.");
  }

  const $ = load(html);
  const jsonLd = readJsonLdProduct($);

  // Seletores do layout atual do Mercado Livre Brasil.
  const title =
    jsonLd.title ||
    toText($("h1.ui-pdp-title").first().text()) ||
    toText($(".ui-pdp-title").first().text()) ||
    toText($('meta[property="og:title"]').attr("content")) ||
    toText($("title").first().text());

  const currentWhole = readFirstDigits($, [
    ".ui-pdp-price__second-line .andes-money-amount__fraction",
    ".ui-pdp-price__main-container .ui-pdp-price__second-line .andes-money-amount__fraction",
    ".ui-pdp-price__second-line .andes-money-amount--cents-superscript .andes-money-amount__fraction",
    ".ui-pdp-price__main-container .andes-money-amount--cents-superscript .andes-money-amount__fraction",
    ".ui-pdp-price__main-container .andes-money-amount__fraction",
    ".andes-money-amount--cents-superscript .andes-money-amount__fraction",
    ".price-tag-fraction",
  ]);

  const currentCents = readFirstDigits($, [
    ".ui-pdp-price__second-line .andes-money-amount__cents",
    ".ui-pdp-price__second-line .andes-money-amount__decimals",
    ".ui-pdp-price__second-line .andes-money-amount--cents-superscript .andes-money-amount__cents",
    ".andes-money-amount--cents-superscript .andes-money-amount__cents",
    ".ui-pdp-price__main-container .andes-money-amount__cents",
    ".ui-pdp-price__main-container .andes-money-amount__decimals",
    ".price-tag-cents",
  ]) || "";

  const genericCurrentWhole = readFirstDigits($, [
    ".andes-money-amount__fraction",
  ]);
  const genericCurrentCents =
    readFirstDigits($, [
      ".andes-money-amount__cents",
      ".andes-money-amount__decimals",
    ]) || "";

  const oldWhole =
    readFirstDigits($, [
      ".ui-pdp-price__original-value .andes-money-amount__fraction",
      ".andes-money-amount--previous .andes-money-amount__fraction",
      ".andes-money-amount__small .andes-money-amount__fraction",
      "s.andes-money-amount .andes-money-amount__fraction",
    ]) || toText($(".ui-pdp-price__original-value").first().text());

  const oldCents = readFirstDigits($, [
    ".ui-pdp-price__original-value .andes-money-amount__cents",
    ".ui-pdp-price__original-value .andes-money-amount__decimals",
    ".andes-money-amount--previous .andes-money-amount__cents",
    ".andes-money-amount--previous .andes-money-amount__decimals",
    ".andes-money-amount__small .andes-money-amount__cents",
    ".andes-money-amount__small .andes-money-amount__decimals",
    "s.andes-money-amount .andes-money-amount__cents",
  ]) || "";

  const metaCurrentPrice = readFirstMetaMoney($, [
    'meta[itemprop="price"]',
    'meta[property="product:price:amount"]',
    'meta[property="price:amount"]',
    'meta[name="twitter:data1"]',
  ]);

  const currentPriceRegex = parseCurrencyLoose(
    html.match(/"price"\s*:\s*"?([0-9.,]+)"?/i)?.[1] ??
      html.match(/"price"\s*:\s*\{[^}]*"amount"\s*:\s*([0-9.]+)/i)?.[1] ??
      html.match(/"sale_price"\s*:\s*\{[^}]*"amount"\s*:\s*([0-9.]+)/i)?.[1] ??
      null,
  );

  const price =
    jsonLd.price ??
    parseAmountFromParts(currentWhole, currentCents) ??
    parseCurrencyLoose(currentWhole) ??
    metaCurrentPrice ??
    currentPriceRegex;

  const oldPriceRegex = parseCurrencyLoose(
    html.match(/"original_price"\s*:\s*"?([0-9.,]+)"?/i)?.[1] ??
      html.match(/"price_before_discount"\s*:\s*"?([0-9.,]+)"?/i)?.[1] ??
      html.match(/"regular_amount"\s*:\s*([0-9.]+)/i)?.[1] ??
      html.match(/"original_value"\s*:\s*([0-9.]+)/i)?.[1] ??
      html.match(/"list_price"\s*:\s*\{[^}]*"amount"\s*:\s*([0-9.]+)/i)?.[1] ??
      null,
  );
  const oldPrice =
    pickPlausibleOldPrice(price, [
      jsonLd.oldPrice,
      oldPriceRegex,
      parseAmountFromParts(oldWhole, oldCents),
      parseCurrencyLoose(oldWhole),
    ]) ?? null;

  const genericCurrentPrice = parseAmountFromParts(genericCurrentWhole, genericCurrentCents);
  const safeGenericCurrentPrice =
    genericCurrentPrice !== null &&
    (oldPrice === null || genericCurrentPrice < oldPrice)
      ? genericCurrentPrice
      : null;

  const resolvedPrice =
    price ??
    safeGenericCurrentPrice;

  const imageCandidates = [
    toText($("img.ui-pdp-image.ui-pdp-gallery__figure__image").first().attr("data-zoom")),
    toText($("img.ui-pdp-image.ui-pdp-gallery__figure__image").first().attr("src")),
    toText($(".ui-pdp-gallery__figure__image").first().attr("data-zoom")),
    toText($(".ui-pdp-gallery__figure__image").first().attr("src")),
    toText($(".ui-pdp-image.ui-pdp-image--active").first().attr("data-zoom")),
    toText($(".ui-pdp-image.ui-pdp-image--active").first().attr("src")),
    toText($("img.ui-pdp-gallery__figure__image").first().attr("data-src")),
    toText($("img.ui-pdp-gallery__figure__image").first().attr("srcset")),
    toText($("img.ui-pdp-image").first().attr("data-zoom")),
    toText($("img.ui-pdp-image").first().attr("src")),
    toText($("img[data-zoom]").first().attr("data-zoom")),
    toText($("img[data-src]").first().attr("data-src")),
    toText($('meta[property="og:image"]').attr("content")),
    toText($('meta[name="twitter:image"]').attr("content")),
  ]
    .map((candidate) => {
      // Em srcset (ou string com descriptor), pega sempre o primeiro URL puro.
      const firstEntry = candidate
        .split(",")
        .map((item) => item.trim())
        .find(Boolean) ?? "";
      const firstUrlToken = firstEntry.split(/\s+/)[0] ?? "";
      return normalizeMercadoLivreImageUrl(firstUrlToken);
    })
    .filter(Boolean);

  const imageUrl = imageCandidates.find(isValidMercadoLivreImageUrl) ?? "";
  const resolvedImageUrl =
    imageUrl || (isValidMercadoLivreImageUrl(jsonLd.imageUrl) ? jsonLd.imageUrl : "");

  const productUrl =
    toText($('meta[property="og:url"]').attr("content")) ||
    toText($('link[rel="canonical"]').attr("href")) ||
    sourceUrl;
  const affiliateUrl = toText(input.affiliateUrl) || productUrl;

  return {
    title,
    price: resolvedPrice,
    oldPrice,
    imageUrl: resolvedImageUrl,
    productUrl,
    affiliateUrl,
    rawData: {
      ...rawData,
      source_url: sourceUrl,
      extraction_engine: "zenscrape",
      json_ld_title: jsonLd.title,
      json_ld_price: jsonLd.price,
      json_ld_image: jsonLd.imageUrl,
    },
  };
}
