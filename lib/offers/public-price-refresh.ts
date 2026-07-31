import { fetchAwinAdvertiserFeedProducts } from "@/lib/awin/client";
import { isOfferVisibleOnSite, VISIBLE_SITE_SLOTS } from "@/lib/offers/site-visibility";
import { extractAmazonWithRainforest } from "@/lib/scraping/amazon-rainforest";
import {
  extractMercadoLivreHtmlMetadata,
  extractMercadoLivreOfficial,
} from "@/lib/scraping/mercadolivre-official";
import { extractShopeeOffer } from "@/lib/scraping/shopee-extractor";
import { getValidToken, supabaseAdmin } from "@/lib/supabase";

const DEFAULT_REFRESH_LIMIT = 40;
const MAX_REFRESH_LIMIT = 120;
const REFRESH_CONCURRENCY = 4;

type OfferRow = {
  id: string;
  title: string | null;
  marketplace: string | null;
  product_url: string | null;
  affiliate_url: string | null;
  image_url: string | null;
  price: number | string | null;
  old_price: number | string | null;
  original_price: number | string | null;
  price_old: number | string | null;
  slot_type: string | null;
  curations_status: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  published_at: string | null;
  expires_at: string | null;
  price_updated_at: string | null;
  raw_data?: Record<string, unknown> | null;
  manual_copy?: unknown;
};

type MarketplaceSnapshot = {
  price: number;
  oldPrice: number | null;
  imageUrl: string | null;
  available: boolean;
  source: string;
};

export type RefreshOfferResult = {
  offerId: string;
  title: string;
  marketplace: string;
  action: "updated" | "unchanged" | "deactivated" | "error";
  previousPrice: number | null;
  nextPrice: number | null;
  checkedAt: string;
  reason?: string;
};

export type RefreshPublicOffersSummary = {
  processed: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  errors: number;
  results: RefreshOfferResult[];
};

type RefreshPublicOffersOptions = {
  limit?: number;
  offerIds?: string[];
  mode?: "staleFirst" | "all";
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = value
      .replace(/\./g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampLimit(limit?: number) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_REFRESH_LIMIT;
  }

  return Math.min(Math.max(Math.round(parsed), 1), MAX_REFRESH_LIMIT);
}

function computeDiscountPct(price: number, oldPrice: number | null) {
  if (!oldPrice || oldPrice <= price || price <= 0) return 0;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}

function computeTrend(previousPrice: number | null, nextPrice: number) {
  if (!previousPrice || previousPrice <= 0) return "stable";
  if (nextPrice > previousPrice * 1.01) return "up";
  if (nextPrice < previousPrice * 0.99) return "down";
  return "stable";
}

function resolveExistingOldPrice(offer: OfferRow) {
  const currentOld =
    toNumber(offer.old_price) ??
    toNumber(offer.original_price) ??
    toNumber(offer.price_old);

  return currentOld && currentOld > 0 ? currentOld : null;
}

function resolveUpdatedOldPrice(offer: OfferRow, nextPrice: number, nextOldPrice: number | null) {
  const normalizedSnapshotOld = nextOldPrice && nextOldPrice > nextPrice ? nextOldPrice : null;
  if (normalizedSnapshotOld) return roundCurrency(normalizedSnapshotOld);

  const existingOld = resolveExistingOldPrice(offer);
  if (existingOld && existingOld > nextPrice) {
    return roundCurrency(existingOld);
  }

  return null;
}

function resolveOfferSourceUrl(offer: OfferRow) {
  return toText(offer.product_url) || toText(offer.affiliate_url);
}

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function extractAwinAdvertiserId(offer: OfferRow) {
  const affiliateUrl = parseUrl(toText(offer.affiliate_url));
  const fromAffiliate = toText(affiliateUrl?.searchParams.get("awinmid"));
  if (/^\d+$/.test(fromAffiliate)) return fromAffiliate;

  const rawAdvertiserId = toText((offer.raw_data as Record<string, unknown> | null)?.advertiser_id);
  if (/^\d+$/.test(rawAdvertiserId)) return rawAdvertiserId;

  return null;
}

function extractAliExpressItemId(value: string) {
  const raw = toText(value);
  const patterns = [
    /\/item\/(\d+)\.html/i,
    /[?&]productId=(\d+)/i,
    /[?&]itemId=(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

async function fetchAmazonSnapshot(offer: OfferRow): Promise<MarketplaceSnapshot> {
  const sourceUrl = resolveOfferSourceUrl(offer);
  const amazon = await extractAmazonWithRainforest({
    url: sourceUrl,
    affiliateUrl: offer.affiliate_url,
  });

  if (!amazon.price || amazon.price <= 0) {
    throw new Error("Amazon sem preco valido no refresh.");
  }

  return {
    price: roundCurrency(amazon.price),
    oldPrice: amazon.oldPrice && amazon.oldPrice > 0 ? roundCurrency(amazon.oldPrice) : null,
    imageUrl: toText(amazon.image_url) || null,
    available: true,
    source: "rainforest",
  };
}

async function fetchMercadoLivreSnapshot(offer: OfferRow): Promise<MarketplaceSnapshot> {
  const sourceUrl = resolveOfferSourceUrl(offer);
  let accessToken: string | null = null;
  try {
    accessToken = await getValidToken();
  } catch {
    accessToken = null;
  }

  try {
    const official = await extractMercadoLivreOfficial({
      url: sourceUrl,
      affiliateUrl: offer.affiliate_url,
      accessToken,
    });

    if (toText(official.status).toLowerCase() && toText(official.status).toLowerCase() !== "active") {
      return {
        price: 0,
        oldPrice: null,
        imageUrl: official.imageUrl || null,
        available: false,
        source: "mercadolivre_api",
      };
    }

    if (!official.price || official.price <= 0) {
      throw new Error("Mercado Livre sem preco na API oficial.");
    }

    return {
      price: roundCurrency(official.price),
      oldPrice: official.oldPrice && official.oldPrice > 0 ? roundCurrency(official.oldPrice) : null,
      imageUrl: official.imageUrl || null,
      available: true,
      source: "mercadolivre_api",
    };
  } catch (error) {
    const html = await extractMercadoLivreHtmlMetadata({
      url: sourceUrl,
      affiliateUrl: offer.affiliate_url,
    });

    if (!html.price || html.price <= 0) {
      throw error instanceof Error ? error : new Error("Mercado Livre sem preco no HTML.");
    }

    return {
      price: roundCurrency(html.price),
      oldPrice: html.oldPrice && html.oldPrice > 0 ? roundCurrency(html.oldPrice) : null,
      imageUrl: html.imageUrl || null,
      available: true,
      source: "mercadolivre_html",
    };
  }
}

async function fetchShopeeSnapshot(offer: OfferRow): Promise<MarketplaceSnapshot> {
  const sourceUrl = resolveOfferSourceUrl(offer);
  const shopee = await extractShopeeOffer({
    url: sourceUrl,
    affiliateUrl: offer.affiliate_url,
  });

  if (!shopee.price || shopee.price <= 0) {
    throw new Error("Shopee sem preco valido no refresh.");
  }

  return {
    price: roundCurrency(shopee.price),
    oldPrice: shopee.oldPrice && shopee.oldPrice > 0 ? roundCurrency(shopee.oldPrice) : null,
    imageUrl: shopee.imageUrl || null,
    available: true,
    source: "shopee_html",
  };
}

function findBestAwinMatch(
  offer: OfferRow,
  products: Awaited<ReturnType<typeof fetchAwinAdvertiserFeedProducts>>["products"],
) {
  const itemId = extractAliExpressItemId(resolveOfferSourceUrl(offer));
  if (itemId) {
    const exact = products.find((product) => {
      const haystack = `${product.id} ${product.merchantProductId} ${product.merchantDeepLink} ${product.awDeepLink}`;
      return haystack.includes(itemId);
    });
    if (exact) return exact;
  }

  const title = toText(offer.title).toLowerCase();
  if (title) {
    const byTitle = products.find((product) =>
      product.productName.toLowerCase().includes(title.slice(0, 32)),
    );
    if (byTitle) return byTitle;
  }

  return products[0] ?? null;
}

async function fetchAwinSnapshot(offer: OfferRow): Promise<MarketplaceSnapshot> {
  const advertiserId = extractAwinAdvertiserId(offer);
  if (!advertiserId) {
    throw new Error("AWIN sem advertiserId para refresh.");
  }

  const sourceUrl = resolveOfferSourceUrl(offer);
  const itemId = extractAliExpressItemId(sourceUrl);
  const search = itemId || toText(offer.title);

  const response = await fetchAwinAdvertiserFeedProducts({
    advertiserId,
    search,
    page: 1,
    priceMin: 0,
    priceMax: null,
  });

  const product = findBestAwinMatch(offer, response.products);
  if (!product) {
    throw new Error("Produto AWIN nao encontrado no feed.");
  }

  return {
    price: roundCurrency(product.searchPrice),
    oldPrice: null,
    imageUrl: toText(product.merchantImageUrl) || null,
    available: true,
    source: "awin_feed",
  };
}

async function fetchMarketplaceSnapshot(offer: OfferRow): Promise<MarketplaceSnapshot> {
  const marketplace = toText(offer.marketplace).toLowerCase();

  if (marketplace.includes("amazon")) {
    return fetchAmazonSnapshot(offer);
  }

  if (marketplace.includes("mercado")) {
    return fetchMercadoLivreSnapshot(offer);
  }

  if (marketplace.includes("shopee")) {
    return fetchShopeeSnapshot(offer);
  }

  if (marketplace.includes("awin") || toText(offer.affiliate_url).includes("awin1.com")) {
    return fetchAwinSnapshot(offer);
  }

  throw new Error(`Marketplace sem refresh automatico: ${offer.marketplace ?? "desconhecido"}.`);
}

async function listRefreshableOffers(options: RefreshPublicOffersOptions): Promise<OfferRow[]> {
  const limit = clampLimit(options.limit);
  let query = supabaseAdmin
    .from("offers")
    .select(
      "id,title,marketplace,product_url,affiliate_url,image_url,price,old_price,original_price,price_old,slot_type,curations_status,status,created_at,updated_at,published_at,expires_at,price_updated_at,raw_data,manual_copy",
    )
    .eq("status", "active")
    .not("affiliate_url", "is", null)
    .in("slot_type", [...VISIBLE_SITE_SLOTS]);

  if (options.offerIds && options.offerIds.length > 0) {
    query = query.in("id", options.offerIds);
  } else {
    query = query
      .order("price_updated_at", { ascending: true, nullsFirst: true })
      .order("updated_at", { ascending: true })
      .limit(limit * 2);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao carregar ofertas publicas: ${error.message}`);
  }

  const visibleOffers = ((data ?? []) as OfferRow[]).filter((offer) =>
    isOfferVisibleOnSite(offer),
  );

  if (options.offerIds && options.offerIds.length > 0) {
    return visibleOffers;
  }

  if (options.mode === "all") {
    return visibleOffers.slice(0, limit);
  }

  return visibleOffers.slice(0, limit);
}

async function refreshOffer(offer: OfferRow): Promise<RefreshOfferResult> {
  const checkedAt = new Date().toISOString();
  const currentPrice = toNumber(offer.price);

  try {
    const snapshot = await fetchMarketplaceSnapshot(offer);

    if (!snapshot.available) {
      const { error } = await supabaseAdmin
        .from("offers")
        .update({
          status: "inactive",
          updated_at: checkedAt,
          price_updated_at: checkedAt,
        })
        .eq("id", offer.id);

      if (error) {
        throw new Error(error.message);
      }

      return {
        offerId: offer.id,
        title: toText(offer.title) || "Oferta sem titulo",
        marketplace: toText(offer.marketplace) || "Marketplace",
        action: "deactivated",
        previousPrice: currentPrice,
        nextPrice: null,
        checkedAt,
        reason: `Oferta indisponivel na origem (${snapshot.source}).`,
      };
    }

    const nextPrice = roundCurrency(snapshot.price);
    if (!nextPrice || nextPrice <= 0) {
      throw new Error("Preco atualizado invalido.");
    }

    const nextOldPrice = resolveUpdatedOldPrice(offer, nextPrice, snapshot.oldPrice);
    const discountPct = computeDiscountPct(nextPrice, nextOldPrice);
    const trend = computeTrend(currentPrice, nextPrice);
    const currentOldPrice = resolveExistingOldPrice(offer);
    const unchanged =
      currentPrice !== null &&
      Math.abs(currentPrice - nextPrice) < 0.01 &&
      Math.abs((currentOldPrice ?? 0) - (nextOldPrice ?? 0)) < 0.01;

    const payload = {
      price_previous: currentPrice,
      price: nextPrice,
      old_price: nextOldPrice,
      original_price: nextOldPrice,
      discount_pct: discountPct,
      discount_percent: discountPct,
      price_trend: unchanged ? "stable" : trend,
      price_updated_at: checkedAt,
      updated_at: checkedAt,
      image_url: snapshot.imageUrl || offer.image_url || null,
    };

    const { error } = await supabaseAdmin
      .from("offers")
      .update(payload)
      .eq("id", offer.id);

    if (error) {
      throw new Error(error.message);
    }

    await supabaseAdmin.from("offer_price_history").insert({
      offer_id: offer.id,
      price: nextPrice,
      original_price: nextOldPrice,
      source: "public-price-refresh",
    });

    return {
      offerId: offer.id,
      title: toText(offer.title) || "Oferta sem titulo",
      marketplace: toText(offer.marketplace) || "Marketplace",
      action: unchanged ? "unchanged" : "updated",
      previousPrice: currentPrice,
      nextPrice,
      checkedAt,
      reason: snapshot.source,
    };
  } catch (error) {
    return {
      offerId: offer.id,
      title: toText(offer.title) || "Oferta sem titulo",
      marketplace: toText(offer.marketplace) || "Marketplace",
      action: "error",
      previousPrice: currentPrice,
      nextPrice: null,
      checkedAt,
      reason: error instanceof Error ? error.message : "Falha ao atualizar preco.",
    };
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let currentIndex = 0;

  async function consume() {
    while (currentIndex < items.length) {
      const index = currentIndex;
      currentIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), items.length || 1) },
    () => consume(),
  );

  await Promise.all(workers);
  return results;
}

export async function refreshPublicOffers(
  options: RefreshPublicOffersOptions = {},
): Promise<RefreshPublicOffersSummary> {
  const offers = await listRefreshableOffers(options);
  const results = await mapWithConcurrency(offers, REFRESH_CONCURRENCY, refreshOffer);

  return {
    processed: offers.length,
    updated: results.filter((result) => result.action === "updated").length,
    unchanged: results.filter((result) => result.action === "unchanged").length,
    deactivated: results.filter((result) => result.action === "deactivated").length,
    errors: results.filter((result) => result.action === "error").length,
    results,
  };
}
