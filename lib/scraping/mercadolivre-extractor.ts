import { load } from "cheerio";

type Availability = "in_stock" | "out_of_stock" | "unknown";

interface MlItemPicture {
  url?: string;
  secure_url?: string;
}

interface MlItemAttribute {
  id?: string;
  name?: string;
  value_name?: string | null;
}

interface MlItemResponse {
  id?: string;
  title?: string;
  price?: number;
  original_price?: number | null;
  currency_id?: string;
  permalink?: string;
  thumbnail?: string;
  secure_thumbnail?: string;
  pictures?: MlItemPicture[];
  seller_id?: number;
  available_quantity?: number;
  attributes?: MlItemAttribute[];
}

interface MlUserResponse {
  nickname?: string;
}

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
  extractionMethod: "ml_api_html" | "ml_api" | "ml_html" | "ml_url";
  raw: Record<string, unknown>;
};

const DEFAULT_HEADERS: Record<string, string> = {
  "accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "cache-control": "no-cache",
  "pragma": "no-cache",
  "upgrade-insecure-requests": "1",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": DEFAULT_HEADERS["user-agent"],
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: DEFAULT_HEADERS,
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html || html.length < 1000) return null;
    return { html, finalUrl: res.url || url };
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
  const jsonLd = parseJsonLdScripts(html);

  const title = toNonEmptyString(
    $("h1.ui-pdp-title").first().text(),
  ) ?? toNonEmptyString($('meta[property="og:title"]').attr("content")) ??
    jsonLd.title;

  const imageUrl = toNonEmptyString(
    $('meta[property="og:image"]').attr("content"),
  ) ??
    toNonEmptyString($('meta[name="twitter:image"]').attr("content")) ??
    toNonEmptyString($(".ui-pdp-gallery__figure img").first().attr("src")) ??
    toNonEmptyString(html.match(/"secure_thumbnail"\s*:\s*"([^"]+)"/i)?.[1]) ??
    toNonEmptyString(html.match(/"thumbnail"\s*:\s*"([^"]+)"/i)?.[1]) ??
    jsonLd.imageUrl;

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
  const currentFromMeta = toPrice($('meta[itemprop="price"]').attr("content"));
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

  // Regra de negocio: sempre priorizar o menor preco a vista disponivel,
  // mas ignorando valores implausiveis para o tipo de produto.
  const price = pickBestCurrentPrice(
    title,
    currentFromParts,
    jsonLd.price,
    currentFromMeta,
    currentFromProductMeta,
    currentFromOgMeta,
    currentFromPreloadValue,
    currentFromPreloadAmount,
    currentFromRegex,
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
  const oldFromStructured = pickPrioritizedOldPrice(
    price,
    [jsonLd.oldPrice, oldFromRegex, oldFromOriginalValue],
  );
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
  ) ?? toNumber($('meta[itemprop="ratingValue"]').attr("content")) ??
    jsonLd.rating;

  const reviewCount = parseReviewCount(
    $(".ui-pdp-review__amount").first().text(),
  ) ?? toNumber($('meta[itemprop="reviewCount"]').attr("content")) ??
    jsonLd.reviewCount;

  const sellerName = toNonEmptyString(
    $(".ui-pdp-seller__header__title").first().text(),
  ) ??
    toNonEmptyString($(".ui-pdp-media__title").first().text()) ??
    jsonLd.sellerName;

  const bodyText = $("body").text().toLowerCase();
  const availability: Availability = bodyText.includes("sem estoque") ||
      bodyText.includes("indispon")
    ? "out_of_stock"
    : bodyText.includes("estoque") || bodyText.includes("dispon")
    ? "in_stock"
    : "unknown";

  const brand = parseBrandFromSpecs($) ?? jsonLd.brand;
  const currency = toNonEmptyString(
    $('meta[property="product:price:currency"]').attr("content"),
  ) ??
    toNonEmptyString(
      html.match(/"currency_id"\s*:\s*"([A-Z]{3})"/i)?.[1],
    ) ??
    jsonLd.currency ??
    "BRL";

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

function pickBrandFromAttributes(attributes: MlItemAttribute[] | undefined): string | null {
  if (!attributes?.length) return null;
  const byId = attributes.find((attribute) =>
    String(attribute.id ?? "").toUpperCase() === "BRAND"
  );
  if (byId?.value_name) return byId.value_name;
  const byName = attributes.find((attribute) =>
    String(attribute.name ?? "").toLowerCase() === "marca"
  );
  if (byName?.value_name) return byName.value_name;
  return null;
}

async function fetchMlSellerName(sellerId: number): Promise<string | null> {
  const user = await fetchJson<MlUserResponse>(
    `https://api.mercadolibre.com/users/${sellerId}`,
  );
  return toNonEmptyString(user?.nickname);
}

async function fetchMlItem(itemId: string) {
  const item = await fetchJson<MlItemResponse>(
    `https://api.mercadolibre.com/items/${itemId}`,
  );
  if (!item) return null;

  const sellerName = item.seller_id
    ? await fetchMlSellerName(item.seller_id)
    : null;

  const availability: Availability = typeof item.available_quantity === "number"
    ? (item.available_quantity > 0 ? "in_stock" : "out_of_stock")
    : "unknown";

  return {
    itemId: extractMlItemId(item.id ?? itemId),
    title: toNonEmptyString(item.title),
    productUrl: toNonEmptyString(item.permalink),
    imageUrl: toNonEmptyString(
      item.pictures?.[0]?.secure_url ??
        item.pictures?.[0]?.url ??
        item.secure_thumbnail ??
        item.thumbnail,
    ),
    price: toPrice(item.price),
    oldPrice: toPrice(item.original_price),
    sellerName,
    brand: pickBrandFromAttributes(item.attributes),
    availability,
    currency: toNonEmptyString(item.currency_id) ?? "BRL",
  };
}

function slugFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const firstPart = parsed.pathname.split("/").filter(Boolean)[0];
    if (!firstPart) return null;
    const normalized = firstPart.replace(/-/g, " ").replace(/\s+/g, " ").trim();
    return normalized.length >= 3 ? normalized : null;
  } catch {
    return null;
  }
}

async function searchItemIdBySlug(url: string): Promise<string | null> {
  const query = slugFromUrl(url);
  if (!query) return null;

  const response = await fetchJson<{ results?: Array<{ id?: string }> }>(
    `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=5`,
  );
  return extractMlItemId(response?.results?.[0]?.id);
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

  let itemId = extractItemIdFromUrl(normalizedUrl);
  if (!itemId) {
    itemId = await searchItemIdBySlug(normalizedUrl);
  }

  const [apiSnapshot, htmlSnapshot] = await Promise.all([
    itemId ? fetchMlItem(itemId) : Promise.resolve(null),
    fetchHtml(normalizedUrl),
  ]);

  const htmlParsed = htmlSnapshot
    ? parseHtmlSnapshot(htmlSnapshot.html, htmlSnapshot.finalUrl)
    : null;

  const title = apiSnapshot?.title ?? htmlParsed?.title ?? slugFromUrl(normalizedUrl);
  const price = pickMinPrice(
    apiSnapshot?.price ?? null,
    htmlParsed?.price ?? null,
  );
  const oldPrice = pickPrioritizedOldPrice(
    price,
    [
      apiSnapshot?.oldPrice ?? null,
      htmlParsed?.oldPrice ?? null,
    ],
  );
  const imageUrl = htmlParsed?.imageUrl ?? apiSnapshot?.imageUrl ?? null;
  const productUrl = htmlParsed?.productUrl ?? apiSnapshot?.productUrl ?? normalizedUrl;
  const sellerName = htmlParsed?.sellerName ?? apiSnapshot?.sellerName ?? null;
  const brand = htmlParsed?.brand ?? apiSnapshot?.brand ?? null;
  const availability = htmlParsed?.availability ?? apiSnapshot?.availability ?? "unknown";
  const currency = htmlParsed?.currency ?? apiSnapshot?.currency ?? "BRL";
  const rating = htmlParsed?.rating ?? null;
  const reviewCount = htmlParsed?.reviewCount ?? null;
  const discountPct = computeDiscountPct(price, oldPrice);

  if (!title) {
    throw new Error(
      "Nao foi possivel extrair titulo do produto. Tente outro link do produto ou reprocessar em alguns segundos.",
    );
  }
  if (price === null && !imageUrl) {
    throw new Error(
      "Nao foi possivel extrair preco/imagem com confianca. Tente novamente em alguns segundos.",
    );
  }

  const extractionMethod: MercadoLivreOfferPreview["extractionMethod"] = apiSnapshot && htmlParsed
    ? "ml_api_html"
    : apiSnapshot
    ? "ml_api"
    : htmlParsed
    ? "ml_html"
    : "ml_url";

  return {
    marketplace: "mercadolivre",
    sourceUrl: normalizedUrl,
    productUrl,
    affiliateUrl: input.affiliateUrl?.trim() || normalizedUrl,
    itemId: apiSnapshot?.itemId ?? itemId,
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
    raw: {
      item_id: apiSnapshot?.itemId ?? itemId,
      api: apiSnapshot,
      html: htmlParsed,
      url: normalizedUrl,
    },
  };
}
