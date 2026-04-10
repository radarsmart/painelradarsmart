import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { normalizeMercadoLivreAffiliateUrl } from "@/lib/mercadolivre";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ML_CATEGORIES = [
  { id: "MLB1051", label: "Celulares", defaultQuery: "iphone samsung celular" },
  { id: "MLB1648", label: "Computadores", defaultQuery: "notebook samsung lenovo" },
  { id: "MLB1000", label: "Eletronicos", defaultQuery: "fone bluetooth smart tv" },
  { id: "MLB1246", label: "TVs e Video", defaultQuery: "smart tv 4k samsung" },
  { id: "MLB1144", label: "Audio", defaultQuery: "fone bluetooth jbl" },
];

const ML_CLASSIFICATIONS = ["Melhor Desconto", "Mais Vendido", "Destaque"] as const;
type MlClassification = (typeof ML_CLASSIFICATIONS)[number];
type ApifyMlItem = Record<string, unknown>;
type HubOfferRow = Record<string, unknown>;

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function inferDiscount(price: number, oldPrice: number): number {
  if (price <= 0 || oldPrice <= price) return 0;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}

function classifyOffer(discount: number, reviews: number, rating: number): MlClassification {
  if (discount >= 30) return "Melhor Desconto";
  if (reviews >= 100 || rating >= 4.8) return "Mais Vendido";
  return "Destaque";
}

function normalizeClassificationFilter(value: string): MlClassification | null {
  return ML_CLASSIFICATIONS.find((item) => item === value) ?? null;
}

function buildBreakdown(products: Array<{ classification: MlClassification }>) {
  return {
    bestDiscount: products.filter((product) => product.classification === "Melhor Desconto").length,
    bestSeller: products.filter((product) => product.classification === "Mais Vendido").length,
    featured: products.filter((product) => product.classification === "Destaque").length,
  };
}

function getCategory(categoryId: string) {
  return ML_CATEGORIES.find((category) => category.id === categoryId) ?? null;
}

function getCategoryQuery(categoryId: string): string {
  return getCategory(categoryId)?.defaultQuery ?? "ofertas mercado livre";
}

function normalizeApifyItem(item: ApifyMlItem) {
  const title = toText(item.title) || toText(item.product) || toText(item.name);
  const price = toNumber(item.price);
  const oldPrice =
    toNumber(item.original_price) ||
    toNumber(item.originalPrice) ||
    toNumber(item.old_price) ||
    toNumber(item.oldPrice);
  const discount =
    toNumber(item.discount_pct) ||
    toNumber(item.discountPercent) ||
    inferDiscount(price, oldPrice);
  const reviews = toNumber(item.reviews_count) || toNumber(item.reviewsCount);
  const rating = toNumber(item.average_rating) || toNumber(item.rating);
  const url = toText(item.url) || toText(item.product_url) || toText(item.permalink);
  const externalOfferId =
    toText(item.item_id) ||
    toText(item.itemId) ||
    toText(item.id) ||
    toText(url.split("/").pop());

  return {
    external_offer_id: externalOfferId,
    title,
    price,
    old_price: oldPrice > price ? oldPrice : 0,
    discount_pct: discount,
    image_url: toText(item.thumbnail) || toText(item.image) || toText(item.image_url),
    product_url: normalizeMercadoLivreAffiliateUrl(url),
    reviews_count: reviews,
    seller_name: toText(item.seller_name) || toText(item.seller) || "",
    shop_name: toText(item.shop_name) || "",
    classification: classifyOffer(discount, reviews, rating),
    condition: toText(item.condition) || "Novo",
    source_payload: item,
  };
}

function normalizeHubOffer(row: HubOfferRow) {
  const price = toNumber(row.price);
  const oldPrice = toNumber(row.old_price);
  const normalizedClassification =
    normalizeClassificationFilter(toText(row.classification)) ?? "Destaque";

  return {
    id: toText(row.external_offer_id) || toText(row.id),
    title: toText(row.title),
    price,
    original_price: oldPrice > price ? oldPrice : 0,
    discount_pct: toNumber(row.discount_pct) || inferDiscount(price, oldPrice),
    image: toText(row.image_url),
    link: normalizeMercadoLivreAffiliateUrl(toText(row.affiliate_url_manual) || toText(row.product_url)),
    sold_quantity: toNumber(row.reviews_count),
    classification: normalizedClassification,
    condition: toText(row.condition) || "Novo",
    synced_at: toText(row.synced_at),
    hub_offer_id: toText(row.id),
    is_saved: true,
    affiliate_url_manual: toText(row.affiliate_url_manual) || null,
  };
}

async function syncApifyToHubOffers(search: string, categoryId: string, limit: number) {
  const apifyToken = toText(process.env.APIFY_TOKEN);
  const taskId = toText(process.env.APIFY_ML_TASK_ID) || "radarsmart~mercado-livre-hub";

  if (!apifyToken) {
    throw new Error("APIFY_TOKEN nao configurado.");
  }

  const category = getCategory(categoryId);
  const actorQuery =
    search && categoryId
      ? `${search} ${category?.label ?? ""}`.trim()
      : search || getCategoryQuery(categoryId);

  const actorInput = {
    searchQuery: actorQuery,
    maxResults: limit,
    includeReviews: true,
  };

  const response = await fetch(
    `https://api.apify.com/v2/actor-tasks/${encodeURIComponent(taskId)}/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(actorInput),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Apify retornou ${response.status}${body ? `: ${body.slice(0, 180)}` : ""}`);
  }

  const payload = (await response.json()) as ApifyMlItem[];
  const normalized = payload
    .map(normalizeApifyItem)
    .filter((product) => product.external_offer_id && product.title && product.price > 0);

  if (!normalized.length) {
    return { count: 0, syncedAt: new Date().toISOString() };
  }

  const syncedAt = new Date().toISOString();
  const rows = normalized.map((item) => ({
    marketplace: "mercadolivre",
    external_offer_id: item.external_offer_id,
    title: item.title,
    price: item.price,
    old_price: item.old_price || null,
    discount_pct: item.discount_pct || null,
    image_url: item.image_url || null,
    product_url: item.product_url,
    source_payload: item.source_payload,
    synced_at: syncedAt,
    classification: item.classification,
    status: "active",
    selected_for_distribution: false,
    source_engine: "apify_task",
    category_id: categoryId,
    category_label: category?.label ?? null,
    search_query: actorInput.searchQuery,
    condition: item.condition,
    seller_name: item.seller_name || null,
    shop_name: item.shop_name || null,
    reviews_count: item.reviews_count || 0,
  }));

  const { error } = await supabaseAdmin
    .from("hub_offers")
    .upsert(rows, { onConflict: "marketplace,external_offer_id" });

  if (error) {
    throw new Error(error.message);
  }

  return { count: rows.length, syncedAt };
}

async function fetchHubMlOffers(params: {
  search: string;
  categoryId: string;
  discountMin: number;
  classification: MlClassification | null;
  limit: number;
}) {
  const { search, categoryId, discountMin, classification, limit } = params;

  let query = supabaseAdmin
    .from("hub_offers")
    .select("*")
    .eq("marketplace", "mercadolivre")
    .eq("status", "active");

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  if (classification) {
    query = query.eq("classification", classification);
  }

  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  if (discountMin > 0) {
    query = query.gte("discount_pct", discountMin);
  }

  const { data, error } = await query.order("synced_at", { ascending: false }).limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as HubOfferRow[];
  const products = rows.map(normalizeHubOffer);
  const latestSyncedAt = rows.reduce<string | null>((latest, row) => {
    const value = toText(row.synced_at);
    if (!value) return latest;
    if (!latest) return value;
    return Date.parse(value) > Date.parse(latest) ? value : latest;
  }, null);

  return { products, syncedAt: latestSyncedAt };
}

async function fetchPublishedMlFallback(search: string, discountMin: number, limit: number) {
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("*")
    .or("marketplace.ilike.%mercado livre%,marketplace.ilike.%mercadolivre%,marketplace.ilike.%mercado libre%")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(Math.max(limit * 3, 60));

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as HubOfferRow[])
    .map((row) => {
      const title = toText(row.title);
      const price = toNumber(row.price);
      const oldPrice = toNumber(row.old_price) || toNumber(row.original_price) || toNumber(row.price_old);
      const discount = inferDiscount(price, oldPrice);
      const rawLink = toText(row.affiliate_url) || toText(row.product_url);
      return {
        id: toText(row.id),
        title,
        price,
        original_price: oldPrice > price ? oldPrice : 0,
        discount_pct: discount,
        image: toText(row.image_url),
        link: normalizeMercadoLivreAffiliateUrl(rawLink),
        sold_quantity: 0,
        classification:
          (discount >= 30 ? "Melhor Desconto" : discount >= 15 ? "Mais Vendido" : "Destaque") as MlClassification,
        condition: toText(row.condition) || "Novo",
        synced_at: toText(row.updated_at),
        hub_offer_id: "",
        is_saved: false,
        affiliate_url_manual: null,
      };
    })
    .filter((product) => product.title && product.price > 0 && product.discount_pct >= discountMin)
    .filter((product) => (search ? product.title.toLowerCase().includes(search.toLowerCase()) : true))
    .slice(0, limit);
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const search = toText(req.nextUrl.searchParams.get("q"));
  const categoryId = toText(req.nextUrl.searchParams.get("category")) || "MLB1051";
  const discountMin = Number(req.nextUrl.searchParams.get("discount") || "0");
  const classification = normalizeClassificationFilter(
    toText(req.nextUrl.searchParams.get("classification")),
  );
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "100"), 100);
  const shouldSync = req.nextUrl.searchParams.get("sync") === "1";

  try {
    let syncInfo: { count: number; syncedAt: string } | null = null;

    if (shouldSync) {
      syncInfo = await syncApifyToHubOffers(search, categoryId, limit);
    }

    const { products, syncedAt } = await fetchHubMlOffers({
      search,
      categoryId,
      discountMin,
      classification,
      limit,
    });
    const breakdown = buildBreakdown(products);

    return NextResponse.json({
      ok: true,
      source: shouldSync ? "apify_task" : "hub_offers",
      categories: ML_CATEGORIES.map(({ id, label }) => ({ id, label })),
      filters: { classifications: [...ML_CLASSIFICATIONS] },
      products,
      stats: {
        total: products.length,
        averageDiscount: products.length
          ? Math.round(products.reduce((sum, product) => sum + product.discount_pct, 0) / products.length)
          : 0,
        breakdown,
      },
      synced_at: syncInfo?.syncedAt || syncedAt || new Date().toISOString(),
      sync_count: syncInfo?.count ?? 0,
    });
  } catch (error) {
    try {
      const products = (await fetchPublishedMlFallback(search, discountMin, limit)).filter(
        (product) => (classification ? product.classification === classification : true),
      );
      const breakdown = buildBreakdown(products);

      return NextResponse.json({
        ok: true,
        source: "offers_fallback",
        warning: error instanceof Error ? error.message : "Falha ao consultar hub_offers.",
        categories: ML_CATEGORIES.map(({ id, label }) => ({ id, label })),
        filters: { classifications: [...ML_CLASSIFICATIONS] },
        products,
        stats: {
          total: products.length,
          averageDiscount: products.length
            ? Math.round(products.reduce((sum, product) => sum + product.discount_pct, 0) / products.length)
            : 0,
          breakdown,
        },
        synced_at: new Date().toISOString(),
      });
    } catch (fallbackError) {
      return NextResponse.json(
        {
          ok: false,
          error:
            fallbackError instanceof Error
              ? fallbackError.message
              : error instanceof Error
                ? error.message
                : "Falha ao consultar Mercado Livre.",
          products: [],
        },
        { status: 500 },
      );
    }
  }
}
