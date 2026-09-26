import type { SupabaseClient } from "@supabase/supabase-js";

import {
  aggregatePerformanceMetrics,
  type PerformanceMetrics,
} from "@/lib/opportunity-engine/learning-engine-service";
import { normalizeLearningChannel } from "@/lib/opportunity-engine/learning-segments";
import { clamp, roundMoney, toNullableNumber } from "@/lib/opportunity-engine/text-utils";

export const DECISION_EVALUATION_WINDOWS = [
  { key: "1h", hours: 1 },
  { key: "6h", hours: 6 },
  { key: "24h", hours: 24 },
  { key: "72h", hours: 72 },
  { key: "7d", hours: 168 },
] as const;

export type DecisionWindow = (typeof DECISION_EVALUATION_WINDOWS)[number]["key"];

export type DecisionSnapshotInput = {
  evaluationId: string;
  offer: Record<string, unknown>;
  payload: Record<string, unknown>;
};

export type DecisionSnapshotRow = {
  id: string;
  evaluation_id: string;
  offer_id: string;
  canonical_product_id: string | null;
  opportunity_score: number;
  opportunity_confidence: number;
  classification: string;
  publishing_gate_status: string | null;
  engine_mode: string;
  recommended_action: string;
  expected_value: number | null;
  score_bucket: string;
  confidence_bucket: string;
  category: string | null;
  marketplace: string | null;
  channel: string | null;
  published_at: string | null;
  evaluated_at: string;
  created_at: string;
};

export type DecisionOutcomeRow = PerformanceMetrics & {
  id?: string;
  decision_snapshot_id: string;
  evaluation_id: string | null;
  offer_id: string;
  canonical_product_id: string | null;
  evaluation_window: DecisionWindow | string;
  window_started_at: string;
  window_ended_at: string;
  channel: string;
  category: string | null;
  marketplace: string | null;
  actual_value_score: number | null;
  expected_value: number | null;
  prediction_score: number | null;
  prediction_confidence: number | null;
  prediction_bucket: string | null;
  confidence_bucket: string | null;
  outcome_status: "pending" | "available" | "insufficient_data";
  prediction_result: string | null;
  hit: boolean | null;
  sample_confidence: number;
  updated_at?: string;
};

export type DecisionGroupSummary = {
  key: string;
  sample_size: number;
  decisive_count: number;
  hit_count: number;
  hit_rate: number | null;
  average_expected_value: number | null;
  average_actual_value: number | null;
  average_confidence: number | null;
};

export type ThresholdRecommendation = {
  threshold: number;
  sample_size: number;
  hit_rate: number | null;
  average_actual_value: number | null;
  recommendation: "candidate" | "hold_shadow" | "insufficient_data";
};

export type DecisionCalibrationSummary = {
  period_start: string;
  period_end: string;
  windows: DecisionGroupSummary[];
  score_bucket_accuracy: DecisionGroupSummary[];
  confidence_bucket_accuracy: DecisionGroupSummary[];
  channel_performance: DecisionGroupSummary[];
  category_performance: DecisionGroupSummary[];
  category_channel_performance: DecisionGroupSummary[];
  threshold_recommendations: ThresholdRecommendation[];
  expected_vs_actual: {
    average_expected_value: number | null;
    average_actual_value: number | null;
    average_delta: number | null;
  };
  sample_size: number;
};

type AnalyticsEventRow = {
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

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function textOrNull(value: unknown): string | null {
  const normalized = text(value);
  return normalized || null;
}

function numberOrZero(value: unknown): number {
  return toNullableNumber(value) ?? 0;
}

function roundedScore(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

function average(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!valid.length) return null;
  return roundMoney(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

export function scoreBucket(score: unknown): string {
  const value = roundedScore(numberOrZero(score));
  if (value < 40) return "0-39";
  if (value < 60) return "40-59";
  if (value < 72) return "60-71";
  if (value < 80) return "72-79";
  if (value < 90) return "80-89";
  return "90-100";
}

export function confidenceBucket(confidence: unknown): string {
  const value = roundedScore(numberOrZero(confidence));
  if (value < 35) return "0-34";
  if (value < 60) return "35-59";
  if (value < 80) return "60-79";
  return "80-100";
}

export function recommendedAction(params: {
  classification?: unknown;
  publishingGateStatus?: unknown;
}): "publish_now" | "publish" | "watch" | "reject" | "review_required" {
  const classification = text(params.classification).toUpperCase();
  const gate = text(params.publishingGateStatus).toUpperCase();
  if (gate === "BLOCKED" || classification === "REJECT") return "reject";
  if (gate === "REVIEW_REQUIRED") return "review_required";
  if (classification === "PUBLISH_NOW") return "publish_now";
  if (classification === "PUBLISH" || classification === "HIGH_PRIORITY") return "publish";
  return "watch";
}

export function calculateInitialExpectedValue(payload: Record<string, unknown>): {
  expected_value: number;
  components: Record<string, number | null>;
} {
  const score = numberOrZero(payload.opportunity_score);
  const confidence = numberOrZero(payload.opportunity_confidence);
  const signals = [
    toNullableNumber(payload.market_price_advantage),
    toNullableNumber(payload.radar_real_discount),
    toNullableNumber(payload.purchase_intent_score),
    toNullableNumber(payload.internal_performance_score ?? payload.internal_performance),
    toNullableNumber(payload.payment_attractiveness_score ?? payload.payment_attractiveness),
  ].filter((value): value is number => value !== null);
  const signalAverage = signals.length ? signals.reduce((sum, value) => sum + value, 0) / signals.length : null;
  const expected = roundedScore(score * 0.55 + confidence * 0.25 + (signalAverage ?? score) * 0.2);
  return {
    expected_value: expected,
    components: {
      opportunity_score: roundedScore(score),
      opportunity_confidence: roundedScore(confidence),
      signal_average: signalAverage === null ? null : roundedScore(signalAverage),
    },
  };
}

export function calculateSampleConfidence(metrics: PerformanceMetrics, latestEventAt?: string | null): number {
  const impressions = numberOrZero(metrics.impressions);
  const clicks = numberOrZero(metrics.clicks);
  const affiliateClicks = numberOrZero(metrics.affiliate_clicks);
  const orders = numberOrZero(metrics.orders);
  const observations = impressions + clicks * 8 + affiliateClicks * 12 + orders * 50;
  let confidence = Math.min(75, Math.log10(observations + 1) * 28);
  if (orders >= 1) confidence += 8;
  if (orders >= 5) confidence += 8;
  if (orders >= 20) confidence += 9;
  if (latestEventAt) {
    const ageDays = Math.max(0, (Date.now() - Date.parse(latestEventAt)) / (24 * 60 * 60 * 1000));
    confidence -= Math.min(20, ageDays * 2);
  }
  if (impressions < 50 && clicks < 5 && orders === 0) confidence = Math.min(confidence, 30);
  if (impressions < 200 && clicks < 20 && orders === 0) confidence = Math.min(confidence, 45);
  return roundedScore(confidence);
}

export function calculateActualValueScore(metrics: PerformanceMetrics): number | null {
  const impressions = numberOrZero(metrics.impressions);
  const clicks = numberOrZero(metrics.clicks);
  const affiliateClicks = numberOrZero(metrics.affiliate_clicks);
  const orders = numberOrZero(metrics.orders);
  const revenue = numberOrZero(metrics.revenue);
  const commission = numberOrZero(metrics.commission);
  if (impressions === 0 && clicks === 0 && affiliateClicks === 0 && orders === 0) return null;

  const ctrScore = metrics.ctr === null ? null : clamp(metrics.ctr * 1200, 0, 100);
  const conversionScore = metrics.conversion_rate === null ? null : clamp(metrics.conversion_rate * 1400, 0, 100);
  const orderScore = orders > 0 ? clamp(45 + orders * 8, 0, 100) : null;
  const revenueScore = revenue > 0 ? clamp(35 + Math.log10(revenue + 1) * 20, 0, 100) : null;
  const commissionScore = commission > 0 ? clamp(45 + Math.log10(commission + 1) * 22, 0, 100) : null;
  const clicksScore = clicks + affiliateClicks > 0 ? clamp(Math.log10(clicks + affiliateClicks + 1) * 35, 0, 80) : null;
  const components = [
    { value: conversionScore, weight: 0.3 },
    { value: orderScore, weight: 0.2 },
    { value: commissionScore, weight: 0.18 },
    { value: revenueScore, weight: 0.12 },
    { value: ctrScore, weight: 0.12 },
    { value: clicksScore, weight: 0.08 },
  ].filter((item): item is { value: number; weight: number } => item.value !== null);
  const totalWeight = components.reduce((sum, item) => sum + item.weight, 0);
  if (!components.length || totalWeight <= 0) return null;
  return roundedScore(components.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight);
}

export function classifyPrediction(params: {
  recommended_action: string;
  prediction_score: number | null;
  prediction_confidence: number | null;
  actual_value_score: number | null;
  sample_confidence: number;
}): { prediction_result: string | null; hit: boolean | null; outcome_status: "available" | "insufficient_data" } {
  if (params.actual_value_score === null || params.sample_confidence < 25) {
    return { prediction_result: "inconclusive", hit: null, outcome_status: "insufficient_data" };
  }
  const predictedPositive =
    (params.prediction_score ?? 0) >= 72 &&
    (params.prediction_confidence ?? 0) >= 60 &&
    ["publish_now", "publish"].includes(params.recommended_action);
  const actualPositive = params.actual_value_score >= 60;
  if (predictedPositive && actualPositive) return { prediction_result: "true_positive", hit: true, outcome_status: "available" };
  if (predictedPositive && !actualPositive) return { prediction_result: "false_positive", hit: false, outcome_status: "available" };
  if (!predictedPositive && !actualPositive) return { prediction_result: "true_negative", hit: true, outcome_status: "available" };
  return { prediction_result: "false_negative", hit: false, outcome_status: "available" };
}

function cleanPayload(payload: Record<string, unknown>) {
  const allow = [
    "market_price_advantage",
    "radar_real_discount",
    "market_confidence_score",
    "trend_score",
    "trend_velocity",
    "purchase_intent_score",
    "demand_confidence_score",
    "payment_attractiveness_score",
    "internal_performance_score",
    "internal_performance_confidence",
    "historical_segment_score",
    "historical_segment_confidence",
    "performance_segment_key",
    "score_components",
    "reasons",
    "warnings",
    "blocking_reasons",
  ];
  return Object.fromEntries(allow.map((key) => [key, payload[key]]).filter(([, value]) => value !== undefined));
}

export async function recordDecisionSnapshot(
  client: SupabaseClient,
  params: DecisionSnapshotInput,
): Promise<string | null> {
  const score = roundedScore(numberOrZero(params.payload.opportunity_score));
  const confidence = roundedScore(numberOrZero(params.payload.opportunity_confidence));
  const expected = calculateInitialExpectedValue(params.payload);
  const action = recommendedAction({
    classification: params.payload.classification,
    publishingGateStatus: params.payload.publishing_gate_status,
  });
  const evaluatedAt = textOrNull(params.payload.evaluated_at) ?? new Date().toISOString();
  const offerId = text(params.offer.id ?? params.payload.offer_id);
  if (!offerId) return null;

  const snapshotPayload = {
    evaluation_id: params.evaluationId,
    offer_id: offerId,
    canonical_product_id: textOrNull(params.payload.canonical_product_id),
    opportunity_score: score,
    opportunity_confidence: confidence,
    classification: text(params.payload.classification) || "WATCH",
    publishing_gate_status: textOrNull(params.payload.publishing_gate_status),
    engine_mode: text(params.payload.engine_mode) || "shadow",
    recommended_action: action,
    expected_value: expected.expected_value,
    expected_value_components: expected.components,
    score_bucket: scoreBucket(score),
    confidence_bucket: confidenceBucket(confidence),
    category: textOrNull(params.offer.category ?? params.offer.category_name),
    marketplace: textOrNull(params.offer.marketplace ?? params.offer.platform),
    channel: textOrNull(params.offer.channel ?? params.offer.source),
    published_at: textOrNull(params.offer.published_at ?? params.offer.updated_at ?? params.offer.created_at),
    snapshot_payload: cleanPayload(params.payload),
    evaluated_at: evaluatedAt,
  };

  const { data, error } = await client
    .from("decision_snapshots")
    .upsert(snapshotPayload, { onConflict: "evaluation_id" })
    .select("id")
    .single();

  if (error) throw new Error(`Falha ao gravar decision snapshot: ${error.message}`);
  const snapshotId = String((data as { id: string }).id);

  await Promise.allSettled([
    client
      .from("opportunity_evaluations")
      .update({
        decision_expected_value: expected.expected_value,
        decision_snapshot_id: snapshotId,
        decision_validation_status: "snapshotted",
      })
      .eq("id", params.evaluationId),
    client
      .from("opportunity_current_state")
      .update({
        decision_expected_value: expected.expected_value,
        latest_decision_snapshot_id: snapshotId,
        decision_validation_status: "snapshotted",
      })
      .eq("offer_id", offerId),
  ]);

  return snapshotId;
}

function addHours(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 60 * 60 * 1000).toISOString();
}

function filterByChannel<T extends { channel?: string | null; source?: string | null }>(rows: T[], channel: string): T[] {
  if (channel === "all") return rows;
  return rows.filter((row) => normalizeLearningChannel(row.channel ?? row.source) === channel);
}

async function loadOutcomeRows(client: SupabaseClient, offerId: string, startIso: string, endIso: string) {
  const [eventsResult, clicksResult] = await Promise.all([
    client
      .from("analytics_events")
      .select("event_type,channel,source,quantity,revenue,commission,created_at")
      .eq("offer_id", offerId)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    client
      .from("clicks")
      .select("source,created_at")
      .eq("offer_id", offerId)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
  ]);
  if (eventsResult.error) throw new Error(`Falha ao buscar analytics_events: ${eventsResult.error.message}`);
  if (clicksResult.error) throw new Error(`Falha ao buscar clicks: ${clicksResult.error.message}`);
  return {
    events: (eventsResult.data ?? []) as AnalyticsEventRow[],
    clicks: (clicksResult.data ?? []) as ClickRow[],
  };
}

function channelsForOutcome(events: AnalyticsEventRow[], clicks: ClickRow[], fallback: string | null): string[] {
  const channels = new Set<string>(["all"]);
  if (fallback) channels.add(normalizeLearningChannel(fallback));
  for (const event of events) channels.add(normalizeLearningChannel(event.channel ?? event.source));
  for (const click of clicks) channels.add(normalizeLearningChannel(click.source));
  channels.delete("");
  return Array.from(channels);
}

function buildOutcomePayload(params: {
  snapshot: DecisionSnapshotRow;
  windowKey: DecisionWindow;
  windowStart: string;
  windowEnd: string;
  channel: string;
  metrics: PerformanceMetrics & { latestEventAt: string | null };
}): DecisionOutcomeRow {
  const sampleConfidence = calculateSampleConfidence(params.metrics, params.metrics.latestEventAt);
  const actualValue = calculateActualValueScore(params.metrics);
  const classified = classifyPrediction({
    recommended_action: params.snapshot.recommended_action,
    prediction_score: params.snapshot.opportunity_score,
    prediction_confidence: params.snapshot.opportunity_confidence,
    actual_value_score: actualValue,
    sample_confidence: sampleConfidence,
  });

  return {
    decision_snapshot_id: params.snapshot.id,
    evaluation_id: params.snapshot.evaluation_id,
    offer_id: params.snapshot.offer_id,
    canonical_product_id: params.snapshot.canonical_product_id,
    evaluation_window: params.windowKey,
    window_started_at: params.windowStart,
    window_ended_at: params.windowEnd,
    channel: params.channel,
    category: params.snapshot.category,
    marketplace: params.snapshot.marketplace,
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
    actual_value_score: actualValue,
    expected_value: params.snapshot.expected_value,
    prediction_score: params.snapshot.opportunity_score,
    prediction_confidence: params.snapshot.opportunity_confidence,
    prediction_bucket: params.snapshot.score_bucket,
    confidence_bucket: params.snapshot.confidence_bucket,
    outcome_status: classified.outcome_status,
    prediction_result: classified.prediction_result,
    hit: classified.hit,
    sample_confidence: sampleConfidence,
  };
}

export async function refreshDecisionOutcomes(
  client: SupabaseClient,
  options: { limit?: number; now?: Date; sinceDays?: number } = {},
) {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - (options.sinceDays ?? 30) * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("decision_snapshots")
    .select(
      "id,evaluation_id,offer_id,canonical_product_id,opportunity_score,opportunity_confidence,classification,publishing_gate_status,engine_mode,recommended_action,expected_value,score_bucket,confidence_bucket,category,marketplace,channel,published_at,evaluated_at,created_at",
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(options.limit ?? 250, 1000)));
  if (error) throw new Error(`Falha ao buscar decision snapshots: ${error.message}`);

  const snapshots = (data ?? []) as DecisionSnapshotRow[];
  let pending = 0;
  let upserted = 0;
  let skipped = 0;

  for (const snapshot of snapshots) {
    const start = snapshot.published_at ?? snapshot.evaluated_at ?? snapshot.created_at;
    if (!Number.isFinite(Date.parse(start))) {
      skipped += DECISION_EVALUATION_WINDOWS.length;
      continue;
    }

    for (const window of DECISION_EVALUATION_WINDOWS) {
      const windowEnd = addHours(start, window.hours);
      if (Date.parse(windowEnd) > now.getTime()) {
        const { error: pendingError } = await client.from("decision_outcomes").upsert(
          {
            decision_snapshot_id: snapshot.id,
            evaluation_id: snapshot.evaluation_id,
            offer_id: snapshot.offer_id,
            canonical_product_id: snapshot.canonical_product_id,
            evaluation_window: window.key,
            window_started_at: start,
            window_ended_at: windowEnd,
            channel: "all",
            category: snapshot.category,
            marketplace: snapshot.marketplace,
            expected_value: snapshot.expected_value,
            prediction_score: snapshot.opportunity_score,
            prediction_confidence: snapshot.opportunity_confidence,
            prediction_bucket: snapshot.score_bucket,
            confidence_bucket: snapshot.confidence_bucket,
            outcome_status: "pending",
            prediction_result: null,
            hit: null,
            sample_confidence: 0,
            updated_at: now.toISOString(),
          },
          { onConflict: "decision_snapshot_id,evaluation_window,channel" },
        );
        if (pendingError) throw new Error(`Falha ao salvar outcome pendente: ${pendingError.message}`);
        pending += 1;
        continue;
      }

      const rows = await loadOutcomeRows(client, snapshot.offer_id, start, windowEnd);
      const channels = channelsForOutcome(rows.events, rows.clicks, snapshot.channel);
      for (const channel of channels) {
        const metrics = aggregatePerformanceMetrics({
          events: filterByChannel(rows.events, channel),
          clicks: filterByChannel(rows.clicks, channel),
        });
        const outcome = buildOutcomePayload({
          snapshot,
          windowKey: window.key,
          windowStart: start,
          windowEnd,
          channel,
          metrics,
        });
        const { error: upsertError } = await client.from("decision_outcomes").upsert(
          {
            ...outcome,
            metrics_payload: {
              impressions: outcome.impressions,
              clicks: outcome.clicks,
              affiliate_clicks: outcome.affiliate_clicks,
              orders: outcome.orders,
              revenue: outcome.revenue,
              commission: outcome.commission,
            },
            updated_at: now.toISOString(),
          },
          { onConflict: "decision_snapshot_id,evaluation_window,channel" },
        );
        if (upsertError) throw new Error(`Falha ao salvar decision outcome: ${upsertError.message}`);
        upserted += 1;
      }
    }
  }

  return { snapshots: snapshots.length, upserted, pending, skipped };
}

function groupSummary(rows: DecisionOutcomeRow[], keyFn: (row: DecisionOutcomeRow) => string | null): DecisionGroupSummary[] {
  const groups = new Map<string, DecisionOutcomeRow[]>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const existing = groups.get(key) ?? [];
    existing.push(row);
    groups.set(key, existing);
  }
  return Array.from(groups.entries())
    .map(([key, group]) => {
      const decisive = group.filter((row) => row.hit !== null);
      const hits = decisive.filter((row) => row.hit === true).length;
      return {
        key,
        sample_size: group.length,
        decisive_count: decisive.length,
        hit_count: hits,
        hit_rate: decisive.length ? roundMoney((hits / decisive.length) * 100) : null,
        average_expected_value: average(group.map((row) => row.expected_value)),
        average_actual_value: average(group.map((row) => row.actual_value_score)),
        average_confidence: average(group.map((row) => row.prediction_confidence)),
      };
    })
    .sort((left, right) => right.decisive_count - left.decisive_count || (right.hit_rate ?? -1) - (left.hit_rate ?? -1));
}

export function summarizeDecisionOutcomes(rows: DecisionOutcomeRow[], params: {
  periodStart: string;
  periodEnd: string;
}): DecisionCalibrationSummary {
  const available = rows.filter((row) => row.outcome_status === "available" && row.channel === "all");
  const thresholds = [60, 65, 70, 72, 75, 80, 85, 90];
  const threshold_recommendations = thresholds.map<ThresholdRecommendation>((threshold) => {
    const predicted = available.filter(
      (row) => (row.prediction_score ?? 0) >= threshold && (row.prediction_confidence ?? 0) >= 60,
    );
    const hits = predicted.filter((row) => row.hit === true).length;
    const hitRate = predicted.length ? roundMoney((hits / predicted.length) * 100) : null;
    return {
      threshold,
      sample_size: predicted.length,
      hit_rate: hitRate,
      average_actual_value: average(predicted.map((row) => row.actual_value_score)),
      recommendation:
        predicted.length < 10 ? "insufficient_data" : hitRate !== null && hitRate >= 60 ? "candidate" : "hold_shadow",
    };
  });

  const expectedAverage = average(available.map((row) => row.expected_value));
  const actualAverage = average(available.map((row) => row.actual_value_score));
  return {
    period_start: params.periodStart,
    period_end: params.periodEnd,
    windows: groupSummary(rows.filter((row) => row.channel === "all"), (row) => String(row.evaluation_window)),
    score_bucket_accuracy: groupSummary(available, (row) => row.prediction_bucket),
    confidence_bucket_accuracy: groupSummary(available, (row) => row.confidence_bucket),
    channel_performance: groupSummary(rows.filter((row) => row.channel !== "all"), (row) => row.channel),
    category_performance: groupSummary(available, (row) => row.category ?? "sem_categoria"),
    category_channel_performance: groupSummary(
      rows.filter((row) => row.channel !== "all"),
      (row) => `${row.category ?? "sem_categoria"} + ${row.channel}`,
    ),
    threshold_recommendations,
    expected_vs_actual: {
      average_expected_value: expectedAverage,
      average_actual_value: actualAverage,
      average_delta:
        expectedAverage !== null && actualAverage !== null ? roundMoney(actualAverage - expectedAverage) : null,
    },
    sample_size: available.length,
  };
}

export async function buildDecisionIntelligenceSummary(
  client: SupabaseClient,
  options: { days?: number; window?: DecisionWindow | "all" } = {},
) {
  const days = Math.max(1, Math.min(options.days ?? 30, 180));
  const periodEnd = new Date().toISOString();
  const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  let query = client
    .from("decision_outcomes")
    .select("*")
    .gte("updated_at", periodStart)
    .order("updated_at", { ascending: false })
    .limit(2500);
  if (options.window && options.window !== "all") {
    query = query.eq("evaluation_window", options.window);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Falha ao carregar Decision Intelligence: ${error.message}`);

  const outcomes = (data ?? []) as DecisionOutcomeRow[];
  const summary = summarizeDecisionOutcomes(outcomes, { periodStart, periodEnd });
  const { count: snapshotCount } = await client
    .from("decision_snapshots")
    .select("id", { count: "exact", head: true })
    .gte("created_at", periodStart);

  return {
    ...summary,
    snapshot_count: snapshotCount ?? 0,
    outcome_count: outcomes.length,
    pending_count: outcomes.filter((row) => row.outcome_status === "pending").length,
    insufficient_count: outcomes.filter((row) => row.outcome_status === "insufficient_data").length,
  };
}

export async function runDecisionCalibration(
  client: SupabaseClient,
  options: { days?: number; window?: DecisionWindow | "all" } = {},
) {
  const summary = await buildDecisionIntelligenceSummary(client, options);
  const { data, error } = await client
    .from("decision_calibration_runs")
    .insert({
      period_start: summary.period_start,
      period_end: summary.period_end,
      windows: summary.windows,
      score_bucket_accuracy: summary.score_bucket_accuracy,
      confidence_bucket_accuracy: summary.confidence_bucket_accuracy,
      channel_performance: summary.channel_performance,
      category_performance: summary.category_performance,
      category_channel_performance: summary.category_channel_performance,
      threshold_recommendations: summary.threshold_recommendations,
      expected_vs_actual: summary.expected_vs_actual,
      sample_size: summary.sample_size,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao registrar calibracao: ${error.message}`);
  return { calibration_run_id: String((data as { id: string }).id), summary };
}
