import { load } from "cheerio";
import { normalizeAmazonImageUrl } from "@/lib/amazon";
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
  availability: Availability;
}

interface OpenGraphExtraction {
  title: string | null;
  imageUrl: string | null;
  price: number | null;
}

export type AmazonOfferPreview = {
  marketplace: "amazon";
  sourceUrl: string;
  productUrl: string;
  affiliateUrl: string;
  asin: string | null;
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
  extractionMethod: "amazon_html_jsonld" | "amazon_html" | "amazon_jsonld" | "amazon_url";
  extractionLayer: ExtractionLayer;
  raw: Record<string, unknown>;
};

function toNonEmptyString(value: unknown): string | null {
  const out = String(value ?? "").trim();
  return out.length > 0 ? out : null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  let raw = String(value).trim();
  if (!raw) return null;

  raw = raw
    .replace(/\u00a0/g, "")
    .replace(/\\u00a0/g, "")
    .replace(/R\$/gi, "")
    .replace(/US\$/gi, "")
    .replace(/[^\d,.-]/g, "");

  if (!raw) return null;

  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) {
    raw = raw.replace(/,/g, "");
  } else {
    const hasDot = raw.includes(".");
    const hasComma = raw.includes(",");
    if (hasDot && hasComma) {
      if (raw.lastIndexOf(",") > raw.lastIndexOf(".")) {
        raw = raw.replace(/\./g, "").replace(",", ".");
      } else {
        raw = raw.replace(/,/g, "");
      }
    } else if (hasComma && !hasDot) {
      raw = raw.replace(",", ".");
    }
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPrice(value: unknown): number | null {
  const parsed = toNumber(value);
  if (parsed === null || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

function parseAmountFromParts(wholeText: string | null, fractionText: string | null): number | null {
  const wholeDigits = String(wholeText ?? "").replace(/[^\d]/g, "");
  if (!wholeDigits) return null;

  const fractionDigits = String(fractionText ?? "").replace(/[^\d]/g, "");
  if (!fractionDigits) {
    return toPrice(wholeDigits);
  }

  const cents = fractionDigits.length === 1
    ? `${fractionDigits}0`
    : fractionDigits.slice(0, 2);

  return toPrice(`${wholeDigits},${cents}`);
}

function computeDiscountPct(price: number | null, oldPrice: number | null): number | null {
  if (price === null || oldPrice === null || oldPrice <= price) return null;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}

function parseRating(value: string | null): number | null {
  if (!value) return null;
  const matched = value.match(/([0-9]+(?:[.,][0-9]+)?)/);
  return matched ? toNumber(matched[1]) : null;
}

function parseReviewCount(value: string | null): number | null {
  if (!value) return null;
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
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
  const valid = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  return valid.length ? Math.min(...valid) : null;
}

function pickMaxOldPrice(
  currentPrice: number | null,
  ...values: Array<number | null | undefined>
): number | null {
  const valid = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  if (!valid.length) return null;
  if (currentPrice === null) return Math.max(...valid);
  const above = valid.filter((value) => value > currentPrice);
  return above.length ? Math.max(...above) : null;
}

function minPlausiblePriceByTitle(title: string | null): number {
  const text = String(title ?? "").toLowerCase();
  const highTicketKeywords = [
    "monitor",
    "notebook",
    "smartphone",
    "iphone",
    "galaxy",
    "tv",
    "smart tv",
    "playstation",
    "ps5",
    "geladeira",
    "ar-condicionado",
    "placa de video",
  ];
  if (highTicketKeywords.some((keyword) => text.includes(keyword))) {
    return 100;
  }
  return 5;
}

function pickBestCurrentPrice(title: string | null, ...values: Array<number | null | undefined>): number | null {
  const floor = minPlausiblePriceByTitle(title);
  const plausible = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value >= floor,
  );
  if (plausible.length) return Math.min(...plausible);
  return pickMinPrice(...values);
}

function cleanUrl(rawUrl: string): string {
  const url = new URL(rawUrl.trim());
  url.hash = "";
  return url.toString();
}

function dedupeUrls(urls: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const value = String(raw ?? "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function ensureAmazonUrl(rawUrl: string): void {
  const host = new URL(rawUrl).hostname.toLowerCase();
  if (!host.includes("amazon.") && !host.endsWith("amzn.to")) {
    throw new Error("URL nao pertence a Amazon.");
  }
}

function extractAsin(value: unknown): string | null {
  const raw = String(value ?? "").toUpperCase();
  if (!raw) return null;

  const byPath = raw.match(/\/(?:DP|GP\/PRODUCT|PRODUCT)\/([A-Z0-9]{10})(?:[/?]|$)/i);
  if (byPath?.[1]) return byPath[1].toUpperCase();

  const byAsinKey = raw.match(/[?&]ASIN=([A-Z0-9]{10})(?:[&#]|$)/i);
  if (byAsinKey?.[1]) return byAsinKey[1].toUpperCase();

  const generic = raw.match(/\b([A-Z0-9]{10})\b/);
  return generic?.[1] ? generic[1].toUpperCase() : null;
}

function canonicalAmazonUrl(finalUrl: string, asin: string | null): string {
  if (asin) return `https://www.amazon.com.br/dp/${asin}`;
  try {
    const url = new URL(finalUrl);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return finalUrl;
  }
}

function buildAffiliateUrl(productUrl: string, explicitAffiliateUrl: string | null | undefined): string {
  if (explicitAffiliateUrl && explicitAffiliateUrl.trim()) {
    return explicitAffiliateUrl.trim();
  }

  const affiliateTag =
    process.env.AMAZON_AFFILIATE_TAG?.trim() ||
    process.env.AMAZON_STORE_ID?.trim() ||
    "radarsmart202-20";
  if (!affiliateTag) return productUrl;

  try {
    const url = new URL(productUrl);
    url.searchParams.set("tag", affiliateTag);
    return url.toString();
  } catch {
    return productUrl;
  }
}

function isCaptchaOrBlockedPage(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("enter the characters you see below") ||
    lower.includes("digite os caracteres que voce ve") ||
    lower.includes("api-services-support@amazon.com") ||
    lower.includes("sorry, we just need to make sure you") ||
    lower.includes("robot check")
  );
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const result = await fetchHtmlWithRotation({
      url,
      timeoutMs: 12000,
      maxAttempts: 3,
      minHtmlLength: 1200,
      blockedPatterns: [
        /enter the characters you see below/i,
        /robot check/i,
        /captcha/i,
        /api-services-support@amazon.com/i,
      ],
    });
    const html = result.html;
    if (!html || html.length < 1000) return null;
    if (isCaptchaOrBlockedPage(html)) {
      throw new Error("Amazon bloqueou a requisicao (captcha/robot check).");
    }
    return { html, finalUrl: result.finalUrl || url };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    return null;
  }
}

async function fetchBestHtmlSnapshot(
  candidateUrls: string[],
): Promise<{ html: string; finalUrl: string } | null> {
  let best:
    | {
        html: string;
        finalUrl: string;
        score: number;
      }
    | null = null;

  for (const candidateUrl of candidateUrls) {
    try {
      const snapshot = await fetchHtml(candidateUrl);
      if (!snapshot) continue;

      const parsed = parseHtmlSnapshot(snapshot.html, snapshot.finalUrl);
      let score = 0;
      if (parsed.title) score += 1;
      if (parsed.imageUrl) score += 1;
      if (parsed.price !== null) score += 1;

      if (score >= 3) {
        return snapshot;
      }

      if (!best || score > best.score) {
        best = { ...snapshot, score };
      }
    } catch {
      // tenta próxima variação de URL
    }
  }

  if (!best) return null;
  return { html: best.html, finalUrl: best.finalUrl };
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
    availability: "unknown",
  };

  for (const scriptText of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(scriptText);
    } catch {
      continue;
    }

    const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      const object = node as Record<string, unknown>;

      if (Array.isArray(object["@graph"])) {
        queue.push(...object["@graph"]);
      }

      const type = String(object["@type"] ?? "").toLowerCase();
      if (!type.includes("product")) continue;

      result.title ??= toNonEmptyString(object.name);
      result.imageUrl ??=
        (Array.isArray(object.image)
          ? toNonEmptyString((object.image as unknown[])[0])
          : toNonEmptyString(object.image));
      if (result.imageUrl) {
        result.imageUrl = normalizeAmazonImageUrl(result.imageUrl);
      }

      const brandRaw = object.brand;
      if (typeof brandRaw === "object" && brandRaw !== null) {
        result.brand ??= toNonEmptyString((brandRaw as Record<string, unknown>).name);
      } else {
        result.brand ??= toNonEmptyString(brandRaw);
      }

      const agg = object.aggregateRating;
      if (typeof agg === "object" && agg !== null) {
        const aggObj = agg as Record<string, unknown>;
        result.rating ??= toNumber(aggObj.ratingValue);
        result.reviewCount ??= toNumber(aggObj.reviewCount);
      }

      const offersRaw = object.offers;
      const offers = Array.isArray(offersRaw)
        ? (offersRaw as Array<Record<string, unknown>>)
        : (offersRaw && typeof offersRaw === "object"
          ? [offersRaw as Record<string, unknown>]
          : []);

      if (offers.length > 0) {
        const prices = offers
          .map((offer) => toPrice(offer.price))
          .filter((price): price is number => typeof price === "number");
        if (prices.length > 0) {
          result.price ??= Math.min(...prices);
        }

        result.currency ??= offers
          .map((offer) => toNonEmptyString(offer.priceCurrency))
          .find(Boolean) ?? null;

        const firstOffer = offers[0];
        if (firstOffer) {
          result.oldPrice ??=
            toPrice(firstOffer.highPrice) ??
            toPrice(firstOffer.priceBeforeDiscount) ??
            toPrice(firstOffer.listPrice);

          const availability = String(firstOffer.availability ?? "").toLowerCase();
          if (availability.includes("instock")) result.availability = "in_stock";
          if (availability.includes("outofstock")) result.availability = "out_of_stock";

          const sellerRaw = firstOffer.seller;
          if (typeof sellerRaw === "object" && sellerRaw !== null) {
            result.sellerName ??= toNonEmptyString(
              (sellerRaw as Record<string, unknown>).name,
            );
          }
        }
      }
    }
  }

  return result;
}

function parseOpenGraphSnapshot(html: string): OpenGraphExtraction {
  const $ = load(html);
  return {
    title:
      toNonEmptyString($('meta[property="og:title"]').attr("content")) ??
      toNonEmptyString($("title").first().text()),
    imageUrl: normalizeAmazonImageUrl(
      toNonEmptyString($('meta[property="og:image"]').attr("content")),
    ),
    price:
      toPrice($('meta[property="product:price:amount"]').attr("content")) ??
      toPrice($('meta[property="og:price:amount"]').attr("content")) ??
      toPrice($('meta[itemprop="price"]').attr("content")),
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

function parseBrandFromDetails($: ReturnType<typeof load>): string | null {
  const byline = toNonEmptyString($("#bylineInfo").first().text());
  if (byline) return byline.replace(/^marca:\s*/i, "").trim();

  const rows = $("#productOverview_feature_div tr, #detailBullets_feature_div li").toArray();
  for (const row of rows) {
    const text = $(row).text().replace(/\s+/g, " ").trim();
    if (!/marca|brand/i.test(text)) continue;
    const candidates = $(row)
      .find("td, span, a")
      .toArray()
      .map((node) => $(node).text().replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (candidates.length > 0) {
      const value = candidates[candidates.length - 1];
      if (!/marca|brand/i.test(value)) return value;
    }
  }

  return null;
}

function parseHtmlSnapshot(html: string, finalUrl: string) {
  const $ = load(html);

  const title =
    toNonEmptyString($("#productTitle").first().text()) ??
    toNonEmptyString($("#title").first().text());

  const imageFromDataDynamic = (() => {
    const raw = toNonEmptyString($("#landingImage").attr("data-a-dynamic-image"));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const first = Object.keys(parsed)[0];
      return toNonEmptyString(first);
    } catch {
      return null;
    }
  })();

  const rawImageUrl =
    toNonEmptyString($('meta[property="og:image"]').attr("content")) ??
    toNonEmptyString($('meta[name="og:image"]').attr("content")) ??
    toNonEmptyString($("#landingImage").attr("data-old-hires")) ??
    toNonEmptyString($("#landingImage").attr("data-a-hires")) ??
    imageFromDataDynamic ??
    toNonEmptyString($("#imgTagWrapperId img").attr("data-old-hires")) ??
    toNonEmptyString($("#landingImage").attr("src")) ??
    toNonEmptyString($("#imgTagWrapperId img").attr("src")) ??
    toNonEmptyString($("#main-image-container img").first().attr("src")) ??
    toNonEmptyString($("#altImages img").first().attr("src")) ??
    toNonEmptyString(
      html.match(/"mainUrl"\s*:\s*"([^"]+)"/i)?.[1]?.replace(/\\u0026/g, "&"),
    ) ??
    toNonEmptyString(
      html.match(/"hiRes"\s*:\s*"([^"]+)"/i)?.[1]?.replace(/\\u0026/g, "&"),
    );
  const imageUrl = normalizeAmazonImageUrl(rawImageUrl);

  const canonical =
    toNonEmptyString($('link[rel="canonical"]').attr("href")) ??
    toNonEmptyString($('meta[property="og:url"]').attr("content")) ??
    finalUrl;

  const asin =
    extractAsin(canonical) ??
    extractAsin(toNonEmptyString($("#ASIN").attr("value"))) ??
    extractAsin(html.match(/"asin"\s*:\s*"([A-Z0-9]{10})"/i)?.[1]) ??
    extractAsin(finalUrl);

  const currentWhole =
    toNonEmptyString($("#corePriceDisplay_desktop_feature_div .a-price .a-price-whole").first().text()) ??
    toNonEmptyString($("#corePrice_feature_div .a-price .a-price-whole").first().text()) ??
    toNonEmptyString($("#apex_desktop .a-price .a-price-whole").first().text()) ??
    toNonEmptyString($("#tp_price_block_total_price_ww .a-price-whole").first().text());
  const currentFraction =
    toNonEmptyString($("#corePriceDisplay_desktop_feature_div .a-price .a-price-fraction").first().text()) ??
    toNonEmptyString($("#corePrice_feature_div .a-price .a-price-fraction").first().text()) ??
    toNonEmptyString($("#apex_desktop .a-price .a-price-fraction").first().text()) ??
    toNonEmptyString($("#tp_price_block_total_price_ww .a-price-fraction").first().text());
  const currentFromParts = parseAmountFromParts(currentWhole, currentFraction);
  const currentFromTwisterModel = pickMinPrice(
    toPrice($("#twister-plus-price-data-model").first().text()),
    toPrice($("#twister-plus-price-data-model").first().attr("data-price")),
    toPrice($("#twister-plus-price-data-model .a-offscreen").first().text()),
  );

  const priceFromSelectors = pickMinPrice(
    currentFromParts,
    currentFromTwisterModel,
    toPrice($("#twister-plus-price-data-price-unit").first().text()),
    toPrice($("#apexPriceToPay .a-offscreen").first().text()),
    toPrice($("#apex_desktop #corePrice_feature_div .a-offscreen").first().text()),
    toPrice($("#corePrice_feature_div #corePriceDisplay_desktop_feature_div .a-offscreen").first().text()),
    toPrice($("#desktop_qualifiedBuyBox .a-price .a-offscreen").first().text()),
    toPrice($("#corePriceDisplay_desktop_feature_div .a-price .a-offscreen").first().text()),
    toPrice($("#corePrice_feature_div .a-price .a-offscreen").first().text()),
    toPrice($("#apex_desktop .a-price .a-offscreen").first().text()),
    toPrice($("#priceblock_dealprice").first().text()),
    toPrice($("#priceblock_ourprice").first().text()),
    toPrice($("#priceblock_saleprice").first().text()),
    toPrice($("#newBuyBoxPrice").first().text()),
  );

  const priceFromJson = pickMinPrice(
    toPrice(html.match(/"priceToPay"\s*:\s*\{[^}]*"priceAmount"\s*:\s*([0-9.]+)/i)?.[1]),
    toPrice(html.match(/"priceToPay"\s*:\s*\{[^}]*"price"\s*:\s*([0-9.]+)/i)?.[1]),
    toPrice(html.match(/"displayPrice"\s*:\s*"([^"]+)"/i)?.[1]),
    toPrice(html.match(/"priceAmount"\s*:\s*([0-9.]+)/i)?.[1]),
    toPrice(html.match(/"buyingPrice"\s*:\s*([0-9.]+)/i)?.[1]),
  );

  const priceFromTitle = pickMinPrice(
    ...extractPricesFromText(toNonEmptyString($('meta[property="og:title"]').attr("content"))),
  );

  const price = pickBestCurrentPrice(
    title,
    priceFromSelectors,
    priceFromJson,
    priceFromTitle,
  );

  const oldWhole =
    toNonEmptyString($("#corePriceDisplay_desktop_feature_div .a-price.a-text-price .a-price-whole").first().text()) ??
    toNonEmptyString($("#corePriceDisplay_desktop_feature_div .basisPrice .a-price-whole").first().text()) ??
    toNonEmptyString($("#corePrice_feature_div .a-price.a-text-price .a-price-whole").first().text()) ??
    toNonEmptyString($(".a-text-price .a-price-whole").first().text());
  const oldFraction =
    toNonEmptyString($("#corePriceDisplay_desktop_feature_div .a-price.a-text-price .a-price-fraction").first().text()) ??
    toNonEmptyString($("#corePriceDisplay_desktop_feature_div .basisPrice .a-price-fraction").first().text()) ??
    toNonEmptyString($("#corePrice_feature_div .a-price.a-text-price .a-price-fraction").first().text()) ??
    toNonEmptyString($(".a-text-price .a-price-fraction").first().text());
  const oldFromParts = parseAmountFromParts(oldWhole, oldFraction);

  const oldPrice = pickMaxOldPrice(
    price,
    oldFromParts,
    toPrice($("#corePriceDisplay_desktop_feature_div .a-price.a-text-price .a-offscreen").first().text()),
    toPrice($("#corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen").first().text()),
    toPrice($("#priceblock_listprice").first().text()),
    toPrice($(".priceBlockStrikePriceString").first().text()),
    toPrice(html.match(/"listPrice"\s*:\s*\{[^}]*"amount"\s*:\s*([0-9.]+)/i)?.[1]),
    toPrice(html.match(/"priceBeforeDiscount"\s*:\s*([0-9.]+)/i)?.[1]),
  );

  const rating =
    parseRating(toNonEmptyString($("#acrPopover").attr("title"))) ??
    parseRating(toNonEmptyString($("span.a-icon-alt").first().text())) ??
    parseRating(toNonEmptyString(html.match(/"ratingValue"\s*:\s*"([^"]+)"/i)?.[1]));

  const reviewCount =
    parseReviewCount(toNonEmptyString($("#acrCustomerReviewText").first().text())) ??
    parseReviewCount(toNonEmptyString(html.match(/"reviewCount"\s*:\s*"([^"]+)"/i)?.[1]));

  const sellerName =
    toNonEmptyString($("#merchantInfo").first().text()) ??
    toNonEmptyString($("#sellerProfileTriggerId").first().text());

  const availabilityText =
    toNonEmptyString($("#availability span").first().text()) ??
    toNonEmptyString($("#availability").first().text());
  const availability: Availability = availabilityText
    ? (/indispon|out of stock|temporariamente sem estoque/i.test(availabilityText)
      ? "out_of_stock"
      : /em estoque|in stock|dispon/i.test(availabilityText)
      ? "in_stock"
      : "unknown")
    : "unknown";

  const brand = parseBrandFromDetails($);

  const currency =
    toNonEmptyString($('meta[property="product:price:currency"]').attr("content")) ??
    (price !== null ? "BRL" : null);

  return {
    asin,
    title,
    imageUrl,
    productUrl: canonicalAmazonUrl(canonical, asin),
    price,
    oldPrice,
    rating,
    reviewCount,
    sellerName,
    brand,
    availability,
    currency: currency ?? "BRL",
  };
}

export function mapToAdminProdutoAmazon(preview: AmazonOfferPreview): {
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
    id: preview.asin ?? crypto.randomUUID(),
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

export async function extractAmazonOffer(input: {
  url: string;
  affiliateUrl?: string | null;
}): Promise<AmazonOfferPreview> {
  if (!input.url?.trim()) {
    throw new Error("URL obrigatoria.");
  }

  ensureAmazonUrl(input.url);
  const sourceUrl = cleanUrl(input.url);
  const sourceAsin = extractAsin(sourceUrl);
  const htmlCandidates = dedupeUrls([
    sourceUrl,
    sourceAsin ? `https://www.amazon.com.br/dp/${sourceAsin}` : null,
    sourceAsin ? `https://www.amazon.com.br/gp/aw/d/${sourceAsin}` : null,
  ]);

  const htmlSnapshot = await fetchBestHtmlSnapshot(htmlCandidates);
  if (!htmlSnapshot) {
    throw new Error("Nao foi possivel obter HTML da Amazon.");
  }

  const htmlParsed = parseHtmlSnapshot(htmlSnapshot.html, htmlSnapshot.finalUrl);
  const jsonLd = parseJsonLdScripts(htmlSnapshot.html);
  const openGraph = parseOpenGraphSnapshot(htmlSnapshot.html);

  const asin = htmlParsed.asin ?? extractAsin(htmlSnapshot.finalUrl);
  const productUrl = canonicalAmazonUrl(htmlParsed.productUrl || htmlSnapshot.finalUrl, asin);
  const affiliateUrl = buildAffiliateUrl(productUrl, input.affiliateUrl);

  const title = jsonLd.title ?? openGraph.title ?? htmlParsed.title;
  const imageUrl = normalizeAmazonImageUrl(
    openGraph.imageUrl ?? jsonLd.imageUrl ?? htmlParsed.imageUrl,
  );
  const price = pickBestCurrentPrice(title, jsonLd.price, openGraph.price, htmlParsed.price);
  const oldPrice = pickMaxOldPrice(price, jsonLd.oldPrice, htmlParsed.oldPrice);
  const rating = htmlParsed.rating ?? jsonLd.rating;
  const reviewCount = htmlParsed.reviewCount ?? jsonLd.reviewCount;
  const sellerName = htmlParsed.sellerName ?? jsonLd.sellerName;
  const brand = htmlParsed.brand ?? jsonLd.brand;
  const availability = htmlParsed.availability !== "unknown"
    ? htmlParsed.availability
    : jsonLd.availability;
  const currency = htmlParsed.currency ?? jsonLd.currency ?? "BRL";
  const discountPct = computeDiscountPct(price, oldPrice);

  const safeTitle = title ?? `Produto Amazon ${asin ?? ""}`.trim();

  const extractionMethod: AmazonOfferPreview["extractionMethod"] = htmlParsed.title && jsonLd.title
    ? "amazon_html_jsonld"
    : htmlParsed.title
    ? "amazon_html"
    : jsonLd.title
    ? "amazon_jsonld"
    : "amazon_url";
  const extractionLayer = detectExtractionLayer({
    jsonLd,
    openGraph,
    dom: { title: htmlParsed.title, imageUrl: htmlParsed.imageUrl, price: htmlParsed.price },
  });

  return {
    marketplace: "amazon",
    sourceUrl,
    productUrl,
    affiliateUrl,
    asin,
    title: safeTitle,
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
      asin,
      html: htmlParsed,
      json_ld: jsonLd,
      open_graph: openGraph,
      extraction_layer: extractionLayer,
      final_url: htmlSnapshot.finalUrl,
      source_url: sourceUrl,
    },
  };
}
