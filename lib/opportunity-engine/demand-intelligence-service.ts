import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getConfiguredDemandProviders,
  type DemandProvider,
  type DemandProviderMetric,
  type DemandProviderSearchResult,
} from "@/lib/opportunity-engine/demand-providers";
import { buildDemandQueries, type DemandQuery } from "@/lib/opportunity-engine/demand-query-builder";
import type { NormalizedProduct } from "@/lib/opportunity-engine/product-normalizer";
import { clamp, roundMoney, toNullableNumber } from "@/lib/opportunity-engine/text-utils";

export type DemandSnapshot = {
  id: string;
  provider: string;
  provider_type: string;
  query: string;
  query_intent: string;
  interest_score: number | null;
  search_demand_score: number | null;
  marketplace_popularity_score: number | null;
  social_score: number | null;
  trend_score: number | null;
  trend_velocity: number | null;
  purchase_intent_score: number | null;
  confidence: number | null;
  status: string;
  captured_at: string;
};

export type DemandIntelligenceSummary = {
  status: "available" | "cached" | "unavailable" | "error";
  trend_score: number | null;
  trend_velocity: number | null;
  purchase_intent_score: number | null;
  demand_confidence_score: number;
  demand_query: string | null;
  demand_cached: boolean;
  provider_count: number;
  snapshot_count: number;
  snapshots: DemandSnapshot[];
  errors: string[];
};

const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 1;
const COMMERCIAL_INTENTS = new Set(["price", "promotion", "discount", "buy", "coupon"]);

function scoreOrNull(value: unknown): number | null {
  const parsed = toNullableNumber(value);
  return parsed === null ? null : Math.round(clamp(parsed, 0, 100));
}

function velocityOrNull(value: unknown): number | null {
  const parsed = toNullableNumber(value);
  return parsed === null ? null : roundMoney(parsed);
}

function mapSnapshot(row: Record<string, unknown>): DemandSnapshot {
  return {
    id: String(row.id),
    provider: String(row.provider ?? ""),
    provider_type: String(row.provider_type ?? ""),
    query: String(row.query ?? ""),
    query_intent: String(row.query_intent ?? "base"),
    interest_score: scoreOrNull(row.interest_score),
    search_demand_score: scoreOrNull(row.search_demand_score),
    marketplace_popularity_score: scoreOrNull(row.marketplace_popularity_score),
    social_score: scoreOrNull(row.social_score),
    trend_score: scoreOrNull(row.trend_score),
    trend_velocity: velocityOrNull(row.trend_velocity),
    purchase_intent_score: scoreOrNull(row.purchase_intent_score),
    confidence: scoreOrNull(row.confidence),
    status: String(row.status ?? "unavailable"),
    captured_at: String(row.captured_at ?? new Date().toISOString()),
  };
}

function weightedAverage(
  values: Array<{ value: number | null; confidence: number | null }>,
  options: { round?: boolean } = {},
): number | null {
  const valid = values.filter((item): item is { value: number; confidence: number | null } => item.value !== null);
  if (!valid.length) return null;
  const weighted = valid.reduce((acc, item) => {
    const weight = Math.max(1, item.confidence ?? 50);
    return {
      sum: acc.sum + item.value * weight,
      weight: acc.weight + weight,
    };
  }, { sum: 0, weight: 0 });
  if (weighted.weight <= 0) return null;
  const value = weighted.sum / weighted.weight;
  return options.round === false ? roundMoney(value) : Math.round(value);
}

function calculateVelocity(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous <= 0) return null;
  return roundMoney(((current - previous) / previous) * 100);
}

function trendSignal(metric: DemandProviderMetric): number | null {
  return metric.trend_score ?? metric.interest_score;
}

function purchaseIntentSignal(metric: DemandProviderMetric): number | null {
  if (metric.purchase_intent_score !== null) return metric.purchase_intent_score;
  if (!COMMERCIAL_INTENTS.has(metric.query_intent)) return null;
  return metric.search_demand_score ?? metric.marketplace_popularity_score;
}

function aggregateDemandConfidence(snapshots: DemandSnapshot[], providerCount: number): number {
  const available = snapshots.filter((snapshot) => snapshot.status === "available");
  if (!available.length) return 0;
  const confidences = available
    .map((snapshot) => snapshot.confidence)
    .filter((confidence): confidence is number => confidence !== null);
  const averageConfidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : 45;
  const countScore = Math.min(25, available.length * 4);
  const providerScore = Math.min(15, providerCount * 8);
  return Math.round(clamp(averageConfidence * 0.75 + countScore + providerScore, 0, 100));
}

function compactSnapshots(snapshots: DemandSnapshot[]): DemandSnapshot[] {
  return snapshots
    .slice()
    .sort((left, right) => Date.parse(right.captured_at) - Date.parse(left.captured_at))
    .slice(0, 30);
}

async function loadFreshSnapshots(client: SupabaseClient, params: {
  canonicalProductId: string;
  provider: string;
  queries: DemandQuery[];
  ttlMs: number;
}): Promise<DemandSnapshot[]> {
  const since = new Date(Date.now() - params.ttlMs).toISOString();
  const queryTexts = params.queries.map((query) => query.query);
  const { data } = await client
    .from("demand_snapshots")
    .select("*")
    .eq("canonical_product_id", params.canonicalProductId)
    .eq("provider", params.provider)
    .in("query", queryTexts)
    .gte("captured_at", since)
    .order("captured_at", { ascending: false });

  return ((data ?? []) as Array<Record<string, unknown>>).map(mapSnapshot);
}

async function loadPreviousTrendScore(client: SupabaseClient, params: {
  canonicalProductId: string;
  provider: string;
  query: string;
  before: string;
}): Promise<number | null> {
  const { data } = await client
    .from("demand_snapshots")
    .select("trend_score")
    .eq("canonical_product_id", params.canonicalProductId)
    .eq("provider", params.provider)
    .eq("query", params.query)
    .lt("captured_at", params.before)
    .not("trend_score", "is", null)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? scoreOrNull((data as Record<string, unknown>).trend_score) : null;
}

async function insertSnapshot(client: SupabaseClient, params: {
  offerId: string;
  canonicalProductId: string;
  provider: string;
  metric: DemandProviderMetric;
}): Promise<DemandSnapshot | null> {
  const capturedAt = params.metric.captured_at;
  const currentTrend = trendSignal(params.metric);
  const previousTrend = await loadPreviousTrendScore(client, {
    canonicalProductId: params.canonicalProductId,
    provider: params.provider,
    query: params.metric.query,
    before: capturedAt,
  });
  const trendVelocity = params.metric.trend_velocity ?? calculateVelocity(currentTrend, previousTrend);
  const purchaseIntent = purchaseIntentSignal(params.metric);

  const { data, error } = await client
    .from("demand_snapshots")
    .insert({
      canonical_product_id: params.canonicalProductId,
      offer_id: params.offerId,
      provider: params.provider,
      provider_type: params.metric.provider_type,
      query: params.metric.query,
      query_intent: params.metric.query_intent,
      interest_score: params.metric.interest_score,
      search_demand_score: params.metric.search_demand_score,
      marketplace_popularity_score: params.metric.marketplace_popularity_score,
      social_score: params.metric.social_score,
      trend_score: currentTrend,
      trend_velocity: trendVelocity,
      purchase_intent_score: purchaseIntent,
      confidence: params.metric.confidence,
      status: params.metric.status,
      captured_at: capturedAt,
      raw_payload: params.metric.raw_payload && typeof params.metric.raw_payload === "object"
        ? params.metric.raw_payload
        : {},
    })
    .select("*")
    .single();

  if (error || !data) {
    console.warn("[DemandIntelligence] snapshot insert failed", {
      provider: params.provider,
      query: params.metric.query,
      error: error?.message ?? "sem retorno",
    });
    return null;
  }

  return mapSnapshot(data as Record<string, unknown>);
}

async function searchProviderWithRetry(
  provider: DemandProvider,
  queries: DemandQuery[],
  product: NormalizedProduct,
  timeoutMs: number,
  retries: number,
): Promise<DemandProviderSearchResult> {
  let lastError: string | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = await provider.search({
      queries,
      canonical_product: product,
      timeout_ms: timeoutMs,
    });
    if (result.status !== "error") return result;
    lastError = result.error ?? "Provider de demanda falhou.";
  }

  return {
    provider: provider.name,
    status: "error",
    metrics: [],
    error: lastError ?? "Provider de demanda falhou.",
  };
}

function aggregateDemand(snapshots: DemandSnapshot[], providerCount: number): DemandIntelligenceSummary {
  const available = snapshots.filter((snapshot) => snapshot.status === "available");
  const trendScore = weightedAverage(
    available.map((snapshot) => ({
      value: snapshot.trend_score,
      confidence: snapshot.confidence,
    })),
  );
  const purchaseIntent = weightedAverage(
    available.map((snapshot) => ({
      value: snapshot.purchase_intent_score,
      confidence: snapshot.confidence,
    })),
  );
  const velocity = weightedAverage(
    available.map((snapshot) => ({
      value: snapshot.trend_velocity,
      confidence: snapshot.confidence,
    })),
    { round: false },
  );
  const confidence = aggregateDemandConfidence(available, providerCount);

  return {
    status: available.length ? "available" : "unavailable",
    trend_score: trendScore,
    trend_velocity: velocity === null ? null : roundMoney(velocity),
    purchase_intent_score: purchaseIntent,
    demand_confidence_score: confidence,
    demand_query: snapshots[0]?.query ?? null,
    demand_cached: false,
    provider_count: providerCount,
    snapshot_count: snapshots.length,
    snapshots: compactSnapshots(snapshots),
    errors: [],
  };
}

export async function runDemandIntelligence(client: SupabaseClient, params: {
  offerId: string;
  canonicalProductId: string;
  product: NormalizedProduct;
  forceRefresh?: boolean;
  providers?: DemandProvider[];
  cacheTtlMs?: number;
  timeoutMs?: number;
  retries?: number;
}): Promise<DemandIntelligenceSummary> {
  const queries = buildDemandQueries(params.product);
  if (!queries.length) {
    return {
      status: "unavailable",
      trend_score: null,
      trend_velocity: null,
      purchase_intent_score: null,
      demand_confidence_score: 0,
      demand_query: null,
      demand_cached: false,
      provider_count: 0,
      snapshot_count: 0,
      snapshots: [],
      errors: ["Produto sem identificadores suficientes para demanda."],
    };
  }

  const providers = params.providers ?? getConfiguredDemandProviders();
  if (!providers.length) {
    return {
      status: "unavailable",
      trend_score: null,
      trend_velocity: null,
      purchase_intent_score: null,
      demand_confidence_score: 0,
      demand_query: queries[0].query,
      demand_cached: false,
      provider_count: 0,
      snapshot_count: 0,
      snapshots: [],
      errors: ["Nenhum provider de demanda configurado."],
    };
  }

  const configuredTimeout = Number(process.env.DEMAND_INTELLIGENCE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const timeoutMs = params.timeoutMs ?? (Number.isFinite(configuredTimeout) ? configuredTimeout : DEFAULT_TIMEOUT_MS);
  const ttlMs = params.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const retries = params.retries ?? DEFAULT_RETRIES;
  const snapshots: DemandSnapshot[] = [];
  const errors: string[] = [];
  let usedCache = false;
  let providerCalls = 0;

  for (const provider of providers) {
    if (!params.forceRefresh) {
      const cached = await loadFreshSnapshots(client, {
        canonicalProductId: params.canonicalProductId,
        provider: provider.name,
        queries,
        ttlMs,
      });
      if (cached.length > 0) {
        usedCache = true;
        snapshots.push(...cached);
        continue;
      }
    }

    providerCalls += 1;
    const result = await searchProviderWithRetry(provider, queries, params.product, timeoutMs, retries);
    if (result.status === "error") {
      errors.push(`${provider.name}: ${result.error ?? "erro sem detalhe"}`);
      continue;
    }

    for (const metric of result.metrics) {
      const snapshot = await insertSnapshot(client, {
        offerId: params.offerId,
        canonicalProductId: params.canonicalProductId,
        provider: provider.name,
        metric,
      });
      if (snapshot) snapshots.push(snapshot);
    }
  }

  const aggregate = aggregateDemand(snapshots, providers.length);
  return {
    ...aggregate,
    status: aggregate.snapshot_count > 0
      ? usedCache && providerCalls === 0
        ? "cached"
        : "available"
      : errors.length
        ? "error"
        : "unavailable",
    demand_cached: usedCache,
    errors,
  };
}
