import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getConfiguredMarketSearchProviders,
  type ExternalMarketResultItem,
  type ExternalMarketProviderSearchResult,
  type ExternalMarketSearchProvider,
} from "@/lib/opportunity-engine/external-providers";
import { matchNormalizedProducts } from "@/lib/opportunity-engine/product-matching-service";
import { normalizePaymentTerms } from "@/lib/opportunity-engine/price-normalizer";
import { normalizeProduct, type NormalizedProduct } from "@/lib/opportunity-engine/product-normalizer";
import {
  buildPrimaryProductSearchQuery,
  type ProductSearchQuery,
} from "@/lib/opportunity-engine/product-search-query-builder";
import { roundMoney, toNullableNumber } from "@/lib/opportunity-engine/text-utils";

export type ExternalMarketEvidence = {
  id: string;
  provider: string;
  source: string;
  marketplace: string | null;
  seller: string | null;
  external_product_id: string | null;
  title: string;
  url: string | null;
  image_url: string | null;
  regular_price: number | null;
  pix_price: number | null;
  card_price: number | null;
  installments: number | null;
  installment_value: number | null;
  interest_free: boolean | null;
  shipping_cost: number | null;
  effective_price: number | null;
  currency: string;
  match_score: number;
  match_status: string;
  match_reasons: string[];
  conflicts: string[];
  included_in_comparison: boolean;
  excluded_reason: string | null;
  is_price_outlier: boolean;
  captured_at: string;
};

export type ExternalMarketSearchSummary = {
  status: "available" | "cached" | "unavailable" | "error";
  query: ProductSearchQuery | null;
  cached: boolean;
  evidence: ExternalMarketEvidence[];
  errors: string[];
};

type SearchCacheRow = {
  id: string;
  provider: string;
  query_hash: string;
  started_at: string | null;
  expires_at: string | null;
};

const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 1;

function toText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function hashSearch(provider: string, query: string, canonicalKey: string): string {
  const input = `${provider}|${canonicalKey}|${query}`.toLowerCase();
  let left = 0x811c9dc5;
  let right = 0x01000193;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    left ^= code;
    left = Math.imul(left, 0x01000193);
    right ^= code + index;
    right = Math.imul(right, 0x85ebca6b);
  }
  return `fnv1a-${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`;
}

function numberOrNull(value: unknown): number | null {
  const number = toNullableNumber(value);
  return number === null ? null : roundMoney(number);
}

function mapEvidenceRow(row: Record<string, unknown>): ExternalMarketEvidence {
  return {
    id: String(row.id),
    provider: String(row.provider ?? ""),
    source: String(row.source ?? row.provider ?? ""),
    marketplace: toText(row.marketplace),
    seller: toText(row.seller),
    external_product_id: toText(row.external_product_id),
    title: String(row.title ?? ""),
    url: toText(row.url),
    image_url: toText(row.image_url),
    regular_price: numberOrNull(row.regular_price),
    pix_price: numberOrNull(row.pix_price),
    card_price: numberOrNull(row.card_price),
    installments: row.installments === null || row.installments === undefined ? null : Math.round(Number(row.installments)),
    installment_value: numberOrNull(row.installment_value),
    interest_free: typeof row.interest_free === "boolean" ? row.interest_free : null,
    shipping_cost: numberOrNull(row.shipping_cost),
    effective_price: numberOrNull(row.effective_price),
    currency: String(row.currency ?? "BRL"),
    match_score: Math.round(Number(row.match_score ?? 0)),
    match_status: String(row.match_status ?? "REVIEW_REQUIRED"),
    match_reasons: Array.isArray(row.match_reasons) ? row.match_reasons.map(String) : [],
    conflicts: Array.isArray(row.conflicts) ? row.conflicts.map(String) : [],
    included_in_comparison: row.included_in_comparison === true,
    excluded_reason: toText(row.excluded_reason),
    is_price_outlier: row.is_price_outlier === true,
    captured_at: String(row.captured_at ?? new Date().toISOString()),
  };
}

async function loadFreshCache(
  client: SupabaseClient,
  provider: string,
  query: ProductSearchQuery,
  canonicalKey: string,
): Promise<SearchCacheRow | null> {
  const queryHash = hashSearch(provider, query.query, canonicalKey);
  const { data } = await client
    .from("external_market_search_cache")
    .select("id,provider,query_hash,started_at,expires_at")
    .eq("query_hash", queryHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  return data ? (data as SearchCacheRow) : null;
}

async function loadCachedEvidence(
  client: SupabaseClient,
  cacheId: string,
  startedAt: string | null,
): Promise<ExternalMarketEvidence[]> {
  let query = client
    .from("external_market_evidence")
    .select("*")
    .eq("search_cache_id", cacheId)
    .order("captured_at", { ascending: false });

  if (startedAt) query = query.gte("captured_at", startedAt);

  const { data } = await query;

  return ((data ?? []) as Array<Record<string, unknown>>).map(mapEvidenceRow);
}

async function upsertSearchCache(client: SupabaseClient, params: {
  canonicalProductId: string;
  canonicalKey: string;
  provider: string;
  query: ProductSearchQuery;
  status: string;
  resultCount: number;
  rawResponse?: unknown;
  error?: string | null;
  ttlMs: number;
}): Promise<string | null> {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + params.ttlMs).toISOString();
  const { data, error } = await client
    .from("external_market_search_cache")
    .upsert(
      {
        canonical_product_id: params.canonicalProductId,
        canonical_key: params.canonicalKey,
        provider: params.provider,
        query: params.query.query,
        query_strategy: params.query.strategy,
        query_hash: hashSearch(params.provider, params.query.query, params.canonicalKey),
        status: params.status,
        started_at: now,
        finished_at: now,
        expires_at: expiresAt,
        result_count: params.resultCount,
        error: params.error ?? null,
        raw_response: params.rawResponse && typeof params.rawResponse === "object" ? params.rawResponse : {},
        updated_at: now,
      },
      { onConflict: "query_hash" },
    )
    .select("id")
    .single();

  if (error || !data) {
    console.warn("[ExternalMarketSearch] cache upsert failed", {
      provider: params.provider,
      error: error?.message ?? "sem retorno",
    });
    return null;
  }

  return String((data as { id: string }).id);
}

function normalizeExternalProduct(result: ExternalMarketResultItem) {
  return normalizeProduct({
    title: result.title,
    brand: result.brand,
    model: result.model,
    category: result.category,
    product_url: result.url,
    image_url: result.image_url,
    external_product_id: result.external_product_id,
    marketplace: result.marketplace,
    raw_data: result.raw_payload,
  });
}

function inclusionReason(matchStatus: string, score: number, conflicts: string[], paymentEffective: number | null): {
  included: boolean;
  reason: string | null;
} {
  if (conflicts.length > 0) return { included: false, reason: `Conflito de SKU: ${conflicts.join("; ")}` };
  if (paymentEffective === null || paymentEffective <= 0) return { included: false, reason: "Preco efetivo indisponivel." };
  if ((matchStatus === "CONFIRMED" || matchStatus === "PROBABLE") && score >= 80) {
    return { included: true, reason: null };
  }
  return { included: false, reason: `Match insuficiente (${score}%).` };
}

async function insertEvidence(client: SupabaseClient, params: {
  canonicalProductId: string;
  offerId: string;
  cacheId: string | null;
  provider: string;
  referenceProduct: NormalizedProduct;
  result: ExternalMarketResultItem;
}): Promise<ExternalMarketEvidence | null> {
  const normalized = normalizeExternalProduct(params.result);
  const match = matchNormalizedProducts(params.referenceProduct, normalized);
  const payment = normalizePaymentTerms(params.result);
  const inclusion = inclusionReason(
    match.match_status,
    match.match_score,
    match.conflicts,
    payment.effective_price,
  );

  const { data, error } = await client
    .from("external_market_evidence")
    .insert({
      canonical_product_id: params.canonicalProductId,
      offer_id: params.offerId,
      search_cache_id: params.cacheId,
      provider: params.provider,
      source: params.result.source,
      marketplace: params.result.marketplace,
      seller: params.result.seller,
      external_product_id: params.result.external_product_id,
      title: params.result.title,
      url: params.result.url,
      image_url: params.result.image_url,
      regular_price: payment.regular_price,
      pix_price: payment.pix_price,
      card_price: payment.card_price,
      installments: payment.installments,
      installment_value: payment.installment_value,
      interest_free: payment.interest_free,
      shipping_cost: payment.shipping_cost,
      effective_price: payment.effective_price,
      currency: payment.currency,
      match_score: match.match_score,
      match_status: match.match_status,
      match_reasons: match.match_reasons,
      conflicts: match.conflicts,
      included_in_comparison: inclusion.included,
      excluded_reason: inclusion.reason,
      captured_at: params.result.captured_at,
      raw_payload: {
        provider_result: params.result.raw_payload,
        normalized_product: normalized,
        payment,
      },
    })
    .select("*")
    .single();

  if (error || !data) {
    console.warn("[ExternalMarketSearch] evidence insert failed", {
      provider: params.provider,
      title: params.result.title,
      error: error?.message ?? "sem retorno",
    });
    return null;
  }

  return mapEvidenceRow(data as Record<string, unknown>);
}

async function searchProviderWithRetry(
  provider: ExternalMarketSearchProvider,
  query: ProductSearchQuery,
  product: NormalizedProduct,
  timeoutMs: number,
  retries: number,
): Promise<ExternalMarketProviderSearchResult> {
  let lastError: string | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = await provider.search({
      query,
      canonical_product: product,
      timeout_ms: timeoutMs,
    });
    if (result.status !== "error") return result;
    lastError = result.error ?? "Provider externo falhou.";
  }
  return {
    provider: provider.name,
    status: "error" as const,
    results: [],
    error: lastError ?? "Provider externo falhou.",
  };
}

export async function runExternalMarketSearch(client: SupabaseClient, params: {
  offerId: string;
  canonicalProductId: string;
  product: NormalizedProduct;
  forceRefresh?: boolean;
  providers?: ExternalMarketSearchProvider[];
  cacheTtlMs?: number;
  timeoutMs?: number;
  retries?: number;
}): Promise<ExternalMarketSearchSummary> {
  const query = buildPrimaryProductSearchQuery(params.product);
  if (!query) {
    return {
      status: "unavailable",
      query: null,
      cached: false,
      evidence: [],
      errors: ["Produto sem identificadores suficientes para busca externa."],
    };
  }

  const providers = params.providers ?? getConfiguredMarketSearchProviders();
  if (!providers.length) {
    return {
      status: "unavailable",
      query,
      cached: false,
      evidence: [],
      errors: ["Nenhum provider externo de mercado configurado."],
    };
  }

  const ttlMs = params.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const configuredTimeout = Number(process.env.EXTERNAL_MARKET_SEARCH_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const timeoutMs = params.timeoutMs ?? (Number.isFinite(configuredTimeout) ? configuredTimeout : DEFAULT_TIMEOUT_MS);
  const retries = params.retries ?? DEFAULT_RETRIES;
  const evidence: ExternalMarketEvidence[] = [];
  const errors: string[] = [];
  let usedCache = false;

  for (const provider of providers) {
    if (!params.forceRefresh) {
      const cache = await loadFreshCache(client, provider.name, query, params.product.canonical_key);
      if (cache) {
        usedCache = true;
        evidence.push(...await loadCachedEvidence(client, cache.id, cache.started_at));
        continue;
      }
    }

    const providerResult = await searchProviderWithRetry(provider, query, params.product, timeoutMs, retries);
    const cacheId = await upsertSearchCache(client, {
      canonicalProductId: params.canonicalProductId,
      canonicalKey: params.product.canonical_key,
      provider: provider.name,
      query,
      status: providerResult.status,
      resultCount: providerResult.results.length,
      rawResponse: providerResult.raw_response,
      error: providerResult.error ?? null,
      ttlMs,
    });

    if (providerResult.status === "error") {
      errors.push(`${provider.name}: ${providerResult.error ?? "erro sem detalhe"}`);
    }

    for (const item of providerResult.results) {
      const row = await insertEvidence(client, {
        canonicalProductId: params.canonicalProductId,
        offerId: params.offerId,
        cacheId,
        provider: provider.name,
        referenceProduct: params.product,
        result: item,
      });
      if (row) evidence.push(row);
    }
  }

  return {
    status: evidence.length ? (usedCache ? "cached" : "available") : errors.length ? "error" : "unavailable",
    query,
    cached: usedCache,
    evidence,
    errors,
  };
}

export async function updateExternalEvidenceOutliers(client: SupabaseClient, outlierIds: string[]) {
  if (!outlierIds.length) return;
  await client
    .from("external_market_evidence")
    .update({
      is_price_outlier: true,
      included_in_comparison: false,
      excluded_reason: "Preco fora do padrao do mercado validado.",
    })
    .in("id", outlierIds);
}
