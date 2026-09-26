import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deriveLearningSegments,
  normalizeLearningChannel,
  type LearningSegment,
} from "@/lib/opportunity-engine/learning-segments";
import { normalizePaymentTerms } from "@/lib/opportunity-engine/price-normalizer";
import type { NormalizedProduct } from "@/lib/opportunity-engine/product-normalizer";
import { clamp, roundMoney, toNullableNumber } from "@/lib/opportunity-engine/text-utils";

export type PerformanceMetrics = {
  impressions: number | null;
  views: number | null;
  clicks: number | null;
  affiliate_clicks: number | null;
  orders: number | null;
  units_sold: number | null;
  revenue: number | null;
  commission: number | null;
  ctr: number | null;
  conversion_rate: number | null;
  earnings_per_click: number | null;
  revenue_per_click: number | null;
};

export type InternalPerformanceResult = PerformanceMetrics & {
  internal_performance_score: number | null;
  internal_performance_confidence: number;
  historical_segment_score: number | null;
  historical_segment_confidence: number;
  performance_segment_key: string | null;
  performance_status: "available" | "segment_fallback" | "insufficient_data" | "unavailable";
  performance_base: Record<string, unknown>;
  segments: LearningSegment[];
  warnings: string[];
};

type EventRow = {
  event_type?: string | null;
  channel?: string | null;
  source?: string | null;
  quantity?: number | string | null;
  revenue?: number | string | null;
  commission?: number | string | null;
  created_at?: string | null;
};

type ClickRow = {
  source?: string | null;
  created_at?: string | null;
};

type SegmentRow = {
  segment_key: string;
  performance_score: number | string | null;
  confidence: number | string | null;
  sample_impressions: number | string | null;
  sample_clicks: number | string | null;
  sample_orders: number | string | null;
  updated_at: string | null;
};

const LOOKBACK_DAYS = 90;
const MIN_CONFIDENCE_FOR_SCORE = 35;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function countValue(value: unknown): number {
  const parsed = toNullableNumber(value);
  return parsed === null ? 0 : Math.max(0, Math.round(parsed));
}

function moneyValue(value: unknown): number {
  const parsed = toNullableNumber(value);
  return parsed === null ? 0 : Math.max(0, parsed);
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return roundMoney((numerator / denominator) * 100);
}

function scoreFromRate(value: number | null, benchmarks: { weak: number; good: number; excellent: number }): number | null {
  if (value === null) return null;
  if (value >= benchmarks.excellent) return 100;
  if (value >= benchmarks.good) return Math.round(75 + ((value - benchmarks.good) / (benchmarks.excellent - benchmarks.good)) * 25);
  if (value >= benchmarks.weak) return Math.round(45 + ((value - benchmarks.weak) / (benchmarks.good - benchmarks.weak)) * 30);
  return Math.round(clamp((value / benchmarks.weak) * 45, 0, 45));
}

function weightedScore(values: Array<{ score: number | null; weight: number }>): number | null {
  const valid = values.filter((item): item is { score: number; weight: number } => item.score !== null);
  const totalWeight = valid.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return null;
  return Math.round(valid.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight);
}

function sampleConfidence(metrics: PerformanceMetrics, latestEventAt: string | null): number {
  const impressions = metrics.impressions ?? 0;
  const clicks = metrics.affiliate_clicks ?? metrics.clicks ?? 0;
  const orders = metrics.orders ?? 0;
  const sampleScore = Math.min(45, Math.log10(1 + impressions) * 12 + Math.log10(1 + clicks) * 10 + Math.log10(1 + orders) * 16);
  const richnessScore =
    (metrics.ctr !== null ? 15 : 0) +
    (metrics.conversion_rate !== null ? 15 : 0) +
    (metrics.earnings_per_click !== null || metrics.revenue_per_click !== null ? 10 : 0);
  const freshnessScore = (() => {
    if (!latestEventAt) return 0;
    const ageDays = (Date.now() - Date.parse(latestEventAt)) / (24 * 60 * 60 * 1000);
    if (!Number.isFinite(ageDays)) return 0;
    if (ageDays <= 3) return 20;
    if (ageDays <= 14) return 14;
    if (ageDays <= 45) return 8;
    return 3;
  })();

  const raw = Math.round(clamp(sampleScore + richnessScore + freshnessScore, 0, 100));
  if (impressions < 50 && clicks < 5 && orders === 0) return Math.min(raw, 30);
  if (impressions < 200 && clicks < 20 && orders === 0) return Math.min(raw, 45);
  return raw;
}

export function calculateInternalPerformanceScore(
  metrics: PerformanceMetrics,
  latestEventAt: string | null = new Date().toISOString(),
): Pick<
  InternalPerformanceResult,
  "internal_performance_score" | "internal_performance_confidence" | "performance_status" | "performance_base"
> {
  const ctrScore = scoreFromRate(metrics.ctr, { weak: 1, good: 3, excellent: 8 });
  const conversionScore = scoreFromRate(metrics.conversion_rate, { weak: 0.5, good: 2.5, excellent: 7 });
  const epcScore = metrics.earnings_per_click === null
    ? null
    : Math.round(clamp((metrics.earnings_per_click / 2) * 100, 0, 100));
  const clickScore = metrics.affiliate_clicks === null
    ? null
    : Math.round(clamp(Math.log10(1 + metrics.affiliate_clicks) * 35, 0, 100));
  const score = weightedScore([
    { score: ctrScore, weight: 0.25 },
    { score: conversionScore, weight: 0.35 },
    { score: epcScore, weight: 0.25 },
    { score: clickScore, weight: 0.15 },
  ]);
  const confidence = sampleConfidence(metrics, latestEventAt);

  return {
    internal_performance_score: score,
    internal_performance_confidence: confidence,
    performance_status: score !== null && confidence >= MIN_CONFIDENCE_FOR_SCORE
      ? "available"
      : score !== null
        ? "insufficient_data"
        : "unavailable",
    performance_base: {
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      affiliate_clicks: metrics.affiliate_clicks,
      orders: metrics.orders,
      revenue: metrics.revenue,
      commission: metrics.commission,
      ctr: metrics.ctr,
      conversion_rate: metrics.conversion_rate,
      earnings_per_click: metrics.earnings_per_click,
      revenue_per_click: metrics.revenue_per_click,
    },
  };
}

export function aggregatePerformanceMetrics(params: {
  events: EventRow[];
  clicks: ClickRow[];
}): PerformanceMetrics & { latestEventAt: string | null; channels: string[] } {
  let impressions = 0;
  let views = 0;
  let clicks = 0;
  let affiliateClicks = params.clicks.length;
  let orders = 0;
  let unitsSold = 0;
  let revenue = 0;
  let commission = 0;
  let latestEventAt: string | null = null;
  const channels = new Set(params.clicks.map((row) => normalizeLearningChannel(row.source)).filter(Boolean));

  function touchDate(value: string | null | undefined) {
    const date = Date.parse(text(value));
    if (!Number.isFinite(date)) return;
    if (!latestEventAt || date > Date.parse(latestEventAt)) latestEventAt = new Date(date).toISOString();
  }

  for (const click of params.clicks) touchDate(click.created_at);

  for (const event of params.events) {
    const eventType = text(event.event_type).toLowerCase();
    const channel = normalizeLearningChannel(event.channel ?? event.source);
    channels.add(channel);
    touchDate(event.created_at);

    if (eventType === "impression") impressions += 1;
    else if (eventType === "view") views += 1;
    else if (eventType === "click") clicks += 1;
    else if (eventType === "affiliate_click") {
      affiliateClicks += 1;
    } else if (eventType === "order" || eventType === "purchase" || eventType === "conversion") {
      orders += 1;
      unitsSold += Math.max(1, countValue(event.quantity));
      revenue += moneyValue(event.revenue);
      commission += moneyValue(event.commission);
    }
  }

  const totalClicks = clicks + affiliateClicks;
  return {
    impressions: impressions || null,
    views: views || null,
    clicks: totalClicks || null,
    affiliate_clicks: affiliateClicks || null,
    orders: orders || null,
    units_sold: unitsSold || null,
    revenue: revenue ? roundMoney(revenue) : null,
    commission: commission ? roundMoney(commission) : null,
    ctr: rate(totalClicks, impressions),
    conversion_rate: rate(orders, affiliateClicks),
    earnings_per_click: affiliateClicks > 0 && commission > 0 ? roundMoney(commission / affiliateClicks) : null,
    revenue_per_click: affiliateClicks > 0 && revenue > 0 ? roundMoney(revenue / affiliateClicks) : null,
    latestEventAt,
    channels: Array.from(channels),
  };
}

async function queryLearningRows(client: SupabaseClient, offerId: string) {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const [eventsResult, clicksResult] = await Promise.all([
    client
      .from("analytics_events")
      .select("event_type,channel,source,quantity,revenue,commission,created_at")
      .eq("offer_id", offerId)
      .gte("created_at", since)
      .limit(5000),
    client
      .from("clicks")
      .select("source,created_at")
      .eq("offer_id", offerId)
      .gte("created_at", since)
      .limit(5000),
  ]);

  if (eventsResult.error) throw new Error(eventsResult.error.message);
  if (clicksResult.error) throw new Error(clicksResult.error.message);

  return {
    events: (eventsResult.data ?? []) as EventRow[],
    clicks: (clicksResult.data ?? []) as ClickRow[],
  };
}

async function loadHistoricalSegment(client: SupabaseClient, segments: LearningSegment[]): Promise<{
  score: number | null;
  confidence: number;
  segmentKey: string | null;
}> {
  if (!segments.length) return { score: null, confidence: 0, segmentKey: null };
  const { data } = await client
    .from("performance_segments")
    .select("segment_key,performance_score,confidence,sample_impressions,sample_clicks,sample_orders,updated_at")
    .in("segment_key", segments.map((segment) => segment.key))
    .order("confidence", { ascending: false })
    .limit(10);

  const rows = (data ?? []) as SegmentRow[];
  const best = rows
    .map((row) => ({
      key: row.segment_key,
      score: toNullableNumber(row.performance_score),
      confidence: toNullableNumber(row.confidence) ?? 0,
      observations:
        (toNullableNumber(row.sample_impressions) ?? 0) +
        (toNullableNumber(row.sample_clicks) ?? 0) * 10 +
        (toNullableNumber(row.sample_orders) ?? 0) * 50,
    }))
    .filter((row) => row.score !== null)
    .sort((left, right) => right.confidence - left.confidence || right.observations - left.observations)[0];

  return best
    ? { score: Math.round(best.score ?? 0), confidence: Math.round(best.confidence), segmentKey: best.key }
    : { score: null, confidence: 0, segmentKey: null };
}

async function upsertDailyAndSegments(client: SupabaseClient, params: {
  offerId: string;
  canonicalProductId: string;
  offer: Record<string, unknown>;
  metrics: PerformanceMetrics;
  score: number | null;
  confidence: number;
  segments: LearningSegment[];
}) {
  const day = new Date().toISOString().slice(0, 10);
  const channel = params.segments[0]?.channel ?? "all";
  const basePayload = {
    offer_id: params.offerId,
    canonical_product_id: params.canonicalProductId,
    performance_date: day,
    channel,
    marketplace: text(params.offer.marketplace ?? params.offer.platform) || null,
    impressions: params.metrics.impressions,
    views: params.metrics.views,
    clicks: params.metrics.clicks,
    affiliate_clicks: params.metrics.affiliate_clicks,
    orders: params.metrics.orders,
    units_sold: params.metrics.units_sold,
    revenue: params.metrics.revenue,
    commission: params.metrics.commission,
    ctr: params.metrics.ctr,
    conversion_rate: params.metrics.conversion_rate,
    earnings_per_click: params.metrics.earnings_per_click,
    revenue_per_click: params.metrics.revenue_per_click,
    internal_performance_score: params.score,
    internal_performance_confidence: params.confidence,
    updated_at: new Date().toISOString(),
  };

  await client.from("offer_performance_daily").upsert(basePayload, {
    onConflict: "offer_id,performance_date,channel",
  });

  for (const segment of params.segments) {
    await client.from("performance_segments").upsert(
      {
        segment_key: segment.key,
        segment_level: segment.level,
        category: segment.category,
        marketplace: segment.marketplace,
        channel: segment.channel,
        price_range: segment.price_range,
        discount_range: segment.discount_range,
        payment_profile: segment.payment_profile,
        hour_bucket: segment.hour_bucket,
        day_of_week: segment.day_of_week,
        performance_score: params.score,
        confidence: params.confidence,
        sample_impressions: params.metrics.impressions,
        sample_clicks: params.metrics.clicks,
        sample_orders: params.metrics.orders,
        sample_revenue: params.metrics.revenue,
        sample_commission: params.metrics.commission,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "segment_key" },
    );
  }
}

export async function runRadarLearningEngine(client: SupabaseClient, params: {
  offerId: string;
  canonicalProductId: string;
  normalizedProduct: NormalizedProduct;
  offer: Record<string, unknown>;
}): Promise<InternalPerformanceResult> {
  const payment = normalizePaymentTerms(params.offer);
  const offerForSegments = {
    ...params.offer,
    effective_price: payment.effective_price ?? params.offer.effective_price ?? params.offer.price,
    pix_price: payment.pix_price,
    cash_price: payment.cash_price,
    installment_count: payment.installments,
    installment_interest_free: payment.interest_free,
  };

  try {
    const rows = await queryLearningRows(client, params.offerId);
    const aggregate = aggregatePerformanceMetrics(rows);
    const channel = aggregate.channels[0] ?? null;
    const segments = deriveLearningSegments({
      normalizedProduct: params.normalizedProduct,
      offer: offerForSegments,
      channel,
      publishedAt: text(params.offer.published_at ?? params.offer.updated_at) || null,
    });
    const score = calculateInternalPerformanceScore(aggregate, aggregate.latestEventAt);
    const historical = await loadHistoricalSegment(client, segments);

    await upsertDailyAndSegments(client, {
      offerId: params.offerId,
      canonicalProductId: params.canonicalProductId,
      offer: offerForSegments,
      metrics: aggregate,
      score: score.internal_performance_score,
      confidence: score.internal_performance_confidence,
      segments,
    });

    const useSegmentFallback =
      (score.internal_performance_score === null || score.internal_performance_confidence < MIN_CONFIDENCE_FOR_SCORE) &&
      historical.score !== null &&
      historical.confidence >= MIN_CONFIDENCE_FOR_SCORE;

    return {
      ...aggregate,
      internal_performance_score: useSegmentFallback ? historical.score : score.internal_performance_score,
      internal_performance_confidence: useSegmentFallback ? historical.confidence : score.internal_performance_confidence,
      historical_segment_score: historical.score,
      historical_segment_confidence: historical.confidence,
      performance_segment_key: historical.segmentKey ?? segments[0]?.key ?? null,
      performance_status: useSegmentFallback
        ? "segment_fallback"
        : score.performance_status,
      performance_base: {
        ...score.performance_base,
        latest_event_at: aggregate.latestEventAt,
        channels: aggregate.channels,
        direct_score: score.internal_performance_score,
        direct_confidence: score.internal_performance_confidence,
        historical_segment_score: historical.score,
        historical_segment_confidence: historical.confidence,
      },
      segments,
      warnings: score.internal_performance_confidence < MIN_CONFIDENCE_FOR_SCORE
        ? ["Performance interna com amostra pequena; peso reduzido no Opportunity Score."]
        : [],
    };
  } catch (error) {
    return {
      impressions: null,
      views: null,
      clicks: null,
      affiliate_clicks: null,
      orders: null,
      units_sold: null,
      revenue: null,
      commission: null,
      ctr: null,
      conversion_rate: null,
      earnings_per_click: null,
      revenue_per_click: null,
      internal_performance_score: null,
      internal_performance_confidence: 0,
      historical_segment_score: null,
      historical_segment_confidence: 0,
      performance_segment_key: null,
      performance_status: "unavailable",
      performance_base: {},
      segments: [],
      warnings: [error instanceof Error ? error.message : "Learning Engine indisponivel."],
    };
  }
}

export function internalPerformanceScoreForOpportunity(result: InternalPerformanceResult): number | null {
  return result.internal_performance_confidence >= MIN_CONFIDENCE_FOR_SCORE
    ? result.internal_performance_score
    : null;
}
