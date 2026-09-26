import type { SupabaseClient } from "@supabase/supabase-js";

import {
  runDemandIntelligence,
  type DemandSnapshot,
} from "@/lib/opportunity-engine/demand-intelligence-service";
import {
  runExternalMarketSearch,
  updateExternalEvidenceOutliers,
  type ExternalMarketEvidence,
} from "@/lib/opportunity-engine/external-market-search-service";
import { compareMarketOffers } from "@/lib/opportunity-engine/market-comparison-service";
import { calculateRadarOpportunityScore } from "@/lib/opportunity-engine/opportunity-score";
import { calculatePaymentAttractiveness } from "@/lib/opportunity-engine/payment-attractiveness-service";
import {
  calculateRadarRealDiscount,
  type PriceHistorySnapshot,
} from "@/lib/opportunity-engine/price-history";
import { normalizePaymentTerms } from "@/lib/opportunity-engine/price-normalizer";
import { evaluatePublishingGate } from "@/lib/opportunity-engine/publishing-gate-service";
import { normalizeProduct } from "@/lib/opportunity-engine/product-normalizer";
import { clamp, roundMoney, toNullableNumber } from "@/lib/opportunity-engine/text-utils";
import { getOpportunityEngineFlags } from "@/lib/opportunity-engine/feature-flags";
import {
  internalPerformanceScoreForOpportunity,
  runRadarLearningEngine,
} from "@/lib/opportunity-engine/learning-engine-service";
import { recordDecisionSnapshot } from "@/lib/opportunity-engine/decision-validation-service";

export type OpportunityEvaluationResult = {
  evaluation_id: string;
  offer_id: string;
  canonical_product_id: string | null;
  opportunity_score: number;
  opportunity_confidence: number;
  data_completeness_score: number;
  classification: string;
  publishing_gate_status: string;
  reasons: string[];
  warnings: string[];
  blocking_reasons: string[];
};

type OfferRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  marketplace?: string | null;
  category?: string | null;
  image_url?: string | null;
  affiliate_url?: string | null;
};

const OFFER_SELECT = [
  "id",
  "title",
  "brand",
  "model",
  "marketplace",
  "platform",
  "category",
  "category_name",
  "image_url",
  "affiliate_url",
  "product_url",
  "external_offer_id",
  "status",
  "availability",
  "expires_at",
  "price",
  "old_price",
  "original_price",
  "regular_price",
  "cash_price",
  "pix_price",
  "card_price",
  "installment_total_price",
  "installment_count",
  "installment_amount",
  "installment_interest_free",
  "shipping_cost",
  "coupon_discount",
  "automatic_discount",
  "cashback",
  "effective_price",
  "currency",
  "payment_information_original",
  "rating",
  "review_count",
  "reviews_count",
  "sales",
  "click_count",
  "raw_data",
].join(",");

function toText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function toIntegerOrNull(value: unknown): number | null {
  const parsed = toNullableNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function marketplaceDiscount(offer: OfferRow, currentEffective: number | null): number | null {
  const oldPrice = toNullableNumber(offer.old_price ?? offer.original_price);
  if (!oldPrice || !currentEffective || oldPrice <= currentEffective) return null;
  return roundMoney(((oldPrice - currentEffective) / oldPrice) * 100);
}

function marketAdvantageScore(diffPct: number | null): number | null {
  if (diffPct === null) return null;
  return Math.round(clamp(50 + diffPct * 3, 0, 100));
}

function radarDiscountScore(discountPct: number | null): number | null {
  if (discountPct === null) return null;
  return Math.round(clamp(discountPct * 5, 0, 100));
}

function salesPopularityScore(offer: OfferRow): number | null {
  const sales = toNullableNumber(offer.sales);
  if (sales !== null) return Math.round(clamp(sales / 10, 0, 100));
  const reviews = toNullableNumber(offer.review_count ?? offer.reviews_count);
  if (reviews !== null) return Math.round(clamp(reviews / 20, 0, 100));
  return null;
}

async function readOffer(client: SupabaseClient, offerId: string): Promise<OfferRow> {
  const { data, error } = await client
    .from("offers")
    .select(OFFER_SELECT)
    .eq("id", offerId)
    .single();

  if (error || !data) {
    throw new Error(`Oferta nao encontrada para avaliacao: ${error?.message ?? offerId}`);
  }

  return data as unknown as OfferRow;
}

async function resolveCanonicalProduct(client: SupabaseClient, offer: OfferRow) {
  const normalized = normalizeProduct({
    title: offer.title,
    brand: offer.brand,
    model: offer.model,
    category: offer.category ?? offer.category_name,
    product_url: offer.product_url,
    affiliate_url: offer.affiliate_url,
    image_url: offer.image_url,
    raw_data: offer.raw_data,
  });

  const payload = {
    canonical_name: normalized.canonical_name,
    brand: normalized.brand,
    model: normalized.model,
    ean: normalized.ean,
    gtin: normalized.gtin,
    mpn: normalized.mpn,
    category: normalized.category,
    attributes_json: normalized.attributes_json,
    canonical_key: normalized.canonical_key,
    status: normalized.status,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("canonical_products")
    .upsert(payload, { onConflict: "canonical_key" })
    .select("id,canonical_key")
    .single();

  if (error || !data) {
    throw new Error(`Falha ao resolver canonical product: ${error?.message ?? "sem retorno"}`);
  }

  return {
    canonicalProductId: String((data as { id: string }).id),
    normalized,
  };
}

async function recordRawProduct(client: SupabaseClient, offer: OfferRow): Promise<string | null> {
  const title = toText(offer.title);
  if (!title) return null;

  const { data, error } = await client
    .from("raw_products")
    .insert({
      source: "offer_evaluation",
      marketplace: toText(offer.marketplace ?? offer.platform),
      external_product_id: toText(offer.external_offer_id) ?? String(offer.id),
      title_original: title,
      url: toText(offer.product_url),
      affiliate_url: toText(offer.affiliate_url),
      image_url: toText(offer.image_url),
      brand_original: toText(offer.brand),
      model_original: toText(offer.model),
      price_original: toNullableNumber(offer.price),
      old_price_original: toNullableNumber(offer.old_price ?? offer.original_price),
      payment_information_original: toText(offer.payment_information_original),
      seller: toText(offer.seller_name),
      rating: toNullableNumber(offer.rating),
      review_count: toIntegerOrNull(offer.review_count ?? offer.reviews_count),
      sales_count: toIntegerOrNull(offer.sales),
      stock_status: toText(offer.availability),
      raw_payload: offer.raw_data && typeof offer.raw_data === "object" ? offer.raw_data : offer,
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[OpportunityEvaluation] raw_product insert failed", {
      offer_id: offer.id,
      error: error.message,
    });
    return null;
  }

  return String((data as { id: string }).id);
}

async function upsertMatch(client: SupabaseClient, params: {
  offerId: string;
  canonicalProductId: string;
  rawProductId: string | null;
}) {
  const match = {
    match_score: 100,
    match_status: "CONFIRMED",
    match_reasons: ["Canonical key resolvida para a oferta."],
    conflicts: [],
  };

  await client.from("product_offer_matches").upsert(
    {
      offer_id: params.offerId,
      canonical_product_id: params.canonicalProductId,
      raw_product_id: params.rawProductId,
      ...match,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "offer_id,canonical_product_id" },
  );

  return match;
}

async function recordPriceSnapshot(client: SupabaseClient, params: {
  offer: OfferRow;
  canonicalProductId: string;
  payment: ReturnType<typeof normalizePaymentTerms>;
}) {
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

  const existing = await client
    .from("offer_price_history")
    .select("id")
    .eq("offer_id", params.offer.id)
    .eq("source", "opportunity-evaluation")
    .gte("captured_at", fiveMinutesAgo)
    .limit(1)
    .maybeSingle();

  if (existing.data) return;

  await client.from("offer_price_history").insert({
    offer_id: params.offer.id,
    canonical_product_id: params.canonicalProductId,
    marketplace: toText(params.offer.marketplace ?? params.offer.platform),
    seller: toText(params.offer.seller_name),
    price: params.payment.regular_price,
    original_price: toNullableNumber(params.offer.old_price ?? params.offer.original_price),
    regular_price: params.payment.regular_price,
    pix_price: params.payment.pix_price,
    card_price: params.payment.card_price,
    effective_price: params.payment.effective_price,
    shipping_cost: params.payment.shipping_cost,
    currency: params.payment.currency,
    source: "opportunity-evaluation",
    raw_payload: {
      cash_price: params.payment.cash_price,
      installments: params.payment.installments,
      installment_value: params.payment.installment_value,
      interest_free: params.payment.interest_free,
    },
  });
}

async function loadPriceHistory(client: SupabaseClient, canonicalProductId: string, offerId: string) {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await client
    .from("offer_price_history")
    .select("offer_id,canonical_product_id,marketplace,seller,regular_price,pix_price,card_price,effective_price,shipping_cost,captured_at")
    .or(`canonical_product_id.eq.${canonicalProductId},offer_id.eq.${offerId}`)
    .gte("captured_at", since)
    .order("captured_at", { ascending: false })
    .limit(1000);

  return (data ?? []) as PriceHistorySnapshot[];
}

async function persistEvaluation(client: SupabaseClient, payload: Record<string, unknown>) {
  const { data, error } = await client
    .from("opportunity_evaluations")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Falha ao persistir opportunity_evaluation: ${error?.message ?? "sem retorno"}`);
  }

  return String((data as { id: string }).id);
}

// evaluationPayload alimenta o insert em opportunity_evaluations (historico
// completo) E o upsert em opportunity_current_state (snapshot mais enxuto) —
// essas duas tabelas nao tem exatamente as mesmas colunas (ex.: current_state
// so tem "*_score" resumido, nao os campos brutos como job_id/feature_flags).
// Espalhar o payload inteiro sem filtrar faz o upsert falhar com "column nao
// encontrada" pra qualquer chave que so exista em opportunity_evaluations.
const CURRENT_STATE_EXCLUDED_KEYS = new Set([
  "job_id",
  "normalization_status",
  "market_price_advantage",
  "payment_attractiveness",
  "internal_performance",
  "sales_popularity",
  "affiliate_commission",
  "feature_flags",
]);

function toCurrentStatePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (CURRENT_STATE_EXCLUDED_KEYS.has(key)) continue;
    result[key] = value;
  }
  return result;
}

async function updateOfferAndCurrentState(client: SupabaseClient, params: {
  evaluationId: string;
  payload: Record<string, unknown>;
  offer: OfferRow;
}) {
  const now = new Date().toISOString();
  const offerUpdateResult = await client
    .from("offers")
    .update({
      canonical_product_id: params.payload.canonical_product_id,
      regular_price: params.payload.regular_price,
      pix_price: params.payload.pix_price,
      card_price: params.payload.card_price,
      effective_price: params.payload.effective_price,
      shipping_cost: params.payload.shipping_cost,
      match_score: params.payload.match_score,
      match_status: params.payload.match_status,
      opportunity_score: params.payload.opportunity_score,
      opportunity_classification: params.payload.classification,
      publishing_gate_status: params.payload.publishing_gate_status,
      opportunity_reasons: params.payload.reasons,
      opportunity_warnings: params.payload.warnings,
      updated_at: now,
    })
    .eq("id", params.offer.id);

  if (offerUpdateResult.error) {
    throw new Error(`Falha ao atualizar offers pos-avaliacao: ${offerUpdateResult.error.message}`);
  }

  const currentStateResult = await client.from("opportunity_current_state").upsert(
    {
      offer_id: params.offer.id,
      latest_evaluation_id: params.evaluationId,
      title: params.offer.title ?? null,
      marketplace: params.offer.marketplace ?? params.offer.platform ?? null,
      category: params.offer.category ?? params.offer.category_name ?? null,
      image_url: params.offer.image_url ?? null,
      affiliate_url: params.offer.affiliate_url ?? null,
      installment_count: toIntegerOrNull(params.offer.installment_count),
      installment_amount: toNullableNumber(params.offer.installment_amount),
      installment_interest_free:
        typeof params.offer.installment_interest_free === "boolean"
          ? params.offer.installment_interest_free
          : null,
      ...toCurrentStatePayload(params.payload),
      updated_at: now,
    },
    { onConflict: "offer_id" },
  );

  if (currentStateResult.error) {
    throw new Error(`Falha ao atualizar opportunity_current_state: ${currentStateResult.error.message}`);
  }
}

function buildRadarMarketOffer(offer: OfferRow) {
  return {
    id: offer.id,
    marketplace: offer.marketplace ?? offer.platform ?? "Radar Smart",
    price: offer.price,
    regular_price: offer.regular_price,
    pix_price: offer.pix_price,
    cash_price: offer.cash_price,
    card_price: offer.card_price,
    shipping_cost: offer.shipping_cost,
    installment_count: offer.installment_count,
    installment_amount: offer.installment_amount,
    installment_interest_free: offer.installment_interest_free,
    effective_price: offer.effective_price,
    match_score: 100,
  };
}

function evidenceToMarketOffer(evidence: ExternalMarketEvidence) {
  return {
    id: evidence.id,
    marketplace: evidence.marketplace ?? evidence.source,
    seller: evidence.seller,
    price: evidence.regular_price,
    regular_price: evidence.regular_price,
    pix_price: evidence.pix_price,
    card_price: evidence.card_price,
    shipping_cost: evidence.shipping_cost,
    installment_count: evidence.installments,
    installment_amount: evidence.installment_value,
    installment_interest_free: evidence.interest_free,
    effective_price: evidence.effective_price,
    match_score: evidence.match_score,
  };
}

function compactMarketEvidence(evidence: ExternalMarketEvidence[]) {
  return evidence.slice(0, 20).map((item) => ({
    id: item.id,
    provider: item.provider,
    source: item.source,
    marketplace: item.marketplace,
    seller: item.seller,
    title: item.title,
    url: item.url,
    regular_price: item.regular_price,
    pix_price: item.pix_price,
    card_price: item.card_price,
    installments: item.installments,
    installment_value: item.installment_value,
    interest_free: item.interest_free,
    shipping_cost: item.shipping_cost,
    effective_price: item.effective_price,
    match_score: item.match_score,
    match_status: item.match_status,
    included_in_comparison: item.included_in_comparison,
    excluded_reason: item.excluded_reason,
    is_price_outlier: item.is_price_outlier,
    captured_at: item.captured_at,
  }));
}

function compactDemandSnapshots(snapshots: DemandSnapshot[]) {
  return snapshots.slice(0, 30).map((item) => ({
    id: item.id,
    provider: item.provider,
    provider_type: item.provider_type,
    query: item.query,
    query_intent: item.query_intent,
    interest_score: item.interest_score,
    trend_score: item.trend_score,
    trend_velocity: item.trend_velocity,
    purchase_intent_score: item.purchase_intent_score,
    confidence: item.confidence,
    status: item.status,
    captured_at: item.captured_at,
  }));
}

export async function evaluateOffer(
  client: SupabaseClient,
  offerId: string,
  options: {
    jobId?: string | null;
    reason?: string;
    forceMarketRefresh?: boolean;
    forceDemandRefresh?: boolean;
    forceLearningRefresh?: boolean;
  } = {},
): Promise<OpportunityEvaluationResult> {
  const startedAt = Date.now();
  const flags = getOpportunityEngineFlags();

  if (options.jobId) {
    const existing = await client
      .from("opportunity_evaluations")
      .select("id,offer_id,canonical_product_id,opportunity_score,opportunity_confidence,data_completeness_score,classification,publishing_gate_status,reasons,warnings,blocking_reasons")
      .eq("job_id", options.jobId)
      .maybeSingle();

    if (existing.data) {
      const row = existing.data as Record<string, unknown>;
      return {
        evaluation_id: String(row.id),
        offer_id: String(row.offer_id),
        canonical_product_id: toText(row.canonical_product_id),
        opportunity_score: Number(row.opportunity_score ?? 0),
        opportunity_confidence: Number(row.opportunity_confidence ?? 0),
        data_completeness_score: Number(row.data_completeness_score ?? 0),
        classification: String(row.classification ?? "WATCH"),
        publishing_gate_status: String(row.publishing_gate_status ?? "REVIEW_REQUIRED"),
        reasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [],
        warnings: Array.isArray(row.warnings) ? row.warnings.map(String) : [],
        blocking_reasons: Array.isArray(row.blocking_reasons) ? row.blocking_reasons.map(String) : [],
      };
    }
  }

  const offer = await readOffer(client, offerId);
  const { canonicalProductId, normalized } = await resolveCanonicalProduct(client, offer);
  const rawProductId = await recordRawProduct(client, offer);
  const match = await upsertMatch(client, {
    offerId,
    canonicalProductId,
    rawProductId,
  });
  const payment = normalizePaymentTerms(offer as Record<string, unknown>);
  await recordPriceSnapshot(client, { offer, canonicalProductId, payment });

  const externalSearch = await runExternalMarketSearch(client, {
    offerId,
    canonicalProductId,
    product: normalized,
    forceRefresh: options.forceMarketRefresh,
  });
  const matchedExternalEvidence = externalSearch.evidence.filter((item) => item.included_in_comparison);
  const marketOffers = [
    buildRadarMarketOffer(offer),
    ...matchedExternalEvidence.map(evidenceToMarketOffer),
  ];
  const comparison = compareMarketOffers(
    marketOffers.map((row) => ({ ...row, id: String(row.id) })),
    offerId,
  );
  await updateExternalEvidenceOutliers(
    client,
    comparison.outlier_offer_ids.filter((id) => matchedExternalEvidence.some((item) => item.id === id)),
  );
  const demand = await runDemandIntelligence(client, {
    offerId,
    canonicalProductId,
    product: normalized,
    forceRefresh: options.forceDemandRefresh,
  });
  const learning = await runRadarLearningEngine(client, {
    offerId,
    canonicalProductId,
    normalizedProduct: normalized,
    offer,
  });
  const history = await loadPriceHistory(client, canonicalProductId, offerId);
  const realDiscount = calculateRadarRealDiscount({
    current_effective_price: payment.effective_price,
    history,
  });
  const paymentScore = calculatePaymentAttractiveness(offer as Record<string, unknown>);
  const marketDiscount = marketplaceDiscount(offer, payment.effective_price);
  const demandCanScore = demand.status !== "unavailable" && demand.demand_confidence_score >= 35;
  const trendScore = demandCanScore ? demand.trend_score : null;
  const purchaseIntentScore = demandCanScore ? demand.purchase_intent_score : null;
  const internalScore = internalPerformanceScoreForOpportunity(learning);
  const salesScore = salesPopularityScore(offer);
  const marketScore =
    matchedExternalEvidence.length > 0 && comparison.valid_offer_count >= 2 && comparison.market_confidence_score >= 35
      ? marketAdvantageScore(comparison.price_difference_percent)
      : null;
  const realDiscountScoreValue = radarDiscountScore(realDiscount.radar_real_discount_pct);

  const opportunity = calculateRadarOpportunityScore({
    ...offer,
    market_price_advantage: marketScore,
    radar_real_discount: realDiscountScoreValue,
    sales_popularity: salesScore,
    payment_attractiveness: paymentScore.payment_attractiveness_score,
    internal_performance: internalScore,
    affiliate_commission: null,
    trend_score: trendScore,
    purchase_intent_score: purchaseIntentScore,
  });
  const gate = evaluatePublishingGate({
    ...offer,
    stock_status: offer.availability,
    regular_price: payment.regular_price,
    pix_price: payment.pix_price,
    card_price: payment.card_price,
    effective_price: payment.effective_price,
    shipping_cost: payment.shipping_cost,
    match_score: match.match_score,
    match_status: match.match_status,
    opportunity_score: opportunity.score,
    opportunity_confidence: opportunity.confidence,
  });

  const reasons = [
    ...opportunity.reasons,
    ...paymentScore.reasons,
    marketScore !== null && comparison.price_difference_percent !== null
      ? `Preco ${Math.abs(comparison.price_difference_percent).toFixed(1)}% ${
          comparison.price_difference_percent >= 0 ? "abaixo" : "acima"
        } da media do mercado externo.`
      : null,
    realDiscount.radar_real_discount_pct !== null
      ? `${realDiscount.radar_real_discount_pct.toFixed(1)}% de Radar Real Discount.`
      : null,
    match.match_score >= 90 ? "Match de produto confirmado." : null,
  ].filter((item): item is string => Boolean(item));
  const warnings = [
    ...opportunity.warnings,
    ...paymentScore.warnings,
    realDiscount.confidence === "insufficient" ? realDiscount.reason : null,
    externalSearch.status === "unavailable" ? externalSearch.errors[0] ?? "Mercado externo indisponivel." : null,
    externalSearch.status === "error" ? externalSearch.errors.join(" | ") : null,
    externalSearch.evidence.length > 0 && matchedExternalEvidence.length === 0
      ? "Nenhuma evidencia externa atingiu match suficiente para comparacao."
      : null,
    comparison.outlier_count > 0
      ? `${comparison.outlier_count} preco(s) externo(s) fora do padrao ignorado(s) na comparacao.`
      : null,
    demand.status === "unavailable" ? demand.errors[0] ?? "Demanda indisponivel." : null,
    demand.status === "error" ? demand.errors.join(" | ") : null,
    demand.status !== "unavailable" && demand.demand_confidence_score < 35
      ? `Demand Confidence baixo (${demand.demand_confidence_score}/100); sinais de demanda nao influenciaram o score.`
      : null,
    ...learning.warnings,
  ].filter((item): item is string => Boolean(item));
  const blockingReasons = gate.status === "BLOCKED" ? gate.reasons : [];

  const evaluationPayload: Record<string, unknown> = {
    job_id: options.jobId ?? null,
    offer_id: offerId,
    canonical_product_id: canonicalProductId,
    normalization_status: "normalized",
    match_score: match.match_score,
    match_status: match.match_status,
    regular_price: payment.regular_price,
    pix_price: payment.pix_price,
    card_price: payment.card_price,
    effective_price: payment.effective_price,
    shipping_cost: payment.shipping_cost,
    market_price_advantage: marketScore,
    market_lowest_price: comparison.lowest_effective_price,
    market_lowest_pix_price: comparison.lowest_pix_price,
    market_lowest_card_price: comparison.lowest_card_price,
    market_lowest_effective_price: comparison.lowest_effective_price,
    market_average_price: comparison.average_price,
    market_median_price: comparison.median_price,
    marketplace_count: comparison.marketplace_count,
    market_valid_offer_count: comparison.valid_offer_count,
    market_outlier_count: comparison.outlier_count,
    market_confidence_score: comparison.market_confidence_score,
    market_evidence: compactMarketEvidence(externalSearch.evidence),
    market_search_status: externalSearch.status,
    market_search_query: externalSearch.query?.query ?? null,
    market_search_cached: externalSearch.cached,
    comparison_confidence: comparison.comparison_confidence,
    marketplace_discount: marketDiscount,
    radar_real_discount: realDiscount.radar_real_discount_pct,
    trend_score: trendScore,
    trend_velocity: demand.trend_velocity,
    purchase_intent_score: purchaseIntentScore,
    demand_confidence_score: demand.demand_confidence_score,
    demand_provider_count: demand.provider_count,
    demand_snapshot_count: demand.snapshot_count,
    demand_status: demand.status,
    demand_query: demand.demand_query,
    demand_cached: demand.demand_cached,
    demand_snapshots: compactDemandSnapshots(demand.snapshots),
    payment_attractiveness: paymentScore.payment_attractiveness_score,
    payment_attractiveness_score: paymentScore.payment_attractiveness_score,
    internal_performance: internalScore,
    internal_performance_score: learning.internal_performance_score,
    internal_performance_confidence: learning.internal_performance_confidence,
    internal_performance_base: learning.performance_base,
    historical_segment_score: learning.historical_segment_score,
    historical_segment_confidence: learning.historical_segment_confidence,
    performance_segment_key: learning.performance_segment_key,
    performance_status: learning.performance_status,
    sales_popularity: salesScore,
    affiliate_commission: null,
    affiliate_commission_score: null,
    opportunity_score: opportunity.score,
    opportunity_confidence: opportunity.confidence,
    data_completeness_score: opportunity.data_completeness_score,
    classification: opportunity.classification,
    publishing_gate_status: gate.status,
    reasons,
    warnings,
    blocking_reasons: blockingReasons,
    score_components: opportunity.score_components,
    feature_flags: flags,
    engine_mode: flags.OPPORTUNITY_ENGINE_MODE,
    evaluated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const evaluationId = await persistEvaluation(client, evaluationPayload);
  await updateOfferAndCurrentState(client, {
    evaluationId,
    payload: evaluationPayload,
    offer,
  });
  await recordDecisionSnapshot(client, {
    evaluationId,
    offer,
    payload: evaluationPayload,
  }).catch((error) => {
    console.warn("[OpportunityEvaluation] decision snapshot skipped", {
      offer_id: offerId,
      evaluation_id: evaluationId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  console.info("[OpportunityEvaluation] completed", {
    offer_id: offerId,
    evaluation_id: evaluationId,
    score: opportunity.score,
    confidence: opportunity.confidence,
    gate: gate.status,
    duration_ms: Date.now() - startedAt,
  });

  return {
    evaluation_id: evaluationId,
    offer_id: offerId,
    canonical_product_id: canonicalProductId,
    opportunity_score: opportunity.score,
    opportunity_confidence: opportunity.confidence,
    data_completeness_score: opportunity.data_completeness_score,
    classification: opportunity.classification,
    publishing_gate_status: gate.status,
    reasons,
    warnings,
    blocking_reasons: blockingReasons,
  };
}
