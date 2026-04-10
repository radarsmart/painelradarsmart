import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { fetchShopeeTopProducts, type ShopeeProductNode } from "@/lib/shopee/client";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLASSIFICATIONS = ["Melhor Comissão", "Oferta do Dia", "Destaque"] as const;
const DEFAULT_LIMIT_PER_CLASSIFICATION = 100;
const MAX_LIMIT_PER_CLASSIFICATION = 100;
const PAGE_SIZE = 50;
const MAX_PAGES = 12;

type Classification = (typeof CLASSIFICATIONS)[number];
type HubOfferRow = Record<string, unknown>;

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function classifyOffer(commissionRate: number, price: number): Classification {
  if (commissionRate >= 10) return "Melhor Comissão";
  if (price <= 50) return "Oferta do Dia";
  return "Destaque";
}

function normalizeClassificationFilter(value: string): Classification | null {
  return CLASSIFICATIONS.find((item) => item === value) ?? null;
}

function normalizeShopeeProduct(item: ShopeeProductNode) {
  const price = toNumber(item.price) || toNumber(item.priceMax);
  const commissionRate = toNumber(item.commissionRate) * 100;
  const link = toText(item.offerLink) || toText(item.productLink);

  return {
    external_offer_id: toText(item.itemId),
    title: toText(item.productName) || "Produto Shopee",
    price,
    commission_rate: commissionRate,
    image_url: toText(item.imageUrl),
    product_url: link,
    shop_name: toText(item.shopName),
    classification: classifyOffer(commissionRate, price),
    source_payload: {
      commission_rate: commissionRate,
      shop_name: toText(item.shopName),
      offer_link: toText(item.offerLink),
      product_link: toText(item.productLink),
    },
  };
}

function addUniqueProducts(
  source: Array<ReturnType<typeof normalizeShopeeProduct>>,
  buckets: Record<Classification, Array<ReturnType<typeof normalizeShopeeProduct>>>,
  seen: Set<string>,
  limitPerClassification: number,
) {
  for (const product of source) {
    if (!product.title || product.price <= 0) continue;

    const uniqueKey = product.external_offer_id || product.product_url;
    if (!uniqueKey || seen.has(uniqueKey)) continue;

    const bucket = buckets[product.classification];
    if (bucket.length >= limitPerClassification) continue;

    seen.add(uniqueKey);
    bucket.push(product);
  }
}

function flattenBuckets(
  buckets: Record<Classification, Array<ReturnType<typeof normalizeShopeeProduct>>>,
) {
  return [...CLASSIFICATIONS.flatMap((item) => buckets[item])];
}

function hasCapacity(
  buckets: Record<Classification, Array<ReturnType<typeof normalizeShopeeProduct>>>,
  limitPerClassification: number,
) {
  return CLASSIFICATIONS.some((item) => buckets[item].length < limitPerClassification);
}

function buildBreakdown(products: Array<{ classification: Classification }>) {
  return {
    bestCommission: products.filter((item) => item.classification === "Melhor Comissão").length,
    dailyOffer: products.filter((item) => item.classification === "Oferta do Dia").length,
    featured: products.filter((item) => item.classification === "Destaque").length,
  };
}

function normalizeHubOffer(row: HubOfferRow) {
  const payload =
    row.source_payload && typeof row.source_payload === "object" && !Array.isArray(row.source_payload)
      ? (row.source_payload as Record<string, unknown>)
      : {};
  const commissionRate = toNumber(payload.commission_rate);
  const normalizedClassification =
    normalizeClassificationFilter(toText(row.classification)) ?? "Destaque";

  return {
    id: toText(row.external_offer_id) || toText(row.id),
    title: toText(row.title),
    price: toNumber(row.price),
    commission_rate: commissionRate,
    image: toText(row.image_url),
    link: toText(row.affiliate_url_manual) || toText(row.product_url),
    shop_name: toText(row.shop_name) || toText(payload.shop_name) || "Loja Shopee",
    classification: normalizedClassification,
    synced_at: toText(row.synced_at),
    hub_offer_id: toText(row.id),
    is_saved: true,
    affiliate_url_manual: toText(row.affiliate_url_manual) || null,
  };
}

async function syncShopeeToHubOffers(search: string, limitPerClassification: number) {
  const keyword = search || "eletronicos";
  const buckets: Record<Classification, Array<ReturnType<typeof normalizeShopeeProduct>>> = {
    "Melhor Comissão": [],
    "Oferta do Dia": [],
    Destaque: [],
  };
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await fetchShopeeTopProducts(PAGE_SIZE, keyword, page);
    if (result.status !== 200) {
      throw new Error(`Shopee API retornou ${result.status}`);
    }

    const normalized = result.products.map(normalizeShopeeProduct);
    if (!normalized.length) break;

    addUniqueProducts(normalized, buckets, seen, limitPerClassification);

    if (!hasCapacity(buckets, limitPerClassification)) {
      break;
    }
  }

  const products = flattenBuckets(buckets);
  if (!products.length) {
    return { count: 0, syncedAt: new Date().toISOString() };
  }

  const syncedAt = new Date().toISOString();
  const rows = products.map((item) => ({
    marketplace: "shopee",
    external_offer_id: item.external_offer_id,
    title: item.title,
    price: item.price,
    old_price: null,
    discount_pct: null,
    image_url: item.image_url || null,
    product_url: item.product_url,
    source_payload: item.source_payload,
    synced_at: syncedAt,
    classification: item.classification,
    status: "active",
    selected_for_distribution: false,
    source_engine: "shopee_api",
    search_query: keyword,
    shop_name: item.shop_name || null,
  }));

  const { error } = await supabaseAdmin
    .from("hub_offers")
    .upsert(rows, { onConflict: "marketplace,external_offer_id" });

  if (error) {
    throw new Error(error.message);
  }

  return { count: rows.length, syncedAt };
}

async function fetchSavedShopeeOffers(params: {
  search: string;
  commissionMin: number;
  classification: Classification | null;
  limit: number;
}) {
  const { search, commissionMin, classification, limit } = params;

  let query = supabaseAdmin
    .from("hub_offers")
    .select("*")
    .eq("marketplace", "shopee")
    .eq("status", "active");

  if (classification) {
    query = query.eq("classification", classification);
  }

  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  const { data, error } = await query.order("synced_at", { ascending: false }).limit(Math.max(limit * 4, 200));

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as HubOfferRow[];
  const products = rows
    .map(normalizeHubOffer)
    .filter((item) => item.price > 0 && item.commission_rate >= commissionMin)
    .slice(0, limit);

  const latestSyncedAt = rows.reduce<string | null>((latest, row) => {
    const value = toText(row.synced_at);
    if (!value) return latest;
    if (!latest) return value;
    return Date.parse(value) > Date.parse(latest) ? value : latest;
  }, null);

  return { products, syncedAt: latestSyncedAt };
}

async function fetchShopeeFallback(search: string, commissionMin: number, limit: number) {
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("*")
    .or("marketplace.ilike.%shopee%,marketplace.ilike.%shoppe%")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(Math.max(limit * 4, 120));

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as HubOfferRow[])
    .map((row) => {
      const title = toText(row.title);
      const price = toNumber(row.price);
      const raw = row.raw_data && typeof row.raw_data === "object" && !Array.isArray(row.raw_data)
        ? (row.raw_data as Record<string, unknown>)
        : {};
      const commissionRate =
        toNumber(row.commission_rate) ||
        toNumber(raw.commission_rate) ||
        toNumber(raw.commissionRate);

      return {
        id: toText(row.id),
        title,
        price,
        commission_rate: commissionRate,
        image: toText(row.image_url),
        link: toText(row.affiliate_url) || toText(row.product_url),
        shop_name: toText(row.shop_name) || "Loja Shopee",
        classification: classifyOffer(commissionRate, price),
        synced_at: toText(row.updated_at),
        hub_offer_id: "",
        is_saved: false,
        affiliate_url_manual: null,
      };
    })
    .filter((item) => item.title && item.price > 0 && item.commission_rate >= commissionMin)
    .filter((item) => (search ? item.title.toLowerCase().includes(search.toLowerCase()) : true))
    .slice(0, limit);
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const search = toText(req.nextUrl.searchParams.get("q"));
  const commissionMin = Number(req.nextUrl.searchParams.get("commission") || "0");
  const classification = normalizeClassificationFilter(
    toText(req.nextUrl.searchParams.get("classification")),
  );
  const limitPerClassification = Math.min(
    Number(req.nextUrl.searchParams.get("limit") || String(DEFAULT_LIMIT_PER_CLASSIFICATION)),
    MAX_LIMIT_PER_CLASSIFICATION,
  );
  const shouldSync = req.nextUrl.searchParams.get("sync") === "1";

  try {
    let syncInfo: { count: number; syncedAt: string } | null = null;

    if (shouldSync) {
      syncInfo = await syncShopeeToHubOffers(search, limitPerClassification);
    }

    const { products, syncedAt } = await fetchSavedShopeeOffers({
      search,
      commissionMin,
      classification,
      limit: limitPerClassification,
    });

    return NextResponse.json({
      ok: true,
      source: shouldSync ? "shopee_api" : "hub_offers",
      products,
      filters: {
        classifications: [...CLASSIFICATIONS],
      },
      stats: {
        total: products.length,
        averageCommission: products.length
          ? Number(
              (
                products.reduce((sum, product) => sum + product.commission_rate, 0) /
                products.length
              ).toFixed(2),
            )
          : 0,
        breakdown: buildBreakdown(products),
      },
      synced_at: syncInfo?.syncedAt || syncedAt || new Date().toISOString(),
      sync_count: syncInfo?.count ?? 0,
    });
  } catch (error) {
    try {
      const products = (await fetchShopeeFallback(search, commissionMin, limitPerClassification)).filter(
        (product) => (classification ? product.classification === classification : true),
      );

      return NextResponse.json({
        ok: true,
        source: "offers_fallback",
        warning: error instanceof Error ? error.message : "Falha ao consultar hub_offers.",
        products,
        filters: {
          classifications: [...CLASSIFICATIONS],
        },
        stats: {
          total: products.length,
          averageCommission: products.length
            ? Number(
                (
                  products.reduce((sum, product) => sum + product.commission_rate, 0) /
                  products.length
                ).toFixed(2),
              )
            : 0,
          breakdown: buildBreakdown(products),
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
                : "Falha ao consultar Shopee.",
          products: [],
        },
        { status: 500 },
      );
    }
  }
}
