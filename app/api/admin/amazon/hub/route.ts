import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { sanitizeAmazonUrl } from "@/lib/amazon";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OfferRow = Record<string, unknown>;
type HubOfferRow = Record<string, unknown>;
type ApifyAmazonItem = Record<string, unknown>;

const AMAZON_CLASSIFICATIONS = ["Prime em Oferta", "Melhor Desconto", "Destaque"] as const;
type AmazonClassification = (typeof AMAZON_CLASSIFICATIONS)[number];
const AMAZON_HIGH_TICKET_KEYWORDS = [
  "iphone",
  "celular",
  "smartphone",
  "galaxy",
  "motorola",
  "xiaomi",
  "notebook",
  "macbook",
  "laptop",
  "smart tv",
  "televis",
  "monitor",
  "playstation",
  "ps5",
  "xbox",
  "nintendo switch",
  "ipad",
  "tablet",
  "kindle",
] as const;
const AMAZON_ACCESSORY_KEYWORDS = [
  "capa",
  "capinha",
  "case",
  "pelicula",
  "película",
  "cabo",
  "carregador",
  "adapter",
  "adaptador",
  "suporte",
  "tripé",
  "tripe",
  "pelicula protetora",
  "protetor",
  "pelicula de vidro",
  "película de vidro",
  "carregador sem fio",
  "carregador turbo",
  "fonte",
  "conector",
  "dock",
  "bateria externa",
  "power bank",
  "controle remoto",
  "controle para",
  "teclado para",
  "mouse para",
  "pelicula camera",
  "lente protetora",
] as const;

type AmazonIntent =
  | "smartphone"
  | "notebook"
  | "tv"
  | "monitor"
  | "console"
  | "tablet"
  | "ereader"
  | "generic";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractNestedNumber(value: unknown): number {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return (
      toNumber(record.value) ||
      toNumber(record.amount) ||
      toNumber(record.price) ||
      toNumber(record.current) ||
      0
    );
  }

  return toNumber(value);
}

function normalizeAmazonPriceNumber(value: number, title: string): number {
  if (value <= 0) return 0;

  const normalizedTitle = title.toLowerCase();
  const isHighTicket = AMAZON_HIGH_TICKET_KEYWORDS.some((keyword) =>
    normalizedTitle.includes(keyword),
  );
  const decimals = value.toString().split(".")[1]?.length ?? 0;

  if (decimals === 3) {
    return Math.round(value * 1000);
  }

  if (decimals === 2 && value < 100 && isHighTicket) {
    return Math.round(value * 1000);
  }

  return value;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferAmazonIntent(title: string): AmazonIntent {
  const normalized = normalizeText(title);

  if (
    normalized.includes("iphone") ||
    normalized.includes("smartphone") ||
    normalized.includes("celular") ||
    normalized.includes("galaxy") ||
    normalized.includes("motorola") ||
    normalized.includes("xiaomi")
  ) {
    return "smartphone";
  }

  if (
    normalized.includes("notebook") ||
    normalized.includes("macbook") ||
    normalized.includes("laptop")
  ) {
    return "notebook";
  }

  if (
    normalized.includes("smart tv") ||
    normalized.includes("qled") ||
    normalized.includes("oled") ||
    normalized.includes("tv ")
  ) {
    return "tv";
  }

  if (normalized.includes("monitor")) {
    return "monitor";
  }

  if (
    normalized.includes("playstation") ||
    normalized.includes("ps5") ||
    normalized.includes("xbox") ||
    normalized.includes("nintendo switch")
  ) {
    return "console";
  }

  if (normalized.includes("ipad") || normalized.includes("tablet")) {
    return "tablet";
  }

  if (normalized.includes("kindle")) {
    return "ereader";
  }

  return "generic";
}

function isLikelyAmazonAccessory(title: string, intent: AmazonIntent): boolean {
  const normalized = normalizeText(title);
  const hasAccessoryKeyword = AMAZON_ACCESSORY_KEYWORDS.some((keyword) =>
    normalized.includes(normalizeText(keyword)),
  );

  if (!hasAccessoryKeyword) {
    if (intent === "smartphone" || intent === "tablet") {
      return normalized.includes("para iphone") || normalized.includes("para galaxy");
    }
    return false;
  }

  return intent !== "generic";
}

function getAmazonIntentPriceFloor(intent: AmazonIntent): number {
  switch (intent) {
    case "smartphone":
      return 500;
    case "notebook":
      return 1200;
    case "tv":
      return 800;
    case "monitor":
      return 350;
    case "console":
      return 900;
    case "tablet":
      return 250;
    case "ereader":
      return 250;
    default:
      return 0;
  }
}

function isQualifiedAmazonCatalogItem(title: string, price: number): boolean {
  if (!title || price <= 0) return false;

  const intent = inferAmazonIntent(title);
  if (isLikelyAmazonAccessory(title, intent)) {
    return false;
  }

  const priceFloor = getAmazonIntentPriceFloor(intent);
  if (priceFloor > 0 && price < priceFloor) {
    return false;
  }

  return true;
}

function pickFirstText(row: OfferRow, keys: string[]): string {
  for (const key of keys) {
    const value = toText(row[key]);
    if (value) return value;
  }
  return "";
}

function pickFirstNumber(row: OfferRow, keys: string[]): number {
  for (const key of keys) {
    const value = toNumber(row[key]);
    if (value > 0) return value;
  }
  return 0;
}

function inferPrime(row: OfferRow, title: string): boolean {
  const flags = [row.is_prime, row.prime, row.has_prime, row.amazon_prime];
  if (flags.some(Boolean)) return true;

  const raw = row.raw_data;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const rawRecord = raw as Record<string, unknown>;
    if (Boolean(rawRecord.is_prime) || Boolean(rawRecord.prime)) return true;

    const badges = rawRecord.badges;
    if (Array.isArray(badges)) {
      return badges.some((badge) => toText(badge).toLowerCase().includes("prime"));
    }
  }

  return title.toLowerCase().includes("prime");
}

function inferDiscount(price: number, oldPrice: number): number {
  if (price <= 0 || oldPrice <= price) return 0;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}

function classifyAmazonOffer(prime: boolean, discount: number): AmazonClassification {
  if (prime && discount >= 10) return "Prime em Oferta";
  if (discount >= 20) return "Melhor Desconto";
  return "Destaque";
}

function normalizeClassificationFilter(value: string): AmazonClassification | null {
  return AMAZON_CLASSIFICATIONS.find((item) => item === value) ?? null;
}

function buildBreakdown(products: Array<{ classification: AmazonClassification }>) {
  return {
    primeDeals: products.filter((item) => item.classification === "Prime em Oferta").length,
    bestDiscount: products.filter((item) => item.classification === "Melhor Desconto").length,
    featured: products.filter((item) => item.classification === "Destaque").length,
  };
}

function dedupeHubRows<T extends { external_offer_id: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    if (!row.external_offer_id) continue;
    if (!map.has(row.external_offer_id)) {
      map.set(row.external_offer_id, row);
    }
  }
  return [...map.values()];
}

function extractAmazonExternalId(row: OfferRow, rawProductUrl: string): string {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/gp\/aw\/d\/([A-Z0-9]{10})/i,
  ];

  for (const pattern of patterns) {
    const match = rawProductUrl.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }

  return toText(row.id) || rawProductUrl;
}

function normalizeAmazonSnapshot(row: OfferRow, amazonTag: string) {
  const title = pickFirstText(row, ["title", "titulo", "name"]);
  const price = pickFirstNumber(row, ["price", "final_price", "preco", "preco_atual"]);
  const oldPrice = pickFirstNumber(row, [
    "old_price",
    "original_price",
    "price_old",
    "preco_original",
  ]);
  const image = pickFirstText(row, ["image_url", "image", "thumbnail", "cover"]);
  const rawProductUrl = pickFirstText(row, ["affiliate_url", "product_url", "url", "link"]);
  const link = sanitizeAmazonUrl(rawProductUrl, amazonTag);
  const prime = inferPrime(row, title);
  const badges = prime ? ["Prime"] : [];
  const discountPct = inferDiscount(price, oldPrice);
  const qualified = isQualifiedAmazonCatalogItem(title, price);

  return {
    external_offer_id: extractAmazonExternalId(row, rawProductUrl),
    title,
    price,
    old_price: oldPrice > price ? oldPrice : 0,
    image_url: image,
    product_url: link,
    classification: classifyAmazonOffer(prime, discountPct),
    discount_pct: discountPct,
    source_payload: {
      prime,
      badges,
      discount_pct: discountPct,
      qualified,
    },
    qualified,
  };
}

function normalizeAmazonApifyItem(item: ApifyAmazonItem, amazonTag: string) {
  const asin =
    toText(item.asin) ||
    toText(item.ASIN) ||
    toText(item.product_asin) ||
    toText(item.productId);
  const title =
    toText(item.title) ||
    toText(item.product_title) ||
    toText(item.name) ||
    toText(item.productName);
  const price = normalizeAmazonPriceNumber(
    extractNestedNumber(item.price) ||
      extractNestedNumber(item.product_price_value) ||
      extractNestedNumber(item.current_price) ||
      extractNestedNumber(item.sale_price),
    title,
  );
  const oldPrice = normalizeAmazonPriceNumber(
    extractNestedNumber(item.original_price) ||
      extractNestedNumber(item.product_original_price_value) ||
      extractNestedNumber(item.old_price) ||
      extractNestedNumber(item.list_price) ||
      extractNestedNumber(item.listPrice),
    title,
  );
  const imageUrl =
    toText(item.image_url) ||
    toText(item.image) ||
    toText(item.product_photo) ||
    toText(item.thumbnail) ||
    toText(item.thumbnailImage);
  const rawUrl =
    toText(item.product_url) ||
    toText(item.url) ||
    toText(item.link) ||
    (asin ? `https://www.amazon.com.br/dp/${asin}` : "");
  const prime = Boolean(item.is_prime) || toText(item.prime).toLowerCase() === "true";
  const badgesRaw = Array.isArray(item.badges)
    ? item.badges
    : Array.isArray(item.product_badges)
      ? item.product_badges
      : [];
  const badges = badgesRaw.map((badge) => toText(badge)).filter(Boolean);
  const discountPct = inferDiscount(price, oldPrice);
  const qualified = isQualifiedAmazonCatalogItem(title, price);

  return {
    external_offer_id: asin || rawUrl,
    title,
    price,
    old_price: oldPrice > price ? oldPrice : 0,
    image_url: imageUrl,
    product_url: sanitizeAmazonUrl(rawUrl, amazonTag),
    classification: classifyAmazonOffer(prime || badges.some((badge) => badge.toLowerCase().includes("prime")), discountPct),
    discount_pct: discountPct,
    source_payload: {
      prime,
      badges,
      discount_pct: discountPct,
      rating:
        extractNestedNumber(item.rating) ||
        extractNestedNumber(item.stars) ||
        extractNestedNumber(item.product_star_rating),
      reviews_count:
        extractNestedNumber(item.reviews_count) ||
        extractNestedNumber(item.reviewsCount) ||
        extractNestedNumber(item.product_num_ratings),
      qualified,
    },
    qualified,
  };
}

function normalizeHubOffer(row: HubOfferRow, amazonTag: string) {
  const price = toNumber(row.price);
  const oldPrice = toNumber(row.old_price);
  const manualAffiliateUrl = toText(row.affiliate_url_manual);
  const payload =
    row.source_payload && typeof row.source_payload === "object" && !Array.isArray(row.source_payload)
      ? (row.source_payload as Record<string, unknown>)
      : {};
  const prime = Boolean(payload.prime);
  const badges = Array.isArray(payload.badges)
    ? payload.badges.map((badge) => toText(badge)).filter(Boolean)
    : prime
      ? ["Prime"]
      : [];
  const discountPct = toNumber(row.discount_pct) || toNumber(payload.discount_pct) || inferDiscount(price, oldPrice);
  const classification =
    normalizeClassificationFilter(toText(row.classification)) ??
    classifyAmazonOffer(prime, discountPct);
  const qualified =
    typeof payload.qualified === "boolean"
      ? Boolean(payload.qualified)
      : isQualifiedAmazonCatalogItem(toText(row.title), price);

  return {
    id: toText(row.external_offer_id) || toText(row.id),
    title: toText(row.title),
    price,
    original_price: oldPrice > price ? oldPrice : 0,
    image: toText(row.image_url),
    link: manualAffiliateUrl || sanitizeAmazonUrl(toText(row.product_url), amazonTag),
    prime,
    badges,
    discount_pct: discountPct,
    classification,
    synced_at: toText(row.synced_at),
    hub_offer_id: toText(row.id),
    is_saved: true,
    affiliate_url_manual: manualAffiliateUrl || null,
    qualified,
  };
}

async function fetchLocalAmazonOffers(limit: number) {
  const response = await supabaseAdmin
    .from("offers")
    .select("*")
    .ilike("marketplace", "%amazon%")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (response.error) {
    const fallback = await supabaseAdmin
      .from("offers")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit * 3);

    if (fallback.error) {
      throw new Error(fallback.error.message || response.error.message || "Falha ao consultar offers.");
    }

    return ((fallback.data ?? []) as OfferRow[]).filter((row) =>
      pickFirstText(row, ["marketplace", "store", "loja"]).toLowerCase().includes("amazon"),
    );
  }

  return (response.data ?? []) as OfferRow[];
}

async function syncAmazonToHubOffers(amazonTag: string) {
  const apifyToken = toText(process.env.APIFY_TOKEN);
  const apifyTaskId = toText(process.env.APIFY_AMAZON_TASK_ID);

  if (apifyToken && apifyTaskId) {
    return syncAmazonApifyToHubOffers({ amazonTag, apifyToken, apifyTaskId });
  }

  return syncAmazonSnapshotToHubOffers(amazonTag);
}

async function syncAmazonSnapshotToHubOffers(amazonTag: string) {
  const localRows = await fetchLocalAmazonOffers(400);
  const normalized = dedupeHubRows(
    localRows
      .map((row) => normalizeAmazonSnapshot(row, amazonTag))
      .filter((item) => item.external_offer_id && item.title && item.price > 0 && item.qualified),
  );

  if (!normalized.length) {
    return { count: 0, syncedAt: new Date().toISOString(), source: "amazon_snapshot" as const };
  }

  const syncedAt = new Date().toISOString();
  const rows = normalized.map((item) => ({
    marketplace: "amazon",
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
    source_engine: "offers_snapshot",
    search_query: "",
    shop_name: "Amazon",
  }));

  const { error } = await supabaseAdmin
    .from("hub_offers")
    .upsert(rows, { onConflict: "marketplace,external_offer_id" });

  if (error) {
    throw new Error(error.message);
  }

  return { count: rows.length, syncedAt, source: "amazon_snapshot" as const };
}

async function syncAmazonApifyToHubOffers(params: {
  amazonTag: string;
  apifyToken: string;
  apifyTaskId: string;
}) {
  const { amazonTag, apifyToken, apifyTaskId } = params;
  const response = await fetch(
    `https://api.apify.com/v2/actor-tasks/${encodeURIComponent(apifyTaskId)}/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Apify Amazon retornou ${response.status}${body ? `: ${body.slice(0, 180)}` : ""}`);
  }

  const payload = (await response.json()) as ApifyAmazonItem[];
  const normalized = dedupeHubRows(
    payload
      .map((item) => normalizeAmazonApifyItem(item, amazonTag))
      .filter((item) => item.external_offer_id && item.title && item.price > 0 && item.qualified),
  );

  if (!normalized.length) {
    return { count: 0, syncedAt: new Date().toISOString(), source: "apify_task" as const };
  }

  const syncedAt = new Date().toISOString();
  const rows = normalized.map((item) => ({
    marketplace: "amazon",
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
    search_query: "",
    shop_name: "Amazon",
  }));

  const { error } = await supabaseAdmin
    .from("hub_offers")
    .upsert(rows, { onConflict: "marketplace,external_offer_id" });

  if (error) {
    throw new Error(error.message);
  }

  return { count: rows.length, syncedAt, source: "apify_task" as const };
}

async function fetchSavedAmazonOffers(params: {
  search: string;
  primeOnly: boolean;
  discountMin: number;
  classification: AmazonClassification | null;
  limit: number;
  amazonTag: string;
}) {
  const { search, primeOnly, discountMin, classification, limit, amazonTag } = params;

  let query = supabaseAdmin
    .from("hub_offers")
    .select("*")
    .eq("marketplace", "amazon")
    .eq("status", "active");

  if (classification) {
    query = query.eq("classification", classification);
  }

  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  if (discountMin > 0) {
    query = query.gte("discount_pct", discountMin);
  }

  const { data, error } = await query.order("synced_at", { ascending: false }).limit(Math.max(limit * 4, 250));

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as HubOfferRow[];
  const products = rows
    .map((row) => normalizeHubOffer(row, amazonTag))
    .filter((item) => item.title && item.price > 0 && item.qualified)
    .filter((item) => (primeOnly ? item.prime : true))
    .slice(0, limit);

  const latestSyncedAt = rows.reduce<string | null>((latest, row) => {
    const value = toText(row.synced_at);
    if (!value) return latest;
    if (!latest) return value;
    return Date.parse(value) > Date.parse(latest) ? value : latest;
  }, null);

  return { products, syncedAt: latestSyncedAt };
}

async function fetchAmazonFallback(params: {
  search: string;
  primeOnly: boolean;
  discountMin: number;
  classification: AmazonClassification | null;
  limit: number;
  amazonTag: string;
}) {
  const { search, primeOnly, discountMin, classification, limit, amazonTag } = params;
  const localRows = await fetchLocalAmazonOffers(Math.max(limit * 3, 300));
  return localRows
    .map((row) => {
      const title = pickFirstText(row, ["title", "titulo", "name"]);
      const price = pickFirstNumber(row, ["price", "final_price", "preco", "preco_atual"]);
      const oldPrice = pickFirstNumber(row, [
        "old_price",
        "original_price",
        "price_old",
        "preco_original",
      ]);
      const image = pickFirstText(row, ["image_url", "image", "thumbnail", "cover"]);
      const rawProductUrl = pickFirstText(row, ["affiliate_url", "product_url", "url", "link"]);
      const prime = inferPrime(row, title);
      const discountPct = inferDiscount(price, oldPrice);

      return {
        id: toText(row.id),
        title,
        price,
        original_price: oldPrice > price ? oldPrice : 0,
        image,
        link: sanitizeAmazonUrl(rawProductUrl, amazonTag),
        prime,
        badges: prime ? ["Prime"] : [],
        discount_pct: discountPct,
        classification: classifyAmazonOffer(prime, discountPct),
        synced_at: toText(row.updated_at),
        hub_offer_id: "",
        is_saved: false,
        affiliate_url_manual: null,
      };
    })
    .filter((item) => item.title && item.price > 0)
    .filter((item) => isQualifiedAmazonCatalogItem(item.title, item.price))
    .filter((item) => (search ? item.title.toLowerCase().includes(search.toLowerCase()) : true))
    .filter((item) => (primeOnly ? item.prime : true))
    .filter((item) => item.discount_pct >= discountMin)
    .filter((item) => (classification ? item.classification === classification : true))
    .slice(0, limit);
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const search = toText(req.nextUrl.searchParams.get("q")).toLowerCase();
  const primeOnly = req.nextUrl.searchParams.get("prime") !== "0";
  const discountMin = Number(req.nextUrl.searchParams.get("discount") || "0");
  const classification = normalizeClassificationFilter(
    toText(req.nextUrl.searchParams.get("classification")),
  );
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "100"), 100);
  const shouldSync = req.nextUrl.searchParams.get("sync") === "1";
  const amazonTag =
    toText(process.env.AMAZON_TRACKING_ID) ||
    toText(process.env.AMAZON_AFFILIATE_TAG) ||
    "radarsmart202-20";

  try {
    let syncInfo: { count: number; syncedAt: string; source: "amazon_snapshot" | "apify_task" } | null = null;

    if (shouldSync) {
      syncInfo = await syncAmazonToHubOffers(amazonTag);
    }

    const { products, syncedAt } = await fetchSavedAmazonOffers({
      search,
      primeOnly,
      discountMin,
      classification,
      limit,
      amazonTag,
    });
    const breakdown = buildBreakdown(products);

    return NextResponse.json({
      ok: true,
      source: shouldSync ? (syncInfo?.source ?? "amazon_snapshot") : "hub_offers",
      filters: { classifications: [...AMAZON_CLASSIFICATIONS] },
      products,
      stats: {
        total: products.length,
        primeRate: products.length
          ? Math.round((products.filter((item) => item.prime).length / products.length) * 100)
          : 0,
        averageDiscount: products.length
          ? Math.round(
              products.reduce((sum, item) => sum + (item.discount_pct || 0), 0) / products.length,
            )
          : 0,
        breakdown,
        trackingId: amazonTag,
      },
      synced_at: syncInfo?.syncedAt || syncedAt || new Date().toISOString(),
      sync_count: syncInfo?.count ?? 0,
    });
  } catch (error) {
    try {
      const products = await fetchAmazonFallback({
        search,
        primeOnly,
        discountMin,
        classification,
        limit,
        amazonTag,
      });
      const breakdown = buildBreakdown(products);

      return NextResponse.json({
        ok: true,
        source: "offers_fallback",
        warning: error instanceof Error ? error.message : "Falha ao consultar hub_offers.",
        filters: { classifications: [...AMAZON_CLASSIFICATIONS] },
        products,
        stats: {
          total: products.length,
          primeRate: products.length
            ? Math.round((products.filter((item) => item.prime).length / products.length) * 100)
            : 0,
          averageDiscount: products.length
            ? Math.round(
                products.reduce((sum, item) => sum + (item.discount_pct || 0), 0) / products.length,
              )
            : 0,
          breakdown,
          trackingId: amazonTag,
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
                : "Falha ao carregar produtos da Amazon Hub.",
          products: [],
        },
        { status: 500 },
      );
    }
  }
}
