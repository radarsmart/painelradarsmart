import { calculatePaymentAttractiveness } from "@/lib/opportunity-engine/payment-attractiveness-service";
import type { PriceNormalizerInput } from "@/lib/opportunity-engine/price-normalizer";
import { clamp, toNullableNumber } from "@/lib/opportunity-engine/text-utils";

export type OpportunityClassification =
  | "PUBLISH_NOW"
  | "HIGH_PRIORITY"
  | "PUBLISH"
  | "WATCH"
  | "LOW_PRIORITY"
  | "REJECT";

export type RadarOpportunityScoreInput = PriceNormalizerInput & {
  trend_score?: unknown;
  purchase_intent_score?: unknown;
  market_price_advantage?: unknown;
  radar_real_discount?: unknown;
  sales_popularity?: unknown;
  payment_attractiveness?: unknown;
  internal_performance?: unknown;
  affiliate_commission?: unknown;
};

export type RadarOpportunityScoreResult = {
  score: number;
  classification: OpportunityClassification;
  confidence: number;
  data_completeness_score: number;
  reasons: string[];
  warnings: string[];
  weights: Record<string, number>;
  score_components: Record<
    string,
    {
      score: number | null;
      weight: number;
      contribution: number | null;
      status: "available" | "unavailable";
    }
  >;
};

const DEFAULT_WEIGHTS = {
  trend_score: 0.2,
  purchase_intent_score: 0.2,
  market_price_advantage: 0.15,
  radar_real_discount: 0.15,
  sales_popularity: 0.1,
  payment_attractiveness: 0.1,
  internal_performance: 0.05,
  affiliate_commission: 0.05,
};

function readWeight(name: keyof typeof DEFAULT_WEIGHTS): number {
  const envKey = `OPPORTUNITY_WEIGHT_${name.toUpperCase()}`;
  const configured = toNullableNumber(process.env[envKey]);
  if (configured === null) return DEFAULT_WEIGHTS[name];
  return configured > 1 ? configured / 100 : configured;
}

function classify(score: number): OpportunityClassification {
  if (score >= 90) return "PUBLISH_NOW";
  if (score >= 80) return "HIGH_PRIORITY";
  if (score >= 72) return "PUBLISH";
  if (score >= 60) return "WATCH";
  if (score >= 40) return "LOW_PRIORITY";
  return "REJECT";
}

function scoreSignal(value: unknown): number | null {
  const parsed = toNullableNumber(value);
  if (parsed === null) return null;
  return clamp(parsed, 0, 100);
}

export function calculateRadarOpportunityScore(
  input: RadarOpportunityScoreInput,
): RadarOpportunityScoreResult {
  const payment =
    scoreSignal(input.payment_attractiveness) ??
    calculatePaymentAttractiveness(input).payment_attractiveness_score;
  const paymentResult = calculatePaymentAttractiveness(input);
  const weights = Object.fromEntries(
    (Object.keys(DEFAULT_WEIGHTS) as Array<keyof typeof DEFAULT_WEIGHTS>).map((key) => [
      key,
      readWeight(key),
    ]),
  ) as Record<string, number>;

  const signals: Record<string, number | null> = {
    trend_score: scoreSignal(input.trend_score),
    purchase_intent_score: scoreSignal(input.purchase_intent_score),
    market_price_advantage: scoreSignal(input.market_price_advantage),
    radar_real_discount: scoreSignal(input.radar_real_discount),
    sales_popularity: scoreSignal(input.sales_popularity),
    payment_attractiveness: payment,
    internal_performance: scoreSignal(input.internal_performance),
    affiliate_commission: scoreSignal(input.affiliate_commission),
  };

  let weightedSum = 0;
  let availableWeight = 0;
  let totalWeight = 0;
  const reasons: string[] = [];
  const warnings = [...paymentResult.warnings];
  const scoreComponents: RadarOpportunityScoreResult["score_components"] = {};

  for (const [key, value] of Object.entries(signals)) {
    const weight = weights[key] ?? 0;
    totalWeight += weight;
    if (value === null) {
      warnings.push(`${key} unavailable.`);
      scoreComponents[key] = {
        score: null,
        weight,
        contribution: null,
        status: "unavailable",
      };
      continue;
    }
    const contribution = value * weight;
    weightedSum += contribution;
    availableWeight += weight;
    if (value >= 80) reasons.push(`${key} alto.`);
    scoreComponents[key] = {
      score: value,
      weight,
      contribution: Math.round(contribution * 100) / 100,
      status: "available",
    };
  }

  const score = availableWeight > 0 ? Math.round(weightedSum / availableWeight) : 0;
  const dataCompleteness = totalWeight > 0 ? Math.round((availableWeight / totalWeight) * 100) : 0;
  const confidence = Math.round(clamp(dataCompleteness, 0, 100));
  return {
    score,
    classification: classify(score),
    confidence,
    data_completeness_score: dataCompleteness,
    reasons,
    warnings,
    weights,
    score_components: scoreComponents,
  };
}

export function getAutoPublishMinScore(): number {
  const configured = toNullableNumber(process.env.AUTO_PUBLISH_MIN_SCORE);
  return configured !== null ? Math.round(clamp(configured, 0, 100)) : 72;
}

export function getAutoPublishMinConfidence(): number {
  const configured = toNullableNumber(process.env.AUTO_PUBLISH_MIN_CONFIDENCE);
  return configured !== null ? Math.round(clamp(configured, 0, 100)) : 70;
}
