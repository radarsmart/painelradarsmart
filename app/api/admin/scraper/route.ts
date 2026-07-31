import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { normalizeMercadoLivreAffiliateUrl } from "@/lib/mercadolivre";
import { getValidToken, salvarOferta, supabaseAdmin } from "@/lib/supabase";
import { extractWithContainerEngine } from "@/lib/scraping/container-engine";
import { mapToAdminProdutoML } from "@/lib/scraping/mercadolivre-extractor";
import { mapToAdminProdutoAmazon } from "@/lib/scraping/amazon-extractor";
import { computeProfitPotential } from "@/lib/radar-sniper";
import {
  extractMercadoLivreItemId,
  extractMercadoLivreHtmlMetadata,
  extractMercadoLivreOfficial,
} from "@/lib/scraping/mercadolivre-official";
import { extractMercadoLivreWithBrightData } from "@/lib/scraping/mercadolivre-brightdata";
import { extractMercadoLivreWithZenscrape } from "@/lib/scraping/mercadolivre-zenscrape";
import { extractAmazonWithRainforest } from "@/lib/scraping/amazon-rainforest";
import { extractShopeeOffer } from "@/lib/scraping/shopee-extractor";
import { extractBrandModel } from "@/lib/scraper/brand-model-extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Marketplace = "mercadolivre" | "amazon" | "shopee";
type ExtractionStatus = "ok" | "partial_failure";
type ExtractionLayer =
  | "zenscrape_api"
  | "ml_api"
  | "rainforest_api"
  | "json_ld"
  | "open_graph"
  | "dom"
  | "mixed"
  | "none";

type DebugLayer =
  | "rainforest"
  | "zenscrape"
  | "official"
  | "brightdata"
  | "container"
  | "merged"
  | "html"
  | "apify";
type ApifyMlItem = Record<string, unknown>;

const ML_OFFICIAL_OPERATION_TIMEOUT_MS = 9000;
const ML_BRIGHTDATA_OPERATION_TIMEOUT_MS = 6500;
const ML_HTML_OPERATION_TIMEOUT_MS = 6000;
const ML_ZENSCRAPE_OPERATION_TIMEOUT_MS = 7500;
const ML_APIFY_OPERATION_TIMEOUT_MS = 5000;
const ML_APIFY_FETCH_TIMEOUT_MS = 4500;
const ML_PREVIEW_OFFICIAL_TIMEOUT_MS = 3200;
const ML_PREVIEW_BRIGHTDATA_TIMEOUT_MS = 4500;
const ML_PREVIEW_HTML_TIMEOUT_MS = 4000;
const ML_PREVIEW_APIFY_TIMEOUT_MS = 4000;

type ShopeeProductData = {
  title: string;
  price: number | null;
  old_price: number | null;
  image_url: string;
  product_url: string;
  affiliate_url: string;
  raw_data: Record<string, unknown>;
  extraction_layer: ExtractionLayer;
};

type ExtractPreviewPayload = {
  asin?: string | null;
  title: string;
  price: number;
  old_price: number;
  original_price: number;
  final_price?: number;
  image_url: string;
  product_url: string;
  affiliate_url: string;
  permalink?: string;
  condition?: string | null;
  status?: string | null;
  coupon_code?: string | null;
  coupon_discount_pct?: number | null;
  momentum_score?: number;
};

type SuccessResponse = {
  success: true;
  status: ExtractionStatus;
  missing_fields: string[];
  marketplace: Marketplace;
  engine: string;
  extraction_layer: ExtractionLayer;
  elapsed_ms: number;
  title: string;
  price: number;
  old_price: number;
  image: string;
  image_url: string;
  product_url: string;
  affiliate_url: string;
  final_price?: number;
  coupon_code?: string | null;
  coupon_discount_pct?: number | null;
  momentum_score?: number;
  brand?: string | null;
  model?: string | null;
  preview: ExtractPreviewPayload;
  extracted: Record<string, unknown>;
  offer_id?: string | null;
  offer_status?: string | null;
  needs_review?: boolean;
  debug_info?: {
    layer_used: DebugLayer;
    missing_fields: string[];
    latency_ms: number;
  };
  error?: string;
};

type AmazonProductData = {
  asin: string | null;
  title: string;
  price: number | null;
  old_price: number | null;
  image_url: string;
  product_url: string;
  affiliate_url: string;
  raw_data: Record<string, unknown>;
};

function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function paidScraperFallbacksEnabled(): boolean {
  return toText(process.env.ENABLE_PAID_SCRAPER_FALLBACKS).toLowerCase() === "true";
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function resolveMercadoLivreExtractionUrl(sourceUrl: string, affiliateUrl: string): string {
  const normalizedSourceUrl = toText(sourceUrl);
  const normalizedAffiliateUrl = toText(affiliateUrl);

  if (normalizedSourceUrl) {
    const sourceLower = normalizedSourceUrl.toLowerCase();
    if (
      sourceLower.includes("mercadolivre.") ||
      sourceLower.includes("mercadolibre.")
    ) {
      return normalizedSourceUrl;
    }
  }

  if (!normalizedAffiliateUrl) return normalizedSourceUrl;

  const affiliateLower = normalizedAffiliateUrl.toLowerCase();
  if (
    affiliateLower.includes("meli.la/") ||
    affiliateLower.includes("mercadolivre.com") ||
    affiliateLower.includes("mercadolibre.com")
  ) {
    return normalizedAffiliateUrl;
  }

  return normalizedSourceUrl;
}

function hasMercadoLivreEntityCode(value: string): boolean {
  return /ML[A-Z]{1,3}-?\d{6,}/i.test(toText(value));
}

function isMercadoLivreShortenerUrl(value: string): boolean {
  return toText(value).toLowerCase().includes("meli.la/");
}

function isMercadoLivreProductLikeUrl(rawUrl: string): boolean {
  const source = toText(rawUrl);
  if (!source) return false;
  if (isMercadoLivreShortenerUrl(source)) return true;

  try {
    const parsed = new URL(source);
    const pathname = parsed.pathname.toLowerCase();

    if (hasMercadoLivreEntityCode(parsed.pathname)) return true;
    if (hasMercadoLivreEntityCode(parsed.search)) return true;
    if (hasMercadoLivreEntityCode(parsed.hash)) return true;
    if (pathname.includes("/p/") || pathname.includes("/up/")) return true;

    for (const key of ["wid", "item_id", "itemId", "id"]) {
      if (hasMercadoLivreEntityCode(parsed.searchParams.get(key) ?? "")) {
        return true;
      }
    }

    return false;
  } catch {
    return hasMercadoLivreEntityCode(source);
  }
}

function looksLikeMercadoLivreListingUrl(rawUrl: string): boolean {
  const source = toText(rawUrl);
  if (!source || isMercadoLivreShortenerUrl(source)) return false;
  if (isMercadoLivreProductLikeUrl(source)) return false;

  try {
    const parsed = new URL(source);
    const pathname = parsed.pathname.toLowerCase();
    const listLikePaths = [
      "/lista",
      "/ofertas",
      "/catalogo",
      "/catalog",
      "/c/",
      "/jm/",
      "/site/",
    ];
    const listLikeParams = [
      "search_layout",
      "tracking_id",
      "polycard_client",
      "from",
      "as_word",
      "category",
      "filter",
      "filters",
    ];

    return (
      listLikePaths.some((fragment) => pathname.includes(fragment)) ||
      listLikeParams.some((key) => parsed.searchParams.has(key)) ||
      listLikeParams.some((key) => parsed.hash.toLowerCase().includes(key))
    );
  } catch {
    return false;
  }
}

function getMercadoLivreSourceUrlError(rawUrl: string): string | null {
  const source = toText(rawUrl);
  if (!source) return "Campo url obrigatorio.";
  if (isMercadoLivreProductLikeUrl(source)) return null;

  if (looksLikeMercadoLivreListingUrl(source)) {
    return "URL do Mercado Livre invalida para extração. Cole a URL direta do produto (.../p/MLB... ou .../up/MLBU...) e use o meli.la apenas no campo de afiliado.";
  }

  return "URL do Mercado Livre sem identificador de produto. Use a URL direta do produto (.../p/MLB... ou .../up/MLBU...).";
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} excedeu o limite de ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function normalizeCouponDiscountPct(value: unknown): number | null {
  const parsed = toNumber(value);
  if (parsed === null || parsed <= 0) return null;
  return clamp(parsed, 0, 100);
}

function toAbsoluteHttpUrl(value: unknown): string {
  const raw = toText(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return "";
}

function isAmazonImageHost(value: string): boolean {
  const normalized = toText(value).toLowerCase();
  return (
    normalized.includes("media-amazon.com") ||
    normalized.includes("ssl-images-amazon.com") ||
    normalized.includes("images-amazon.com")
  );
}

function readAmazonGalleryImageCandidate(
  item: Record<string, unknown> | string | undefined,
): string {
  if (!item) return "";
  if (typeof item === "string") return toAbsoluteHttpUrl(item);

  const possible = [
    item.link,
    item.url,
    item.image,
    item.large,
    item.main,
    item.hi_res,
    item.hires,
    item.src,
  ];

  for (const candidate of possible) {
    const absolute = toAbsoluteHttpUrl(candidate);
    if (absolute) return absolute;
  }

  return "";
}

function isValidAmazonProductImage(value: string): boolean {
  const normalized = toAbsoluteHttpUrl(value).toLowerCase();
  if (!normalized || !/^https?:\/\//i.test(normalized)) return false;

  if (!isAmazonImageHost(normalized)) {
    return false;
  }

  if (
    normalized.includes("logo") ||
    normalized.includes("icon") ||
    normalized.includes("sprite") ||
    normalized.includes("favicon") ||
    normalized.includes("nav-logo")
  ) {
    return false;
  }

  return true;
}

function pickRainforestImageFromRaw(rawData: Record<string, unknown>): string {
  const dataNode = (rawData.data ?? {}) as Record<string, unknown>;
  const product = (dataNode.product ?? {}) as Record<string, unknown>;

  // Regra da refatoração: estritamente data.product.main_image.link.
  const mainImage = (product.main_image as Record<string, unknown> | undefined) ?? {};
  const strictMain = toAbsoluteHttpUrl(mainImage.link);
  if (isValidAmazonProductImage(strictMain)) {
    return strictMain;
  }

  // Fallback obrigatório: data.product.images[0].link.
  const galleryImages = Array.isArray(product.images)
    ? (product.images as Array<Record<string, unknown> | string>)
    : [];

  const firstGalleryItem = galleryImages[0];
  const firstGalleryLink = readAmazonGalleryImageCandidate(firstGalleryItem);
  if (isValidAmazonProductImage(firstGalleryLink)) {
    return firstGalleryLink;
  }

  // Se images[0] vier inválida, varre o restante da galeria.
  for (const item of galleryImages) {
    const candidateLink = readAmazonGalleryImageCandidate(item);
    if (isValidAmazonProductImage(candidateLink)) {
      return candidateLink;
    }
  }

  return "";
}

function normalizeAmazonProductData(
  amazon: Awaited<ReturnType<typeof extractAmazonWithRainforest>>,
): AmazonProductData {
  const camelImage = toAbsoluteHttpUrl(amazon.imageUrl);
  const snakeImage = toAbsoluteHttpUrl((amazon as { image_url?: unknown }).image_url);
  const rawData = amazon.rawData as Record<string, unknown>;
  const imageDebug = (rawData.image_debug ?? {}) as Record<string, unknown>;
  const manualLandingImage = toAbsoluteHttpUrl(rawData.manual_landing_image_url);
  const manualLandingImageDebug = toAbsoluteHttpUrl(imageDebug.landing_image_fallback);
  const fallbackFromRaw = pickRainforestImageFromRaw(amazon.rawData);

  // Garantia do fluxo Amazon: prioriza payload final e inclui fallback manual do #landingImage.
  const imageUrl =
    snakeImage ||
    camelImage ||
    manualLandingImage ||
    manualLandingImageDebug ||
    fallbackFromRaw;

  const camelProductUrl = toText(amazon.productUrl);
  const snakeProductUrl = toText((amazon as { product_url?: unknown }).product_url);
  const productUrl = snakeProductUrl || camelProductUrl;

  const camelAffiliateUrl = toText(amazon.affiliateUrl);
  const snakeAffiliateUrl = toText((amazon as { affiliate_url?: unknown }).affiliate_url);
  const affiliateUrl = snakeAffiliateUrl || camelAffiliateUrl || productUrl;

  return {
    asin: amazon.asin,
    title: toText(amazon.title),
    price: amazon.price,
    old_price: amazon.oldPrice,
    image_url: imageUrl,
    product_url: productUrl,
    affiliate_url: affiliateUrl,
    raw_data: amazon.rawData,
  };
}

function normalizeShopeeProductData(
  shopee: Awaited<ReturnType<typeof extractShopeeOffer>>,
): ShopeeProductData {
  return {
    title: toText(shopee.title),
    price: shopee.price,
    old_price: shopee.oldPrice,
    image_url: toAbsoluteHttpUrl(shopee.imageUrl),
    product_url: toText(shopee.productUrl) || toText(shopee.sourceUrl),
    affiliate_url: toText(shopee.affiliateUrl) || toText(shopee.productUrl) || toText(shopee.sourceUrl),
    raw_data: shopee.raw,
    extraction_layer: shopee.extractionLayer,
  };
}

function detectMarketplace(url: string, hint?: string): Marketplace | null {
  const normalized = url.toLowerCase();
  if (
    normalized.includes("mercadolivre.") ||
    normalized.includes("mercadolibre.") ||
    normalized.includes("meli.la")
  ) {
    return "mercadolivre";
  }
  if (normalized.includes("amazon.") || normalized.includes("amzn.to")) {
    return "amazon";
  }
  if (normalized.includes("shopee.") || normalized.includes("s.shopee")) {
    return "shopee";
  }

  const hintNormalized = String(hint ?? "").toLowerCase().trim();
  if (
    hintNormalized === "mercadolivre" ||
    hintNormalized === "amazon" ||
    hintNormalized === "shopee"
  ) {
    return hintNormalized;
  }

  return null;
}

function buildFromShopeeHtml(input: {
  elapsedMs: number;
  title: string;
  price: number | null;
  oldPrice: number | null;
  imageUrl: string;
  productUrl: string;
  affiliateUrl: string;
  rawData: Record<string, unknown>;
  extractionLayer: ExtractionLayer;
}): SuccessResponse {
  const validation = buildExtractionStatus({
    title: input.title,
    price: input.price,
    imageUrl: input.imageUrl,
  });

  const preview = {
    title: input.title,
    price: input.price ?? 0,
    old_price: input.oldPrice ?? 0,
    original_price: input.oldPrice ?? 0,
    image_url: input.imageUrl,
    product_url: input.productUrl,
    affiliate_url: input.affiliateUrl,
  };

  return {
    success: true,
    status: validation.status,
    missing_fields: validation.missing_fields,
    marketplace: "shopee",
    engine: "shopee-affiliate-v1",
    extraction_layer: input.extractionLayer,
    elapsed_ms: input.elapsedMs,
    title: input.title,
    price: input.price ?? 0,
    old_price: input.oldPrice ?? 0,
    image: input.imageUrl,
    image_url: input.imageUrl,
    product_url: input.productUrl,
    affiliate_url: input.affiliateUrl,
    preview,
    extracted: input.rawData,
  };
}

function buildExtractionStatus(input: {
  title?: string | null;
  price?: number | null;
  imageUrl?: string | null;
}): { status: ExtractionStatus; missing_fields: string[] } {
  const normalizedImageUrl = String(input.imageUrl ?? "").trim().toLowerCase();
  const validImage =
    Boolean(normalizedImageUrl) &&
    normalizedImageUrl !== "/logo.png" &&
    /^https?:\/\//i.test(normalizedImageUrl);

  const missing_fields: string[] = [];
  if (!String(input.title ?? "").trim()) missing_fields.push("title");
  if (typeof input.price !== "number" || !Number.isFinite(input.price) || input.price <= 0) {
    missing_fields.push("price");
  }
  if (!validImage) missing_fields.push("image_url");

  return {
    status: missing_fields.length > 0 ? "partial_failure" : "ok",
    missing_fields,
  };
}

function extractBrandFromMlAttributes(rawData: Record<string, unknown>): string | null {
  const attributes = rawData.attributes;
  if (!Array.isArray(attributes)) return null;

  const brandAttr = attributes.find(
    (attr) =>
      attr &&
      typeof attr === "object" &&
      (attr as Record<string, unknown>).id === "BRAND",
  ) as Record<string, unknown> | undefined;

  const value = brandAttr?.value_name;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildFromMercadoLivreOfficial(input: {
  elapsedMs: number;
  title: string;
  price: number | null;
  oldPrice: number | null;
  imageUrl: string;
  permalink: string;
  productUrl: string;
  affiliateUrl: string;
  condition?: string | null;
  status?: string | null;
  rawData: Record<string, unknown>;
}): SuccessResponse {
  const validation = buildExtractionStatus({
    title: input.title,
    price: input.price,
    imageUrl: input.imageUrl,
  });

  const preview = {
    title: input.title,
    price: input.price ?? 0,
    old_price: input.oldPrice ?? 0,
    original_price: input.oldPrice ?? 0,
    image_url: input.imageUrl,
    permalink: input.permalink,
    product_url: input.productUrl,
    affiliate_url: input.affiliateUrl,
    condition: input.condition ?? null,
    status: input.status ?? null,
  };

  return {
    success: true,
    status: validation.status,
    missing_fields: validation.missing_fields,
    marketplace: "mercadolivre",
    engine: "ml-official-v2",
    extraction_layer: "ml_api",
    elapsed_ms: input.elapsedMs,
    title: input.title,
    price: input.price ?? 0,
    old_price: input.oldPrice ?? 0,
    image: input.imageUrl,
    image_url: input.imageUrl,
    product_url: input.productUrl,
    affiliate_url: input.affiliateUrl,
    brand: extractBrandFromMlAttributes(input.rawData),
    preview,
    extracted: input.rawData,
  };
}

function isPositivePrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeCommercialValues(
  price: number,
  oldPrice: number,
): { price: number; oldPrice: number } {
  const safePrice = isPositivePrice(price) ? price : 0;
  const safeOldPrice = isPositivePrice(oldPrice) ? oldPrice : 0;

  if (!safePrice && safeOldPrice) {
    return { price: safeOldPrice, oldPrice: 0 };
  }

  if (safeOldPrice > 0 && safeOldPrice <= safePrice) {
    return { price: safePrice, oldPrice: 0 };
  }

  return { price: safePrice, oldPrice: safeOldPrice };
}

function resolveAveragePrice(payload: SuccessResponse): number | null {
  const extracted = payload.extracted;
  const candidates = [
    extracted.average_price,
    extracted.averagePrice,
    (extracted.product as Record<string, unknown> | undefined)?.average_price,
    (extracted.data as Record<string, unknown> | undefined)?.average_price,
  ];

  for (const candidate of candidates) {
    const parsed = toNumber(candidate);
    if (parsed !== null && parsed > 0) return parsed;
  }

  return null;
}

function calculateMomentum(input: {
  title: string;
  marketplace: Marketplace;
  price: number;
  oldPrice: number;
  averagePrice: number | null;
  hasCoupon: boolean;
  raw: Record<string, unknown>;
}): number {
  const baseScore = computeProfitPotential({
    title: input.title,
    marketplace: input.marketplace,
    price: input.price,
    oldPrice: input.oldPrice,
    raw: input.raw,
  });

  const averageLift =
    input.averagePrice && input.averagePrice > input.price
      ? clamp(Math.round(((input.averagePrice - input.price) / input.averagePrice) * 20), 0, 12)
      : 0;
  const couponLift = input.hasCoupon ? 8 : 0;

  return clamp(baseScore + averageLift + couponLift, 0, 100);
}

function enrichResponseWithCoupon(
  payload: SuccessResponse,
  couponCode: string,
  couponDiscountPct: number | null,
): SuccessResponse {
  const normalizedCouponCode = toText(couponCode).toUpperCase();
  const originalPrice = payload.preview.price > 0 ? payload.preview.price : payload.price;
  const finalPrice =
    couponDiscountPct !== null && originalPrice > 0
      ? roundCurrency(originalPrice * (1 - couponDiscountPct / 100))
      : originalPrice;
  const displayOldPrice =
    payload.old_price > originalPrice
      ? payload.old_price
      : couponDiscountPct !== null && finalPrice < originalPrice
        ? originalPrice
        : payload.old_price;
  const averagePrice = resolveAveragePrice(payload);
  const momentumScore = calculateMomentum({
    title: payload.title,
    marketplace: payload.marketplace,
    price: finalPrice,
    oldPrice: displayOldPrice,
    averagePrice,
    hasCoupon: Boolean(normalizedCouponCode),
    raw: payload.extracted,
  });

  return {
    ...payload,
    price: finalPrice,
    old_price: displayOldPrice,
    final_price: finalPrice,
    coupon_code: normalizedCouponCode || null,
    coupon_discount_pct: couponDiscountPct,
    momentum_score: momentumScore,
    preview: {
      ...payload.preview,
      price: finalPrice,
      old_price: displayOldPrice,
      original_price: displayOldPrice,
      final_price: finalPrice,
      coupon_code: normalizedCouponCode || null,
      coupon_discount_pct: couponDiscountPct,
      momentum_score: momentumScore,
    },
    extracted: {
      ...payload.extracted,
      average_price: averagePrice,
      final_price: finalPrice,
      coupon_code: normalizedCouponCode || null,
      coupon_discount_pct: couponDiscountPct,
      momentum_score: momentumScore,
    },
  };
}

function mergeMercadoLivrePayloads(
  zensPayload: SuccessResponse | null,
  officialPayload: SuccessResponse | null,
): SuccessResponse | null {
  if (!zensPayload && !officialPayload) return null;
  if (!zensPayload) return officialPayload;
  if (!officialPayload) return zensPayload;

  const positivePrices = [officialPayload.price, zensPayload.price].filter(isPositivePrice);
  const price = positivePrices.length > 0 ? Math.min(...positivePrices) : 0;

  const officialOldPrice = isPositivePrice(officialPayload.old_price)
    ? officialPayload.old_price
    : 0;
  const zensOldPrice = isPositivePrice(zensPayload.old_price)
    ? zensPayload.old_price
    : 0;

  const oldPrice =
    officialOldPrice > price
      ? officialOldPrice
      : zensOldPrice > price && zensOldPrice !== price
        ? zensOldPrice
        : 0;
  const normalizedCommercial = normalizeCommercialValues(price, oldPrice);

  const title = zensPayload.title || officialPayload.title;
  const imageUrl = zensPayload.image_url || officialPayload.image_url;
  const productUrl = officialPayload.product_url || zensPayload.product_url;
  const affiliateUrl = officialPayload.affiliate_url || zensPayload.affiliate_url;

  const validation = buildExtractionStatus({
    title,
    price,
    imageUrl,
  });

  return {
    success: true,
    status: validation.status,
    missing_fields: validation.missing_fields,
    marketplace: "mercadolivre",
    engine: "ml-merged-v1",
    extraction_layer: "mixed",
    elapsed_ms: Math.max(zensPayload.elapsed_ms, officialPayload.elapsed_ms),
    title,
    price: normalizedCommercial.price,
    old_price: normalizedCommercial.oldPrice,
    image: imageUrl,
    image_url: imageUrl,
    product_url: productUrl,
    affiliate_url: affiliateUrl,
    preview: {
      title,
      price: normalizedCommercial.price,
      old_price: normalizedCommercial.oldPrice,
      original_price: normalizedCommercial.oldPrice,
      image_url: imageUrl,
      permalink:
        toText((officialPayload.preview as { permalink?: unknown } | undefined)?.permalink) ||
        toText((zensPayload.preview as { permalink?: unknown } | undefined)?.permalink),
      product_url: productUrl,
      affiliate_url: affiliateUrl,
      condition:
        toText((officialPayload.preview as { condition?: unknown } | undefined)?.condition) ||
        null,
      status:
        toText((officialPayload.preview as { status?: unknown } | undefined)?.status) ||
        null,
    },
    extracted: {
      zenscrape: zensPayload.extracted,
      official: officialPayload.extracted,
      merged_price_source:
        isPositivePrice(officialPayload.price) &&
        isPositivePrice(zensPayload.price) &&
        officialPayload.price !== zensPayload.price
          ? "lowest_positive"
          : isPositivePrice(officialPayload.price)
            ? "official"
            : "zenscrape",
      merged_old_price_source:
        officialOldPrice > normalizedCommercial.price
          ? "official"
          : zensOldPrice > normalizedCommercial.price &&
              zensOldPrice !== normalizedCommercial.price
            ? "zenscrape"
            : "none",
    },
  };
}

function resolveMercadoLivreLayer(payload: SuccessResponse): DebugLayer {
  if (payload.engine === "ml-merged-v1") return "merged";
  if (payload.engine === "ml-official-v2") return "official";
  if (payload.engine === "ml-brightdata-unlocker") return "brightdata";
  if (payload.engine === "zenscrape-v1") return "zenscrape";
  return "container";
}

function buildFromMercadoLivreZenscrape(input: {
  elapsedMs: number;
  title: string;
  price: number | null;
  oldPrice: number | null;
  imageUrl: string;
  productUrl: string;
  affiliateUrl: string;
  rawData: Record<string, unknown>;
}): SuccessResponse {
  const validation = buildExtractionStatus({
    title: input.title,
    price: input.price,
    imageUrl: input.imageUrl,
  });

  const preview = {
    title: input.title,
    price: input.price ?? 0,
    old_price: input.oldPrice ?? 0,
    original_price: input.oldPrice ?? 0,
    image_url: input.imageUrl,
    product_url: input.productUrl,
    affiliate_url: input.affiliateUrl,
  };

  return {
    success: true,
    status: validation.status,
    missing_fields: validation.missing_fields,
    marketplace: "mercadolivre",
    engine: "zenscrape-v1",
    extraction_layer: "zenscrape_api",
    elapsed_ms: input.elapsedMs,
    title: input.title,
    price: input.price ?? 0,
    old_price: input.oldPrice ?? 0,
    image: input.imageUrl,
    image_url: input.imageUrl,
    product_url: input.productUrl,
    affiliate_url: input.affiliateUrl,
    preview,
    extracted: input.rawData,
  };
}

function extractMercadoLivreSearchTerms(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    const pieces = parsed.pathname
      .split("/")
      .filter(Boolean)
      .map((piece) => piece.replace(/-/g, " ").trim())
      .filter(Boolean);

    const firstSlug = pieces.find((piece) => !/^p$/i.test(piece) && !/^MLB\d+$/i.test(piece));
    return toText(firstSlug).replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function tokenizeMlSearch(value: string): string[] {
  return toText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function scoreApifyMercadoLivreCandidate(input: {
  item: ApifyMlItem;
  wantedItemId: string;
  sourceUrl: string;
  searchTerms: string;
}): number {
  const itemId = toText(input.item.item_id ?? input.item.itemId ?? input.item.id).toUpperCase();
  const url = toText(input.item.url ?? input.item.product_url ?? input.item.permalink);
  const title = toText(input.item.title ?? input.item.product ?? input.item.name).toLowerCase();

  let score = 0;
  if (input.wantedItemId && itemId === input.wantedItemId) score += 100;
  if (input.sourceUrl && url && input.sourceUrl.includes(url)) score += 60;
  if (url && input.sourceUrl && url.includes(input.sourceUrl)) score += 60;

  const tokens = tokenizeMlSearch(input.searchTerms);
  for (const token of tokens) {
    if (title.includes(token)) score += 8;
  }

  score += clamp(toNumber(input.item.reviews_count ?? input.item.reviewsCount) ?? 0, 0, 2000) / 200;
  return score;
}

async function extractMercadoLivreWithApifySearch(input: {
  url: string;
  affiliateUrl: string;
  searchTerms: string;
}): Promise<SuccessResponse | null> {
  const apifyToken = toText(process.env.APIFY_TOKEN);
  const taskId = toText(process.env.APIFY_ML_TASK_ID) || "radarsmart~mercado-livre-hub";
  if (!apifyToken) return null;

  const searchTerms = toText(input.searchTerms) || extractMercadoLivreSearchTerms(input.url);
  if (!searchTerms) return null;

  const wantedItemId = toText(extractMercadoLivreItemId(input.url)).toUpperCase();
  const response = await fetch(
    `https://api.apify.com/v2/actor-tasks/${encodeURIComponent(taskId)}/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(ML_APIFY_FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        searchQuery: searchTerms,
        maxResults: 15,
        includeReviews: true,
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Apify Mercado Livre retornou ${response.status}${body ? `: ${body.slice(0, 180)}` : ""}`,
    );
  }

  const payload = (await response.json()) as ApifyMlItem[];
  const best = payload
    .map((item) => ({
      item,
      score: scoreApifyMercadoLivreCandidate({
        item,
        wantedItemId,
        sourceUrl: input.url,
        searchTerms,
      }),
    }))
    .sort((left, right) => right.score - left.score)[0];

  if (!best || best.score <= 0) return null;

  const item = best.item;
  const title = toText(item.title ?? item.product ?? item.name);
  const price = toNumber(item.price);
  const oldPrice =
    toNumber(item.original_price) ||
    toNumber(item.originalPrice) ||
    toNumber(item.old_price) ||
    toNumber(item.oldPrice);
  const imageUrl = toText(item.thumbnail ?? item.image ?? item.image_url);
  const productUrl = toText(item.url ?? item.product_url ?? item.permalink) || input.url;
  const affiliateUrl = toText(input.affiliateUrl) || normalizeMercadoLivreAffiliateUrl(productUrl);

  return buildFromMercadoLivreOfficial({
    elapsedMs: 0,
    title,
    price,
    oldPrice,
    imageUrl,
    permalink: productUrl,
    productUrl,
    affiliateUrl,
    condition: toText(item.condition) || null,
    status: "active",
    rawData: {
      source_url: input.url,
      apify_search_terms: searchTerms,
      apify_item: item,
    },
  });
}

function buildFromAmazonRainforest(input: {
  elapsedMs: number;
  asin: string | null;
  title: string;
  price: number | null;
  oldPrice: number | null;
  imageUrl: string;
  productUrl: string;
  affiliateUrl: string;
  rawData: Record<string, unknown>;
}): SuccessResponse {
  const validation = buildExtractionStatus({
    title: input.title,
    price: input.price,
    imageUrl: input.imageUrl,
  });

  const preview = {
    asin: input.asin,
    title: input.title,
    price: input.price ?? 0,
    old_price: input.oldPrice ?? 0,
    original_price: input.oldPrice ?? 0,
    image_url: input.imageUrl,
    product_url: input.productUrl,
    affiliate_url: input.affiliateUrl,
  };

  return {
    success: true,
    status: validation.status,
    missing_fields: validation.missing_fields,
    marketplace: "amazon",
    engine: "rainforest-v1",
    extraction_layer: "rainforest_api",
    elapsed_ms: input.elapsedMs,
    title: input.title,
    price: input.price ?? 0,
    old_price: input.oldPrice ?? 0,
    image: input.imageUrl,
    image_url: input.imageUrl,
    product_url: input.productUrl,
    affiliate_url: input.affiliateUrl,
    preview,
    extracted: input.rawData,
  };
}

function mergeMercadoLivrePreviewPayloads(
  primary: SuccessResponse | null,
  fallback: SuccessResponse | null,
): SuccessResponse | null {
  if (!primary && !fallback) return null;
  if (!primary) return fallback;
  if (!fallback) return primary;
  if (primary.marketplace !== "mercadolivre" || fallback.marketplace !== "mercadolivre") {
    return primary;
  }

  const positivePrices = [primary.price, fallback.price].filter(isPositivePrice);
  const price = positivePrices.length > 0 ? Math.min(...positivePrices) : 0;

  const oldPriceCandidates = [primary.old_price, fallback.old_price].filter(
    (candidate): candidate is number =>
      isPositivePrice(candidate) && candidate > price,
  );
  const oldPrice = oldPriceCandidates.length > 0 ? Math.min(...oldPriceCandidates) : 0;
  const normalizedCommercial = normalizeCommercialValues(price, oldPrice);

  const title = toText(primary.title) || toText(fallback.title);
  const imageUrl = toText(primary.image_url) || toText(fallback.image_url);
  const productUrl = toText(primary.product_url) || toText(fallback.product_url);
  const affiliateUrl = toText(primary.affiliate_url) || toText(fallback.affiliate_url);
  const previewPrimary = primary.preview as
    | { permalink?: unknown; condition?: unknown; status?: unknown }
    | undefined;
  const previewFallback = fallback.preview as
    | { permalink?: unknown; condition?: unknown; status?: unknown }
    | undefined;
  const permalink =
    toText(previewPrimary?.permalink) ||
    toText(previewFallback?.permalink) ||
    productUrl;
  const condition =
    toText(previewPrimary?.condition) ||
    toText(previewFallback?.condition) ||
    null;
  const status =
    toText(previewPrimary?.status) ||
    toText(previewFallback?.status) ||
    null;

  const validation = buildExtractionStatus({
    title,
    price: normalizedCommercial.price,
    imageUrl,
  });

  return {
    ...primary,
    engine:
      primary.engine === fallback.engine ? primary.engine : "ml-merged-v1",
    extraction_layer:
      primary.extraction_layer === fallback.extraction_layer
        ? primary.extraction_layer
        : "mixed",
    status: validation.status,
    missing_fields: validation.missing_fields,
    elapsed_ms: Math.max(primary.elapsed_ms, fallback.elapsed_ms),
    title,
    price: normalizedCommercial.price,
    old_price: normalizedCommercial.oldPrice,
    image: imageUrl,
    image_url: imageUrl,
    product_url: productUrl,
    affiliate_url: affiliateUrl,
    preview: {
      ...primary.preview,
      title,
      price: normalizedCommercial.price,
      old_price: normalizedCommercial.oldPrice,
      original_price: normalizedCommercial.oldPrice,
      image_url: imageUrl,
      permalink,
      product_url: productUrl,
      affiliate_url: affiliateUrl,
      condition,
      status,
    },
    extracted: {
      primary: primary.extracted,
      fallback: fallback.extracted,
      merged_price_source:
        isPositivePrice(primary.price) &&
        isPositivePrice(fallback.price) &&
        primary.price !== fallback.price
          ? "lowest_positive"
          : isPositivePrice(primary.price)
            ? "primary"
            : isPositivePrice(fallback.price)
              ? "fallback"
              : "none",
      merged_old_price_source:
        oldPriceCandidates.length > 0
          ? oldPriceCandidates[0] === primary.old_price
            ? "primary"
            : "fallback"
          : "none",
    },
  };
}

function mergeAmazonPayloads(
  primary: SuccessResponse | null,
  fallback: SuccessResponse | null,
): SuccessResponse | null {
  if (!primary && !fallback) return null;
  if (!primary) return fallback;
  if (!fallback) return primary;
  if (primary.marketplace !== "amazon" || fallback.marketplace !== "amazon") {
    return primary;
  }

  const price = isPositivePrice(primary.price)
    ? primary.price
    : isPositivePrice(fallback.price)
      ? fallback.price
      : 0;
  const oldPriceCandidate =
    isPositivePrice(primary.old_price) && primary.old_price > price
      ? primary.old_price
      : isPositivePrice(fallback.old_price) && fallback.old_price > price
        ? fallback.old_price
        : 0;
  const imageUrl = toText(primary.image_url) || toText(fallback.image_url);
  const title = toText(primary.title) || toText(fallback.title);
  const productUrl = toText(primary.product_url) || toText(fallback.product_url);
  const affiliateUrl = toText(primary.affiliate_url) || toText(fallback.affiliate_url);
  const validation = buildExtractionStatus({
    title,
    price,
    imageUrl,
  });

  return {
    ...primary,
    engine:
      primary.engine === "rainforest-v1" && fallback.engine !== "rainforest-v1"
        ? "amazon-merged-v1"
        : primary.engine,
    status: validation.status,
    missing_fields: validation.missing_fields,
    elapsed_ms: Math.max(primary.elapsed_ms, fallback.elapsed_ms),
    title,
    price,
    old_price: oldPriceCandidate,
    image: imageUrl,
    image_url: imageUrl,
    product_url: productUrl,
    affiliate_url: affiliateUrl,
    preview: {
      ...primary.preview,
      asin: toText(primary.preview.asin) || toText(fallback.preview.asin) || null,
      title,
      price,
      old_price: oldPriceCandidate,
      original_price: oldPriceCandidate,
      image_url: imageUrl,
      product_url: productUrl,
      affiliate_url: affiliateUrl,
    },
    extracted: {
      primary: primary.extracted,
      fallback: fallback.extracted,
    },
  };
}

async function buildFromContainerFallback(
  extractedEngine: Awaited<ReturnType<typeof extractWithContainerEngine>>,
): Promise<SuccessResponse> {
  if (extractedEngine.marketplace === "mercadolivre") {
    const extracted = extractedEngine.data;
    const preview = mapToAdminProdutoML(extracted);
    const previewPayload: ExtractPreviewPayload = {
      title: preview.title,
      price: preview.price,
      old_price: preview.original_price,
      original_price: preview.original_price,
      image_url: preview.image_url,
      product_url: preview.product_url,
      affiliate_url: preview.affiliate_url,
    };
    const validation = buildExtractionStatus({
      title: preview.title,
      price: preview.price,
      imageUrl: preview.image_url,
    });
    const brandModel = await extractBrandModel({
      title: preview.title,
      marketplace: "mercadolivre",
      knownBrand: extracted.brand,
    });

    return {
      success: true,
      status: validation.status,
      missing_fields: validation.missing_fields,
      marketplace: "mercadolivre",
      engine: extractedEngine.engine,
      extraction_layer: extracted.extractionLayer as ExtractionLayer,
      elapsed_ms: extractedEngine.elapsedMs,
      title: preview.title,
      price: preview.price,
      old_price: preview.original_price,
      image: preview.image_url,
      image_url: preview.image_url,
      product_url: preview.product_url,
      affiliate_url: preview.affiliate_url,
      brand: brandModel.brand,
      model: brandModel.model,
      preview: previewPayload,
      extracted: extracted as unknown as Record<string, unknown>,
    };
  }

  const extracted = extractedEngine.data;
  const preview = mapToAdminProdutoAmazon(extracted);
  const previewPayload: ExtractPreviewPayload = {
    asin: extracted.asin,
    title: preview.title,
    price: preview.price,
    old_price: preview.original_price,
    original_price: preview.original_price,
    image_url: preview.image_url,
    product_url: preview.product_url,
    affiliate_url: preview.affiliate_url,
  };
  const validation = buildExtractionStatus({
    title: preview.title,
    price: preview.price,
    imageUrl: preview.image_url,
  });
  const brandModel = await extractBrandModel({
    title: preview.title,
    marketplace: "amazon",
    knownBrand: extracted.brand,
  });

  return {
    success: true,
    status: validation.status,
    missing_fields: validation.missing_fields,
    marketplace: "amazon",
    engine: extractedEngine.engine,
    extraction_layer: extracted.extractionLayer as ExtractionLayer,
    elapsed_ms: extractedEngine.elapsedMs,
    title: preview.title,
    price: preview.price,
    old_price: preview.original_price,
    image: preview.image_url,
    image_url: preview.image_url,
    product_url: preview.product_url,
    affiliate_url: preview.affiliate_url,
    brand: brandModel.brand,
    model: brandModel.model,
    preview: previewPayload,
    extracted: extracted as unknown as Record<string, unknown>,
  };
}

function buildManualFallbackResponse(input: {
  marketplace: Marketplace;
  sourceUrl: string;
  affiliateUrl: string;
  errorMessage: string;
}): SuccessResponse {
  return {
    success: true,
    status: "partial_failure",
    missing_fields: ["title", "price", "image_url"],
    marketplace: input.marketplace,
    engine: "manual-fallback",
    extraction_layer: "none",
    elapsed_ms: 0,
    title: "",
    price: 0,
    old_price: 0,
    image: "",
    image_url: "",
    product_url: input.sourceUrl,
    affiliate_url: input.affiliateUrl,
    preview: {
      title: "",
      price: 0,
      old_price: 0,
      original_price: 0,
      image_url: "",
      product_url: input.sourceUrl,
      affiliate_url: input.affiliateUrl,
    },
    extracted: {},
    error: input.errorMessage,
  };
}

function normalizeOfferStatus(payload: SuccessResponse) {
  const needsReview =
    payload.status !== "ok" ||
    payload.missing_fields.length > 0 ||
    !toText(payload.title) ||
    !toText(payload.image_url) ||
    !Number.isFinite(payload.price) ||
    payload.price <= 0;

  return {
    needsReview,
    offerStatus: needsReview ? "needs_review" : "active",
  };
}

async function maybePersistExtraction(
  payload: SuccessResponse,
  input: {
    persist: boolean;
    marketplace: Marketplace;
    sourceUrl: string;
    affiliateUrl: string;
  },
): Promise<SuccessResponse> {
  if (!input.persist) {
    return payload;
  }

  // Enriquecimento compartilhado: preenche marca/modelo se algum caminho de
  // extracao (official/zenscrape/rainforest/shopee) nao trouxe esses dados
  // nativamente. buildFromContainerFallback ja preenche os dois, entao isso
  // vira um no-op pra esse caminho.
  if (!toText(payload.model) && toText(payload.title)) {
    const brandModel = await extractBrandModel({
      title: payload.title,
      marketplace: input.marketplace,
      knownBrand: payload.brand ?? null,
    });
    payload = {
      ...payload,
      brand: payload.brand ?? brandModel.brand,
      model: brandModel.model,
    };
  }

  const productUrl = payload.product_url || input.sourceUrl;
  const affiliateUrl = payload.affiliate_url || input.affiliateUrl;
  const externalOfferId = `${input.marketplace}:${productUrl}`;
  const existingOffer = await supabaseAdmin
    .from("offers")
    .select("id")
    .eq("external_offer_id", externalOfferId)
    .maybeSingle();

  if (existingOffer.error) {
    throw new Error(`Falha ao localizar oferta existente: ${existingOffer.error.message}`);
  }

  const { needsReview, offerStatus } = normalizeOfferStatus(payload);
  const oldPrice = Number(payload.old_price || 0);
  const currentPrice = Number(payload.price || 0);
  const discountPct =
    oldPrice > currentPrice && currentPrice > 0
      ? Math.round(((oldPrice - currentPrice) / oldPrice) * 100)
      : 0;

  const saveResult = await salvarOferta({
    id: existingOffer.data?.id,
    title: payload.title || "Oferta sem titulo",
    marketplace: input.marketplace,
    platform: input.marketplace,
    product_url: productUrl,
    affiliate_url: affiliateUrl,
    image_url: payload.image_url || null,
    price: currentPrice,
    old_price: oldPrice || null,
    original_price: oldPrice || null,
    discount_pct: discountPct,
    brand: payload.brand ?? null,
    model: payload.model ?? null,
    status: offerStatus,
    curations_status: needsReview ? "needs_review" : "approved",
    source: "central_oferta",
    external_offer_id: externalOfferId,
    raw_data: payload.extracted,
  });

  if (saveResult.error || !saveResult.data) {
    throw new Error(saveResult.error?.message || "Falha ao persistir oferta extraida.");
  }

  return {
    ...payload,
    offer_id: String(saveResult.data.id),
    offer_status: offerStatus,
    needs_review: needsReview,
  };
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json(
      { error: adminGuard.error },
      { status: adminGuard.status },
    );
  }

  try {
    const body = (await req.json()) as {
      url?: string;
      affiliate_url?: string | null;
      marketplace?: string;
      coupon_code?: string | null;
      coupon_discount_pct?: number | string | null;
      persist?: boolean | null;
    };

    const sourceUrl = String(body?.url ?? "").trim();
    if (!sourceUrl) {
      return NextResponse.json({ error: "Campo url obrigatorio." }, { status: 400 });
    }

    const affiliateUrl = String(body?.affiliate_url ?? sourceUrl).trim() || sourceUrl;
    const marketplace = detectMarketplace(sourceUrl, body.marketplace);
    const couponCode = toText(body?.coupon_code).toUpperCase();
    const couponDiscountPct = normalizeCouponDiscountPct(body?.coupon_discount_pct);
    const persist = Boolean(body?.persist);
    const allowPaidFallbacks = paidScraperFallbacksEnabled();
    if (!marketplace) {
      return NextResponse.json(
        { error: "URL invalida. Use link do Mercado Livre, Amazon ou Shopee." },
        { status: 400 },
      );
    }

    if (marketplace === "mercadolivre") {
      const sourceUrlError = getMercadoLivreSourceUrlError(sourceUrl);
      if (sourceUrlError) {
        return NextResponse.json({ error: sourceUrlError }, { status: 400 });
      }
    }

    let zenscrapeError = "";
    let officialError = "";
    let htmlError = "";
    let brightdataError = "";
    let apifyError = "";
    let containerError = "";
    let fallbackError = "";
    let partialFallback: SuccessResponse | null = null;

    try {
      if (marketplace === "mercadolivre") {
        const mercadoLivreExtractionUrl = resolveMercadoLivreExtractionUrl(sourceUrl, affiliateUrl);

        if (!persist) {
          const startedAt = Date.now();
          let accessToken: string | null = null;
          try {
            accessToken = await getValidToken();
          } catch {
            accessToken = null;
          }

          let bestPreviewPayload: SuccessResponse | null = null;
          const absorbPreviewPayload = (payload: SuccessResponse | null) => {
            bestPreviewPayload = mergeMercadoLivrePreviewPayloads(
              bestPreviewPayload,
              payload,
            );
          };
          const shouldKeepTryingPreview = (payload: SuccessResponse | null) =>
            !payload || payload.status !== "ok";
          const getPreviewTitle = (payload: SuccessResponse | null) =>
            toText(payload?.title);

          try {
            console.log("[ML Preview] Tentando HTML Metadata...");
            const mlHtml = await withTimeout(
              extractMercadoLivreHtmlMetadata({
                url: mercadoLivreExtractionUrl,
                affiliateUrl,
              }),
              ML_PREVIEW_HTML_TIMEOUT_MS,
              "HTML do Mercado Livre",
            );
            absorbPreviewPayload({
              ...buildFromMercadoLivreOfficial({
                elapsedMs: Date.now() - startedAt,
                title: mlHtml.title,
                price: mlHtml.price,
                oldPrice: mlHtml.oldPrice,
                imageUrl: mlHtml.imageUrl,
                permalink: mlHtml.permalink,
                productUrl: mlHtml.productUrl,
                affiliateUrl: mlHtml.affiliateUrl,
                condition: mlHtml.condition,
                status: mlHtml.status,
                rawData: mlHtml.rawData,
              }),
              engine: "ml-html-metadata",
              extraction_layer: "open_graph",
            });
            console.log("[ML Preview] Sucesso no HTML Metadata");
          } catch (error) {
            htmlError = extractErrorMessage(error);
            console.log("[ML Preview] Falha no HTML Metadata:", htmlError);
          }

          if (allowPaidFallbacks && shouldKeepTryingPreview(bestPreviewPayload)) {
            try {
              console.log("[ML Preview] Tentando Bright Data...");
              const mlBrightData = await withTimeout(
                extractMercadoLivreWithBrightData({
                  url: mercadoLivreExtractionUrl,
                  affiliateUrl,
                }),
                ML_PREVIEW_BRIGHTDATA_TIMEOUT_MS,
                "Bright Data Mercado Livre",
              );
              absorbPreviewPayload({
                ...buildFromMercadoLivreOfficial({
                  elapsedMs: Date.now() - startedAt,
                  title: mlBrightData.title,
                  price: mlBrightData.price,
                  oldPrice: mlBrightData.oldPrice,
                  imageUrl: mlBrightData.imageUrl,
                  permalink: mlBrightData.permalink,
                  productUrl: mlBrightData.productUrl,
                  affiliateUrl: mlBrightData.affiliateUrl,
                  condition: mlBrightData.condition,
                  status: mlBrightData.status,
                  rawData: mlBrightData.rawData,
                }),
                engine: "ml-brightdata-unlocker",
                extraction_layer: "open_graph",
              });
              console.log("[ML Preview] Sucesso no Bright Data");
            } catch (error) {
              brightdataError = extractErrorMessage(error);
              console.log("[ML Preview] Falha no Bright Data:", brightdataError);
            }
          }

          if (allowPaidFallbacks && shouldKeepTryingPreview(bestPreviewPayload)) {
            try {
              console.log("[ML Preview] Tentando Container Engine...");
              const extractedEngine = await withTimeout(
                extractWithContainerEngine({
                  url: mercadoLivreExtractionUrl,
                  affiliateUrl,
                }),
                ML_PREVIEW_BRIGHTDATA_TIMEOUT_MS,
                "Container Engine Mercado Livre",
              );
              absorbPreviewPayload(await buildFromContainerFallback(extractedEngine));
              console.log("[ML Preview] Sucesso no Container Engine");
            } catch (error) {
              containerError = extractErrorMessage(error);
              console.log("[ML Preview] Falha no Container Engine:", containerError);
            }
          }

          if (allowPaidFallbacks && shouldKeepTryingPreview(bestPreviewPayload)) {
            try {
              console.log("[ML Preview] Tentando API Oficial...");
              const mlOfficial = await withTimeout(
                extractMercadoLivreOfficial({
                  url: mercadoLivreExtractionUrl,
                  affiliateUrl,
                  accessToken: accessToken ?? undefined,
                }),
                ML_PREVIEW_OFFICIAL_TIMEOUT_MS,
                "API oficial do Mercado Livre",
              );
              absorbPreviewPayload(
                buildFromMercadoLivreOfficial({
                  elapsedMs: Date.now() - startedAt,
                  title: mlOfficial.title,
                  price: mlOfficial.price,
                  oldPrice: mlOfficial.oldPrice,
                  imageUrl: mlOfficial.imageUrl,
                  permalink: mlOfficial.permalink,
                  productUrl: mlOfficial.productUrl,
                  affiliateUrl: mlOfficial.affiliateUrl,
                  condition: mlOfficial.condition,
                  status: mlOfficial.status,
                  rawData: mlOfficial.rawData,
                }),
              );
              console.log("[ML Preview] Sucesso na API Oficial");
            } catch (error) {
              officialError = extractErrorMessage(error);
              console.log("[ML Preview] Falha na API Oficial:", officialError);
            }
          }

          if (shouldKeepTryingPreview(bestPreviewPayload)) {
            try {
              console.log("[ML Preview] Tentando Apify Search...");
              const payload = await withTimeout(
                extractMercadoLivreWithApifySearch({
                  url: sourceUrl,
                  affiliateUrl,
                  searchTerms:
                    getPreviewTitle(bestPreviewPayload) ||
                    extractMercadoLivreSearchTerms(sourceUrl),
                }),
                ML_PREVIEW_APIFY_TIMEOUT_MS,
                "Apify Mercado Livre",
              );
              if (payload) {
                absorbPreviewPayload(payload);
                console.log("[ML Preview] Sucesso no Apify");
              }
            } catch (error) {
              apifyError = extractErrorMessage(error);
              console.log("[ML Preview] Falha no Apify:", apifyError);
            }
          }

          if (bestPreviewPayload) {
            const enrichedPreviewPayload = enrichResponseWithCoupon(
              bestPreviewPayload,
              couponCode,
              couponDiscountPct,
            );
            const layerUsed: DebugLayer =
              enrichedPreviewPayload.engine === "ml-official-v2"
                ? "official"
                : enrichedPreviewPayload.engine === "ml-brightdata-unlocker"
                  ? "brightdata"
                : enrichedPreviewPayload.engine === "ml-html-metadata"
                  ? "html"
                : enrichedPreviewPayload.engine === "container-egg-v1"
                  ? "container"
                : enrichedPreviewPayload.engine === "ml-merged-v1"
                  ? "merged"
                  : "apify";

            return NextResponse.json({
              ...enrichedPreviewPayload,
              status:
                enrichedPreviewPayload.status === "ok" ? "ok" : "partial_failure",
              retries: 0,
              debug_info: {
                layer_used: layerUsed,
                missing_fields: enrichedPreviewPayload.missing_fields,
                latency_ms: Date.now() - startedAt,
              },
              error:
                enrichedPreviewPayload.status === "ok"
                  ? undefined
                  : htmlError ||
                    brightdataError ||
                    containerError ||
                    officialError ||
                    apifyError ||
                    fallbackError ||
                    "Extracao parcial do Mercado Livre. Revise os campos antes de publicar.",
            });
          }

          try {
            const mlOfficial = await withTimeout(
              extractMercadoLivreOfficial({
                url: mercadoLivreExtractionUrl,
                affiliateUrl,
                accessToken: accessToken ?? undefined,
              }),
              ML_OFFICIAL_OPERATION_TIMEOUT_MS,
              "API oficial do Mercado Livre",
            );
            const officialPayload = buildFromMercadoLivreOfficial({
              elapsedMs: Date.now() - startedAt,
              title: mlOfficial.title,
              price: mlOfficial.price,
              oldPrice: mlOfficial.oldPrice,
              imageUrl: mlOfficial.imageUrl,
              permalink: mlOfficial.permalink,
              productUrl: mlOfficial.productUrl,
              affiliateUrl: mlOfficial.affiliateUrl,
              condition: mlOfficial.condition,
              status: mlOfficial.status,
              rawData: mlOfficial.rawData,
            });
            const enrichedOfficial = enrichResponseWithCoupon(
              officialPayload,
              couponCode,
              couponDiscountPct,
            );

            return NextResponse.json({
              ...enrichedOfficial,
              status: enrichedOfficial.status === "ok" ? "ok" : "partial_failure",
              retries: 0,
              debug_info: {
                layer_used: "official",
                missing_fields: enrichedOfficial.missing_fields,
                latency_ms: enrichedOfficial.elapsed_ms,
              },
              error:
                enrichedOfficial.status === "ok"
                  ? undefined
                  : "Extração parcial pela API oficial do Mercado Livre. Revise os campos antes de publicar.",
            });
          } catch (error) {
            officialError = extractErrorMessage(error);

            if (allowPaidFallbacks) try {
              const mlBrightData = await withTimeout(
                extractMercadoLivreWithBrightData({
                  url: mercadoLivreExtractionUrl,
                  affiliateUrl,
                }),
                ML_BRIGHTDATA_OPERATION_TIMEOUT_MS,
                "Bright Data Mercado Livre",
              );
              const brightDataPayload = buildFromMercadoLivreOfficial({
                elapsedMs: Date.now() - startedAt,
                title: mlBrightData.title,
                price: mlBrightData.price,
                oldPrice: mlBrightData.oldPrice,
                imageUrl: mlBrightData.imageUrl,
                permalink: mlBrightData.permalink,
                productUrl: mlBrightData.productUrl,
                affiliateUrl: mlBrightData.affiliateUrl,
                condition: mlBrightData.condition,
                status: mlBrightData.status,
                rawData: mlBrightData.rawData,
              });
              const enrichedBrightData = enrichResponseWithCoupon(
                {
                  ...brightDataPayload,
                  engine: "ml-brightdata-unlocker",
                  extraction_layer: "open_graph",
                },
                couponCode,
                couponDiscountPct,
              );

              return NextResponse.json({
                ...enrichedBrightData,
                status: enrichedBrightData.status === "ok" ? "ok" : "partial_failure",
                retries: 0,
                debug_info: {
                  layer_used: "brightdata",
                  missing_fields: enrichedBrightData.missing_fields,
                  latency_ms: enrichedBrightData.elapsed_ms,
                },
                error:
                  enrichedBrightData.status === "ok"
                    ? undefined
                    : officialError || "ExtraÃ§Ã£o parcial pelo Bright Data.",
              });
            } catch (brightDataFallbackError) {
              brightdataError = extractErrorMessage(brightDataFallbackError);
            }

            try {
              const mlHtml = await withTimeout(
                extractMercadoLivreHtmlMetadata({
                  url: mercadoLivreExtractionUrl,
                  affiliateUrl,
                }),
                ML_HTML_OPERATION_TIMEOUT_MS,
                "HTML do Mercado Livre",
              );
              const htmlPayload = buildFromMercadoLivreOfficial({
                elapsedMs: Date.now() - startedAt,
                title: mlHtml.title,
                price: mlHtml.price,
                oldPrice: mlHtml.oldPrice,
                imageUrl: mlHtml.imageUrl,
                permalink: mlHtml.permalink,
                productUrl: mlHtml.productUrl,
                affiliateUrl: mlHtml.affiliateUrl,
                condition: mlHtml.condition,
                status: mlHtml.status,
                rawData: mlHtml.rawData,
              });
              const enrichedHtml = enrichResponseWithCoupon(
                {
                  ...htmlPayload,
                  engine: "ml-html-metadata",
                  extraction_layer: "open_graph",
                },
                couponCode,
                couponDiscountPct,
              );

              return NextResponse.json({
                ...enrichedHtml,
                status: enrichedHtml.status === "ok" ? "ok" : "partial_failure",
                retries: 0,
                debug_info: {
                  layer_used: "html",
                  missing_fields: enrichedHtml.missing_fields,
                  latency_ms: enrichedHtml.elapsed_ms,
                },
                error:
                  enrichedHtml.status === "ok"
                    ? undefined
                    : officialError || "Extração parcial pelo HTML do Mercado Livre.",
              });
            } catch (htmlError) {
              fallbackError = extractErrorMessage(htmlError);
            }

            if (allowPaidFallbacks) try {
              const apifyPayload = await withTimeout(
                extractMercadoLivreWithApifySearch({
                  url: sourceUrl,
                  affiliateUrl,
                  searchTerms: extractMercadoLivreSearchTerms(sourceUrl),
                }),
                ML_APIFY_OPERATION_TIMEOUT_MS,
                "Apify Mercado Livre",
              );

              if (apifyPayload) {
                const enrichedApify = enrichResponseWithCoupon(
                  apifyPayload,
                  couponCode,
                  couponDiscountPct,
                );

                return NextResponse.json({
                  ...enrichedApify,
                  status: enrichedApify.status === "ok" ? "ok" : "partial_failure",
                  retries: 0,
                  debug_info: {
                    layer_used: "apify",
                    missing_fields: enrichedApify.missing_fields,
                    latency_ms: Date.now() - startedAt,
                  },
                  error:
                    enrichedApify.status === "ok"
                      ? undefined
                      : officialError || fallbackError || "Extração parcial pelo Apify.",
                });
              }
            } catch (apifyFallbackError) {
              apifyError = extractErrorMessage(apifyFallbackError);
            }

            const manualFallback = buildManualFallbackResponse({
              marketplace,
              sourceUrl,
              affiliateUrl,
              errorMessage:
                officialError ||
                fallbackError ||
                apifyError ||
                "Extração do Mercado Livre indisponível no momento.",
            });

            return NextResponse.json({
              ...manualFallback,
              retries: 0,
              debug_info: {
                layer_used: "container",
                missing_fields: manualFallback.missing_fields,
                latency_ms: Date.now() - startedAt,
              },
            });
          }
        }

        let officialPayload: SuccessResponse | null = null;
        let brightDataPayload: SuccessResponse | null = null;
        let zensPayload: SuccessResponse | null = null;
        try {
          console.log("[ML Persist] Tentando API Oficial...");
          const startedAt = Date.now();
          let accessToken: string | null = null;
          try {
            accessToken = await getValidToken();
          } catch {
            accessToken = null;
          }
          const mlOfficial = await withTimeout(
            extractMercadoLivreOfficial({
              url: mercadoLivreExtractionUrl,
              affiliateUrl,
              accessToken: accessToken ?? undefined,
            }),
            ML_OFFICIAL_OPERATION_TIMEOUT_MS,
            "API oficial do Mercado Livre",
          );
          officialPayload = buildFromMercadoLivreOfficial({
            elapsedMs: Date.now() - startedAt,
            title: mlOfficial.title,
            price: mlOfficial.price,
            oldPrice: mlOfficial.oldPrice,
            imageUrl: mlOfficial.imageUrl,
            permalink: mlOfficial.permalink,
            productUrl: mlOfficial.productUrl,
            affiliateUrl: mlOfficial.affiliateUrl,
            condition: mlOfficial.condition,
            status: mlOfficial.status,
            rawData: mlOfficial.rawData,
          });
          console.log("[ML Persist] Sucesso na API Oficial");
        } catch (error) {
          officialError = extractErrorMessage(error);
          console.log("[ML Persist] Falha na API Oficial:", officialError);
        }

        const officialHasCoreFieldsLocally = Boolean(
          officialPayload &&
            toText(officialPayload.title) &&
            isPositivePrice(officialPayload.price) &&
            toText(officialPayload.image_url),
        );

        if (allowPaidFallbacks && (!officialPayload || !officialHasCoreFieldsLocally)) {
          try {
            console.log("[ML Persist] Tentando Zenscrape...");
            const startedAt = Date.now();
            const ml = await withTimeout(
              extractMercadoLivreWithZenscrape({
                url: mercadoLivreExtractionUrl,
                affiliateUrl,
              }),
              ML_ZENSCRAPE_OPERATION_TIMEOUT_MS,
              "Zenscrape Mercado Livre",
            );
            zensPayload = buildFromMercadoLivreZenscrape({
              elapsedMs: Date.now() - startedAt,
              title: ml.title,
              price: ml.price,
              oldPrice: ml.oldPrice,
              imageUrl: ml.imageUrl,
              productUrl: ml.productUrl,
              affiliateUrl: ml.affiliateUrl,
              rawData: ml.rawData,
            });
            console.log("[ML Persist] Sucesso no Zenscrape");
          } catch (error) {
            zenscrapeError = extractErrorMessage(error);
            console.log("[ML Persist] Falha no Zenscrape:", zenscrapeError);
          }

          if (!zensPayload) {
            try {
              console.log("[ML Persist] Tentando Bright Data...");
              const startedAt = Date.now();
              const mlBrightData = await withTimeout(
                extractMercadoLivreWithBrightData({
                  url: mercadoLivreExtractionUrl,
                  affiliateUrl,
                }),
                ML_BRIGHTDATA_OPERATION_TIMEOUT_MS,
                "Bright Data Mercado Livre",
              );
              brightDataPayload = {
                ...buildFromMercadoLivreOfficial({
                  elapsedMs: Date.now() - startedAt,
                  title: mlBrightData.title,
                  price: mlBrightData.price,
                  oldPrice: mlBrightData.oldPrice,
                  imageUrl: mlBrightData.imageUrl,
                  permalink: mlBrightData.permalink,
                  productUrl: mlBrightData.productUrl,
                  affiliateUrl: mlBrightData.affiliateUrl,
                  condition: mlBrightData.condition,
                  status: mlBrightData.status,
                  rawData: mlBrightData.rawData,
                }),
                engine: "ml-brightdata-unlocker",
                extraction_layer: "open_graph" as const,
              };
              console.log("[ML Persist] Sucesso no Bright Data");
            } catch (error) {
              brightdataError = extractErrorMessage(error);
              console.log("[ML Persist] Falha no Bright Data:", brightdataError);
            }
          }
        }

        const enrichedOfficial = officialPayload
          ? enrichResponseWithCoupon(officialPayload, couponCode, couponDiscountPct)
          : null;
        const officialHasCoreFields = Boolean(
          enrichedOfficial &&
            enrichedOfficial.status === "ok" &&
            toText(enrichedOfficial.title) &&
            isPositivePrice(enrichedOfficial.price) &&
            toText(enrichedOfficial.image_url),
        );

        // Only return official result if it has all core fields
        if (enrichedOfficial?.status === "ok" && officialHasCoreFields) {
          const persisted = await maybePersistExtraction(enrichedOfficial, {
            persist,
            marketplace,
            sourceUrl,
            affiliateUrl,
          });
          return NextResponse.json({
            ...persisted,
            retries: 1,
            debug_info: {
              layer_used: "official",
              missing_fields: persisted.missing_fields,
              latency_ms: persisted.elapsed_ms,
            },
          });
        }

        const responsePayload = mergeMercadoLivrePayloads(
          brightDataPayload ?? zensPayload,
          officialPayload,
        );
        let enrichedPayload = responsePayload
          ? enrichResponseWithCoupon(responsePayload, couponCode, couponDiscountPct)
          : enrichedOfficial;

        const legacyHasCoreFields = Boolean(
          enrichedPayload &&
            enrichedPayload.status === "ok" &&
            toText(enrichedPayload.title) &&
            isPositivePrice(enrichedPayload.price) &&
            toText(enrichedPayload.image_url),
        );

        if (allowPaidFallbacks && !legacyHasCoreFields) {
          try {
            const apifyPayload = await withTimeout(
              extractMercadoLivreWithApifySearch({
                url: sourceUrl,
                affiliateUrl,
                searchTerms:
                  toText(officialPayload?.title) ||
                  toText(brightDataPayload?.title) ||
                  toText(zensPayload?.title) ||
                  extractMercadoLivreSearchTerms(sourceUrl),
              }),
              ML_APIFY_OPERATION_TIMEOUT_MS,
              "Apify Mercado Livre",
            );

            if (apifyPayload) {
              enrichedPayload = enrichResponseWithCoupon(
                apifyPayload,
                couponCode,
                couponDiscountPct,
              );
            }
          } catch (error) {
            apifyError = extractErrorMessage(error);
          }
        }

        if (enrichedPayload) {
          const persisted = await maybePersistExtraction(enrichedPayload, {
            persist,
            marketplace,
            sourceUrl,
            affiliateUrl,
          });
          const shouldExposeError = (enrichedPayload.missing_fields?.length ?? 0) > 0;
          return NextResponse.json({
            ...persisted,
            status: persisted.status === "ok" ? "ok" : "partial_failure",
            retries: 1,
            debug_info: {
              layer_used: resolveMercadoLivreLayer(persisted),
              missing_fields: persisted.missing_fields,
              latency_ms: persisted.elapsed_ms,
            },
            error: shouldExposeError
              ? officialError ||
                brightdataError ||
                zenscrapeError ||
                apifyError ||
                "Extracao parcial do Mercado Livre."
              : undefined,
          });
        }

        const manualFallback = buildManualFallbackResponse({
          marketplace,
          sourceUrl,
          affiliateUrl,
          errorMessage:
            officialError ||
            brightdataError ||
            zenscrapeError ||
            apifyError ||
            "Extracao do Mercado Livre indisponivel no momento.",
        });
        const persisted = await maybePersistExtraction(manualFallback, {
          persist,
          marketplace,
          sourceUrl,
          affiliateUrl,
        });
        return NextResponse.json({
          ...persisted,
          status: "partial_failure",
          retries: 1,
          debug_info: {
            layer_used: "official",
            missing_fields: persisted.missing_fields,
            latency_ms: 0,
          },
          error: persisted.error,
        });
      } else if (marketplace === "amazon") {
        const startedAt = Date.now();
        const amazon = await extractAmazonWithRainforest({
          url: sourceUrl,
          affiliateUrl,
        });

        const productData = normalizeAmazonProductData(amazon);
        const responsePayload = buildFromAmazonRainforest({
          elapsedMs: Date.now() - startedAt,
          asin: productData.asin,
          title: productData.title,
          price: productData.price,
          oldPrice: productData.old_price,
          imageUrl: productData.image_url,
          productUrl: productData.product_url,
          affiliateUrl: productData.affiliate_url,
          rawData: productData.raw_data,
        });
        const enrichedPayload = enrichResponseWithCoupon(
          responsePayload,
          couponCode,
          couponDiscountPct,
        );

        // Garantia explícita para o formulário "Nova Oferta":
        // preview.image_url precisa vir de productData.image_url.
        enrichedPayload.preview.image_url = productData.image_url;
        enrichedPayload.image_url = productData.image_url;
        enrichedPayload.image = productData.image_url;

        if (enrichedPayload.status === "ok") {
          const persisted = await maybePersistExtraction(enrichedPayload, {
            persist,
            marketplace,
            sourceUrl,
            affiliateUrl,
          });
          return NextResponse.json({
            ...persisted,
            retries: 1,
            debug_info: {
              layer_used: "rainforest",
              missing_fields: persisted.missing_fields,
              latency_ms: persisted.elapsed_ms,
            },
          });
        }
        partialFallback = enrichedPayload;
      } else {
        const startedAt = Date.now();
        const shopee = await extractShopeeOffer({
          url: sourceUrl,
          affiliateUrl,
        });
        const productData = normalizeShopeeProductData(shopee);
        const responsePayload = buildFromShopeeHtml({
          elapsedMs: Date.now() - startedAt,
          title: productData.title,
          price: productData.price,
          oldPrice: productData.old_price,
          imageUrl: productData.image_url,
          productUrl: productData.product_url,
          affiliateUrl: productData.affiliate_url,
          rawData: productData.raw_data,
          extractionLayer: productData.extraction_layer,
        });
        const enrichedPayload = enrichResponseWithCoupon(
          responsePayload,
          couponCode,
          couponDiscountPct,
        );

        if (enrichedPayload.status === "ok") {
          const persisted = await maybePersistExtraction(enrichedPayload, {
            persist,
            marketplace,
            sourceUrl,
            affiliateUrl,
          });
          return NextResponse.json({
            ...persisted,
            retries: 1,
            debug_info: {
              layer_used: "container",
              missing_fields: persisted.missing_fields,
              latency_ms: persisted.elapsed_ms,
            },
          });
        }
        partialFallback = enrichedPayload;
      }
    } catch (error) {
      officialError = extractErrorMessage(error);
    }

    const containerExtractionUrl =
      marketplace === "mercadolivre"
        ? resolveMercadoLivreExtractionUrl(sourceUrl, affiliateUrl)
        : sourceUrl;

    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const extractedEngine = await extractWithContainerEngine({
          url: containerExtractionUrl,
          affiliateUrl,
        });

        let fallbackPayload = enrichResponseWithCoupon(
          await buildFromContainerFallback(extractedEngine),
          couponCode,
          couponDiscountPct,
        );
        if (
          marketplace === "amazon" &&
          partialFallback?.marketplace === "amazon" &&
          fallbackPayload.marketplace === "amazon"
        ) {
          fallbackPayload = mergeAmazonPayloads(partialFallback, fallbackPayload) ?? fallbackPayload;
        }
        if (fallbackPayload.status === "ok") {
          const persisted = await maybePersistExtraction(fallbackPayload, {
            persist,
            marketplace,
            sourceUrl,
            affiliateUrl,
          });
          return NextResponse.json({
            ...persisted,
            retries: maxRetries,
            error: officialError || undefined,
            debug_info: {
              layer_used: "container",
              missing_fields: persisted.missing_fields,
              latency_ms: persisted.elapsed_ms,
            },
          });
        }

        partialFallback = fallbackPayload;
      } catch (error) {
        fallbackError = extractErrorMessage(error);
      }
    }

    if (partialFallback) {
      const persisted = await maybePersistExtraction(partialFallback, {
        persist,
        marketplace,
        sourceUrl,
        affiliateUrl,
      });
      const layerUsed: DebugLayer =
        persisted.engine === "rainforest-v1"
          ? "rainforest"
          : persisted.engine === "zenscrape-v1"
            ? "zenscrape"
            : persisted.engine === "ml-merged-v1"
              ? "merged"
            : persisted.engine === "ml-official-v2"
              ? "official"
              : "container";
      return NextResponse.json({
        ...persisted,
        status: "partial_failure",
        retries: maxRetries,
        debug_info: {
          layer_used: layerUsed,
          missing_fields: persisted.missing_fields,
          latency_ms: persisted.elapsed_ms,
        },
        error:
          zenscrapeError ||
          officialError ||
          fallbackError ||
          "Extração parcial. Complete manualmente e publique.",
      });
    }

    const manual = enrichResponseWithCoupon(
      buildManualFallbackResponse({
      marketplace,
      sourceUrl,
      affiliateUrl,
      errorMessage:
        zenscrapeError ||
        officialError ||
        fallbackError ||
        "Falha na extração automática. Preencha manualmente.",
      }),
      couponCode,
      couponDiscountPct,
    );
    const persisted = await maybePersistExtraction(manual, {
      persist,
      marketplace,
      sourceUrl,
      affiliateUrl,
    });
    return NextResponse.json({
      ...persisted,
      debug_info: {
        layer_used: "container",
        missing_fields: persisted.missing_fields,
        latency_ms: persisted.elapsed_ms,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: extractErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
