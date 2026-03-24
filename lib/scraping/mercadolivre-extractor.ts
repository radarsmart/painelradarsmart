import { load } from "cheerio";
import { fetchHtmlWithRotation } from "@/lib/scraping/http-fetch-rotator";

type Availability = "in_stock" | "out_of_stock" | "unknown";
type ExtractionLayer = "json_ld" | "open_graph" | "dom" | "mixed" | "none";

interface JsonLdExtraction {
  title: string | null;
  imageUrl: string | null;
  price: number | null;
  oldPrice: number | null;
  rating: number | null;
  reviewCount: number | null;
  sellerName: string | null;
  brand: string | null;
  currency: string | null;
}

interface OpenGraphExtraction {
  title: string | null;
  imageUrl: string | null;
  price: number | null;
}

export type MercadoLivreOfferPreview = {
  marketplace: "mercadolivre";
  sourceUrl: string;
  productUrl: string;
  affiliateUrl: string;
  itemId: string | null;
  title: string | null;
  imageUrl: string | null;
  price: number | null;
  oldPrice: number | null;
  discountPct: number | null;
  rating: number | null;
  reviewCount: number | null;
  sellerName: string | null;
  brand: string | null;
  availability: Availability;
  currency: string;
  extractionMethod: "ml_html" | "ml_url";
  extractionLayer: ExtractionLayer;
  raw: Record<string, unknown>;
};

function toNonEmptyString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  let normalized = raw.replace(/[^\d,.-]/g, "");
  // pt-BR thousand style: 1.234 or 12.345,67
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }
  // en-US thousand style: 1,234 or 12,345.67
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/,/g, "");
  }

  const hasDot = normalized.includes(".");
  const hasComma = normalized.includes(",");

  if (hasDot && hasComma) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    normalized = normalized.replace(",", ".");
  }

  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPrice(value: unknown): number | null {
  const parsed = toNumber(value);
  if (parsed === null || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

function computeDiscountPct(price: number | null, oldPrice: number | null): number | null {
  if (price === null || oldPrice === null || oldPrice <= price) return null;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}

function normalizeMercadoLivreImageUrl(rawUrl: string | null): string | null {
  const value = String(rawUrl ?? "").trim();
  if (!value) return null;
  const noHash = value.split("#")[0];
  const noQuery = noHash.split("?")[0];
  const normalized = noQuery
    .replace(/-V(?=\.(jpg|jpeg|png|webp)$)/i, "")
    .replace(/([_-])I\.(jpg|jpeg|png|webp)$/i, "$1F.$2");
  return normalized || noQuery || value;
}

function parseAmountFromParts(fractionText: string | null, centsText: string | null): number | null {
  const fractionDigits = String(fractionText ?? "").replace(/[^\d]/g, "");
  if (!fractionDigits) return null;

  const centsDigits = String(centsText ?? "").replace(/[^\d]/g, "");
  if (!centsDigits) {
    return toPrice(fractionDigits);
  }

  const normalizedCents = centsDigits.length === 1
    ? `${centsDigits}0`
    : centsDigits.slice(0, 2);

  const composed = `${fractionDigits},${normalizedCents}`;
  return toPrice(composed);
}

function parseReviewCount(value: string | null): number | null {
  if (!value) return null;
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractPricesFromText(value: string | null): number[] {
  if (!value) return [];
  const prices: number[] = [];
  const patterns = [
    /R\$\s*([0-9][0-9.\s]*)(?:,([0-9]{2}))?/gi,
    /\$\s*([0-9][0-9.,]*)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const whole = String(match[1] ?? "").replace(/\s+/g, "");
      const cents = String(match[2] ?? "");
      const parsed = toPrice(cents ? `${whole},${cents}` : whole);
      if (parsed !== null) prices.push(parsed);
    }
  }

  return prices;
}

function pickMinPrice(...values: Array<number | null | undefined>): number | null {
  const candidates = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  if (!candidates.length) return null;
  return Math.min(...candidates);
}

function minPlausiblePriceByTitle(title: string | null): number {
  const text = String(title ?? "").toLowerCase();
  const highTicketKeywords = [
    "monitor",
    "notebook",
    "tv",
    "smart tv",
    "iphone",
    "samsung",
    "playstation",
    "ps5",
    "placa de video",
    "geladeira",
    "ar-condicionado",
  ];
  if (highTicketKeywords.some((keyword) => text.includes(keyword))) {
    return 100;
  }
  return 5;
}

function pickBestCurrentPrice(
  title: string | null,
  ...values: Array<number | null | undefined>
): number | null {
  const floor = minPlausiblePriceByTitle(title);
  const candidates = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value >= floor,
  );
  if (candidates.length > 0) return Math.min(...candidates);

  // fallback defensivo: usa qualquer preço positivo quando não houver candidato plausível.
  return pickMinPrice(...values);
}

function isPlausibleOldPrice(currentPrice: number | null, candidate: number): boolean {
  if (!Number.isFinite(candidate) || candidate <= 0) return false;
  if (currentPrice === null) return true;
  if (candidate <= currentPrice) return false;
  // Evita inflar desconto por parsing quebrado (ex.: 799 => 7.999).
  return candidate <= currentPrice * 8;
}

function pickPrioritizedOldPrice(
  currentPrice: number | null,
  preferred: Array<number | null | undefined>,
  fallback: Array<number | null | undefined> = [],
): number | null {
  for (const candidate of preferred) {
    if (typeof candidate === "number" && isPlausibleOldPrice(currentPrice, candidate)) {
      return candidate;
    }
  }

  const validFallback = fallback.filter(
    (candidate): candidate is number =>
      typeof candidate === "number" && isPlausibleOldPrice(currentPrice, candidate),
  );
  if (!validFallback.length) return null;
  return Math.min(...validFallback);
}

function extractMlItemId(value: unknown): string | null {
  const raw = String(value ?? "").toUpperCase();
  if (!raw) return null;
  const match = raw.match(/MLB-?\d{6,}/);
  return match?.[0] ? match[0].replace("MLB-", "MLB") : null;
}

function normalizeMercadoLivreUrl(rawUrl: string): string {
  const url = new URL(rawUrl.trim());

  // Promove parametros do hash (links de afiliado) para query.
  const hashRaw = decodeURIComponent((url.hash || "").replace(/^#/, ""));
  if (hashRaw.includes("=")) {
    const hashParams = new URLSearchParams(hashRaw);
    for (const key of ["wid", "item_id", "itemId"]) {
      const value = hashParams.get(key);
      if (value && !url.searchParams.has(key)) {
        url.searchParams.set(key, value);
      }
    }
  }

  const keepParams = new URLSearchParams();
  for (const key of ["wid", "item_id", "itemId"]) {
    const value = url.searchParams.get(key);
    if (value) keepParams.set(key, value);
  }
  url.search = keepParams.toString();
  url.hash = "";

  return url.toString();
}

function extractItemIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const byQuery = extractMlItemId(
      parsed.searchParams.get("wid") ??
        parsed.searchParams.get("item_id") ??
        parsed.searchParams.get("itemId"),
    );
    if (byQuery) return byQuery;
  } catch {
    // noop
  }
  return extractMlItemId(url);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function randomHandshakeDelay() {
  const delayMs = 350 + Math.floor(Math.random() * 301); // 350-650ms
  await sleep(delayMs);
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    await randomHandshakeDelay();
    const result = await fetchHtmlWithRotation({
      url,
      timeoutMs: 12000,
      maxAttempts: 3,
      minHtmlLength: 1200,
      extraHeaders: {
        "accept-encoding": "gzip, deflate, br",
      },
      blockedPatterns: [
        /captcha/i,
        /robot check/i,
        /acesso negado/i,
        /digite os caracteres/i,
        /verifique que voc[eê] [ée] humano/i,
      ],
    });
    return { html: result.html, finalUrl: result.finalUrl || url };
  } catch {
    return null;
  }
}

function parseJsonLdScripts(html: string): JsonLdExtraction {
  const $ = load(html);
  const scripts = $('script[type="application/ld+json"]')
    .toArray()
    .map((node) => $(node).text().trim())
    .filter(Boolean);

  const result: JsonLdExtraction = {
    title: null,
    imageUrl: null,
    price: null,
    oldPrice: null,
    rating: null,
    reviewCount: null,
    sellerName: null,
    brand: null,
    currency: null,
  };

  for (const scriptText of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(scriptText);
    } catch {
      continue;
    }

    const objects = Array.isArray(parsed) ? parsed : [parsed];
    for (const object of objects) {
      if (!object || typeof object !== "object") continue;
      const product = object as Record<string, unknown>;
      const type = String(product["@type"] ?? "").toLowerCase();
      if (!type.includes("product")) continue;

      result.title ??= toNonEmptyString(product.name);
      result.imageUrl ??=
        (Array.isArray(product.image)
          ? toNonEmptyString((product.image as unknown[])[0])
          : toNonEmptyString(product.image));
      if (result.imageUrl) {
        result.imageUrl = normalizeMercadoLivreImageUrl(result.imageUrl);
      }

      const brand = product.brand;
      if (typeof brand === "object" && brand !== null) {
        result.brand ??= toNonEmptyString((brand as Record<string, unknown>).name);
      } else {
        result.brand ??= toNonEmptyString(brand);
      }

      const agg = product.aggregateRating;
      if (typeof agg === "object" && agg !== null) {
        const aggObj = agg as Record<string, unknown>;
        result.rating ??= toNumber(aggObj.ratingValue);
        result.reviewCount ??= toNumber(aggObj.reviewCount);
      }

      const offersRaw = product.offers;
      const offersList = Array.isArray(offersRaw)
        ? (offersRaw as Array<Record<string, unknown>>)
        : (offersRaw && typeof offersRaw === "object"
          ? [offersRaw as Record<string, unknown>]
          : []);

      if (offersList.length > 0) {
        const offerPrices = offersList
          .map((offer) => toPrice(offer.price))
          .filter((value): value is number => typeof value === "number");
        const minOfferPrice = offerPrices.length ? Math.min(...offerPrices) : null;
        result.price ??= minOfferPrice;

        const offerOldPrices = offersList
          .flatMap((offer) => [
            toPrice(offer.original_price),
            toPrice(offer.originalPrice),
            toPrice(offer.price_before_discount),
            toPrice(offer.priceBeforeDiscount),
            toPrice(offer.regular_amount),
            toPrice(offer.regularAmount),
            toPrice(offer.list_price),
            toPrice(offer.listPrice),
            toPrice(offer.highPrice),
          ])
          .filter((value): value is number => typeof value === "number");
        const maxOfferOldPrice = offerOldPrices.length ? Math.max(...offerOldPrices) : null;
        result.oldPrice ??= maxOfferOldPrice;

        result.currency ??= offersList
          .map((offer) => toNonEmptyString(offer.priceCurrency))
          .find(Boolean) ?? null;

        const sellerRaw = offersList[0]?.seller;
        if (typeof sellerRaw === "object" && sellerRaw !== null) {
          result.sellerName ??= toNonEmptyString(
            (sellerRaw as Record<string, unknown>).name,
          );
        }
      }
    }
  }

  return result;
}

function parseOpenGraphSnapshot(html: string): OpenGraphExtraction {
  const $ = load(html);
  const twitterData1Price = toPrice(
    toNonEmptyString($('meta[name="twitter:data1"]').attr("content")),
  );
  return {
    title: toNonEmptyString($('meta[property="og:title"]').attr("content")),
    imageUrl: normalizeMercadoLivreImageUrl(
      toNonEmptyString($('meta[property="og:image"]').attr("content")),
    ),
    price:
      twitterData1Price ??
      toPrice($('meta[property="product:price:amount"]').attr("content")) ??
      toPrice($('meta[property="og:price:amount"]').attr("content")) ??
      toPrice($('meta[itemprop="price"]').attr("content")) ??
      toPrice($('meta[property="price:amount"]').attr("content")),
  };
}

function detectExtractionLayer(input: {
  jsonLd: JsonLdExtraction;
  openGraph: OpenGraphExtraction;
  dom: { title: string | null; imageUrl: string | null; price: number | null } | null;
}): ExtractionLayer {
  const hasJsonLd = Boolean(input.jsonLd.title && input.jsonLd.imageUrl && input.jsonLd.price);
  if (hasJsonLd) return "json_ld";

  const hasOg = Boolean(input.openGraph.title && input.openGraph.imageUrl && input.openGraph.price);
  if (hasOg) return "open_graph";

  const hasDom = Boolean(input.dom?.title && input.dom?.imageUrl && input.dom?.price);
  if (hasDom) return "dom";

  const hasAny =
    Boolean(input.jsonLd.title || input.jsonLd.imageUrl || input.jsonLd.price) ||
    Boolean(input.openGraph.title || input.openGraph.imageUrl || input.openGraph.price) ||
    Boolean(input.dom?.title || input.dom?.imageUrl || input.dom?.price);

  return hasAny ? "mixed" : "none";
}

function parseBrandFromSpecs($: ReturnType<typeof load>): string | null {
  const candidates = [
    ".ui-pdp-specs__table .andes-table__row",
    ".ui-vpp-striped-specs__table .ui-vpp-striped-specs__row",
  ];

  for (const selector of candidates) {
    const rows = $(selector).toArray();
    for (const row of rows) {
      const text = $(row).text().replace(/\s+/g, " ").trim();
      if (!/marca/i.test(text)) continue;
      const values = $(row).find("td,span,div").toArray()
        .map((node) => $(node).text().replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const value = values[values.length - 1];
      if (value && !/marca/i.test(value)) return value;
    }
  }

  return null;
}

function parseHtmlSnapshot(html: string, finalUrl: string) {
  const $ = load(html);
  const title =
    toNonEmptyString($("h1.ui-pdp-title").first().text()) ??
    toNonEmptyString($('meta[property="og:title"]').attr("content"));

  const imageUrl = normalizeMercadoLivreImageUrl(
    toNonEmptyString(
      $(".ui-pdp-image.ui-pdp-image--active").first().attr("src"),
    ) ??
      toNonEmptyString(
        $(".ui-pdp-image.ui-pdp-image--active").first().attr("data-zoom"),
      ) ??
      toNonEmptyString(
        $(".ui-pdp-image.ui-pdp-image--active").first().attr("data-src"),
      ) ??
      toNonEmptyString($(".ui-pdp-gallery__figure img").first().attr("src")) ??
      toNonEmptyString(html.match(/"secure_thumbnail"\s*:\s*"([^"]+)"/i)?.[1]) ??
      toNonEmptyString(html.match(/"thumbnail"\s*:\s*"([^"]+)"/i)?.[1]) ??
      toNonEmptyString($('meta[property="og:image"]').attr("content")) ??
      toNonEmptyString($('meta[name="twitter:image"]').attr("content")),
  );

  const canonical = toNonEmptyString($('link[rel="canonical"]').attr("href")) ??
    toNonEmptyString($('meta[property="og:url"]').attr("content")) ??
    finalUrl;

  const fractionCurrent = toNonEmptyString(
    $(".ui-pdp-price__second-line .andes-money-amount__fraction").first().text(),
  );
  const centsCurrent = toNonEmptyString(
    $(".ui-pdp-price__second-line .andes-money-amount__cents").first().text(),
  );
  const currentFromParts = parseAmountFromParts(fractionCurrent, centsCurrent);
  const currentFromShadow = toPrice(
    $(".ui-p-price__shadow").first().text(),
  );
  const currentFromMainValue = toPrice(
    $(".ui-p-price__main-value").first().text(),
  );
  const currentFromMeta = toPrice($('meta[itemprop="price"]').attr("content"));
  const currentFromPriceAmountMeta = toPrice(
    $('meta[property="price:amount"]').attr("content"),
  );
  const currentFromProductMeta = toPrice(
    $('meta[property="product:price:amount"]').attr("content"),
  );
  const currentFromOgMeta = toPrice(
    $('meta[property="og:price:amount"]').attr("content"),
  );
  const currentFromRegex = toPrice(
    html.match(/"price"\s*:\s*"?([0-9.,]+)"?/i)?.[1] ?? null,
  );
  const currentFromPreloadValue = toPrice(
    html.match(/"price"\s*:\s*\{[^}]*"value"\s*:\s*([0-9.]+)/i)?.[1] ?? null,
  );
  const currentFromPreloadAmount = toPrice(
    html.match(/"sale_price"\s*:\s*\{[^}]*"amount"\s*:\s*([0-9.]+)/i)?.[1] ??
      html.match(/"price"\s*:\s*\{[^}]*"amount"\s*:\s*([0-9.]+)/i)?.[1] ?? null,
  );
  const currentFromOgTitle = pickMinPrice(
    ...extractPricesFromText(
      toNonEmptyString($('meta[property="og:title"]').attr("content")),
    ),
  );
  const currentFromTwitterData1 = toPrice(
    toNonEmptyString($('meta[name="twitter:data1"]').attr("content")),
  );

  // Regra de negocio: sempre priorizar o menor preco a vista disponivel,
  // mas ignorando valores implausiveis para o tipo de produto.
  const price = pickBestCurrentPrice(
    title,
    currentFromShadow,
    currentFromMainValue,
    currentFromParts,
    currentFromPriceAmountMeta,
    currentFromMeta,
    currentFromProductMeta,
    currentFromOgMeta,
    currentFromPreloadValue,
    currentFromPreloadAmount,
    currentFromRegex,
    currentFromTwitterData1,
    currentFromOgTitle,
  );

  const fractionOld = toNonEmptyString(
    $(".ui-pdp-price__original-value .andes-money-amount__fraction").first().text(),
  );
  const centsOld = toNonEmptyString(
    $(".ui-pdp-price__original-value .andes-money-amount__cents").first().text(),
  );
  const oldFromParts = parseAmountFromParts(fractionOld, centsOld);
  const oldFromWhole = toPrice(
    $(".ui-pdp-price__original-value").first().text(),
  );
  const oldFromRegex = toPrice(
    html.match(/"original_price"\s*:\s*"?([0-9.,]+)"?/i)?.[1] ?? null,
  );
  const oldFromOriginalValue = toPrice(
    html.match(/"original_value"\s*:\s*([0-9.]+)/i)?.[1] ??
      html.match(/"regular_amount"\s*:\s*([0-9.]+)/i)?.[1] ??
      html.match(/"list_price"\s*:\s*\{[^}]*"amount"\s*:\s*([0-9.]+)/i)?.[1] ?? null,
  );

  // Prioridade: JSON estruturado/API-like > parse visual do DOM.
  const oldFromStructured = pickPrioritizedOldPrice(price, [oldFromRegex, oldFromOriginalValue]);
  const oldPrice = pickPrioritizedOldPrice(
    price,
    [oldFromStructured],
    [
      oldFromParts,
      oldFromWhole,
    ],
  );

  const rating = toNumber(
    $(".ui-pdp-review__rating").first().text(),
  ) ?? toNumber($('meta[itemprop="ratingValue"]').attr("content"));

  const reviewCount = parseReviewCount(
    $(".ui-pdp-review__amount").first().text(),
  ) ?? toNumber($('meta[itemprop="reviewCount"]').attr("content"));

  const sellerName = toNonEmptyString(
    $(".ui-pdp-seller__header__title").first().text(),
  ) ??
    toNonEmptyString($(".ui-pdp-media__title").first().text());

  const bodyText = $("body").text().toLowerCase();
  const availability: Availability = bodyText.includes("sem estoque") ||
      bodyText.includes("indispon")
    ? "out_of_stock"
    : bodyText.includes("estoque") || bodyText.includes("dispon")
    ? "in_stock"
    : "unknown";

  const brand = parseBrandFromSpecs($);
  const currency = toNonEmptyString(
    $('meta[property="product:price:currency"]').attr("content"),
  ) ??
    toNonEmptyString(
      html.match(/"currency_id"\s*:\s*"([A-Z]{3})"/i)?.[1],
    ) ?? "BRL";

  return {
    title,
    imageUrl,
    productUrl: canonical,
    price,
    oldPrice,
    rating,
    reviewCount: reviewCount !== null ? Math.max(0, Math.trunc(reviewCount)) : null,
    sellerName,
    brand,
    availability,
    currency,
  };
}

function ensureMercadoLivreUrl(rawUrl: string): void {
  const parsed = new URL(rawUrl);
  const host = parsed.hostname.toLowerCase();
  if (!host.includes("mercadolivre") && !host.includes("mercadolibre")) {
    throw new Error("URL nao pertence ao Mercado Livre.");
  }
}

export function mapToAdminProdutoML(
  preview: MercadoLivreOfferPreview,
): {
  id: string;
  title: string;
  price: number;
  original_price: number;
  discount_pct: number;
  image_url: string;
  product_url: string;
  affiliate_url: string;
  sold: number;
  condition: string;
} {
  return {
    id: preview.itemId ?? crypto.randomUUID(),
    title: preview.title ?? "Produto sem titulo",
    price: preview.price ?? 0,
    original_price: preview.oldPrice ?? preview.price ?? 0,
    discount_pct: preview.discountPct ?? 0,
    image_url: preview.imageUrl ?? "",
    product_url: preview.productUrl,
    affiliate_url: preview.affiliateUrl,
    sold: 0,
    condition: "new",
  };
}

export async function extractMercadoLivreOffer(input: {
  url: string;
  affiliateUrl?: string | null;
}): Promise<MercadoLivreOfferPreview> {
  if (!input.url?.trim()) {
    throw new Error("URL obrigatoria.");
  }

  ensureMercadoLivreUrl(input.url);
  const normalizedUrl = normalizeMercadoLivreUrl(input.url);
  const itemId = extractItemIdFromUrl(normalizedUrl);
  const htmlSnapshot = await fetchHtml(normalizedUrl);
  const htmlPayload = htmlSnapshot?.html ?? "";
  console.log("[ML htmlPayload]", htmlPayload);

  const htmlParsed = htmlSnapshot
    ? parseHtmlSnapshot(htmlSnapshot.html, htmlSnapshot.finalUrl)
    : null;
  const jsonLd = htmlSnapshot ? parseJsonLdScripts(htmlSnapshot.html) : null;
  const openGraph = htmlSnapshot ? parseOpenGraphSnapshot(htmlSnapshot.html) : null;

  const title =
    jsonLd?.title ??
    openGraph?.title ??
    htmlParsed?.title ??
    "Produto Mercado Livre";
  const price = pickBestCurrentPrice(
    title,
    jsonLd?.price ?? null,
    openGraph?.price ?? null,
    htmlParsed?.price ?? null,
  );
  const oldPrice = pickPrioritizedOldPrice(price, [jsonLd?.oldPrice, htmlParsed?.oldPrice ?? null]);
  const imageUrl = normalizeMercadoLivreImageUrl(
    jsonLd?.imageUrl ?? openGraph?.imageUrl ?? htmlParsed?.imageUrl ?? null,
  );
  const productUrl = htmlParsed?.productUrl ?? normalizedUrl;
  const sellerName = jsonLd?.sellerName ?? htmlParsed?.sellerName ?? null;
  const brand = jsonLd?.brand ?? htmlParsed?.brand ?? null;
  const availability = htmlParsed?.availability ?? "unknown";
  const currency = jsonLd?.currency ?? htmlParsed?.currency ?? "BRL";
  const rating = jsonLd?.rating ?? htmlParsed?.rating ?? null;
  const reviewCount = jsonLd?.reviewCount ?? htmlParsed?.reviewCount ?? null;
  const discountPct = computeDiscountPct(price, oldPrice);
  const extractionMethod: MercadoLivreOfferPreview["extractionMethod"] =
    htmlParsed ? "ml_html" : "ml_url";
  const extractionLayer = detectExtractionLayer({
    jsonLd: jsonLd ?? {
      title: null,
      imageUrl: null,
      price: null,
      oldPrice: null,
      rating: null,
      reviewCount: null,
      sellerName: null,
      brand: null,
      currency: null,
    },
    openGraph: openGraph ?? {
      title: null,
      imageUrl: null,
      price: null,
    },
    dom: htmlParsed
      ? { title: htmlParsed.title, imageUrl: htmlParsed.imageUrl, price: htmlParsed.price }
      : null,
  });

  return {
    marketplace: "mercadolivre",
    sourceUrl: normalizedUrl,
    productUrl,
    affiliateUrl: input.affiliateUrl?.trim() || normalizedUrl,
    itemId,
    title,
    imageUrl,
    price,
    oldPrice,
    discountPct,
    rating,
    reviewCount,
    sellerName,
    brand,
    availability,
    currency,
    extractionMethod,
    extractionLayer,
    raw: {
      item_id: itemId,
      extraction_layer: extractionLayer,
      json_ld: jsonLd,
      open_graph: openGraph,
      html: htmlParsed,
      url: normalizedUrl,
    },
  };
}
