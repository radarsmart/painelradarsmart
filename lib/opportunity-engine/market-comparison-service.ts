import { normalizePaymentTerms, type PriceNormalizerInput } from "@/lib/opportunity-engine/price-normalizer";
import { roundMoney } from "@/lib/opportunity-engine/text-utils";

export type MarketComparisonOffer = PriceNormalizerInput & {
  id: string;
  marketplace?: unknown;
  seller?: unknown;
  captured_at?: unknown;
  match_score?: unknown;
};

export type MarketComparisonResult = {
  lowest_price: number | null;
  lowest_pix_price: number | null;
  lowest_card_price: number | null;
  lowest_effective_price: number | null;
  average_price: number | null;
  median_price: number | null;
  highest_price: number | null;
  marketplace_count: number;
  offer_count: number;
  valid_offer_count: number;
  outlier_count: number;
  market_confidence_score: number;
  outlier_offer_ids: string[];
  price_difference_percent: number | null;
  position_in_market: "BEST" | "COMPETITIVE" | "AVERAGE" | "EXPENSIVE" | "UNKNOWN";
  best_offer_id: string | null;
  comparison_confidence: "high" | "medium" | "low" | "unavailable";
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function confidence(offerCount: number, marketplaceCount: number): MarketComparisonResult["comparison_confidence"] {
  if (offerCount >= 5 && marketplaceCount >= 3) return "high";
  if (offerCount >= 3 && marketplaceCount >= 2) return "medium";
  if (offerCount >= 1) return "low";
  return "unavailable";
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, price) => sum + price, 0) / values.length;
}

function isLowOutlier(value: number, values: number[]): boolean {
  if (values.length < 4) return false;
  const med = median(values);
  if (med === null || med <= 0) return false;

  const sorted = [...values].sort((a, b) => a - b);
  const firstQuartile = median(sorted.slice(0, Math.floor(sorted.length / 2)));
  const thirdQuartile = median(sorted.slice(Math.ceil(sorted.length / 2)));
  const hasQuartiles = firstQuartile !== null && thirdQuartile !== null;
  const iqr = hasQuartiles ? thirdQuartile - firstQuartile : 0;
  const iqrFence = hasQuartiles && iqr > 0 ? firstQuartile - 1.5 * iqr : med * 0.6;
  const ratioFence = med * 0.6;

  return value < iqrFence || value < ratioFence;
}

function confidenceScore(params: {
  validOfferCount: number;
  marketplaceCount: number;
  averageMatchScore: number | null;
  outlierCount: number;
}): number {
  if (params.validOfferCount === 0) return 0;
  const offerScore = Math.min(35, params.validOfferCount * 7);
  const marketplaceScore = Math.min(30, params.marketplaceCount * 10);
  const matchScore = params.averageMatchScore === null ? 15 : Math.min(25, Math.max(0, params.averageMatchScore - 70) * 1.25);
  const penalty = Math.min(20, params.outlierCount * 8);
  return Math.round(Math.max(0, Math.min(100, offerScore + marketplaceScore + matchScore + 10 - penalty)));
}

export function compareMarketOffers(
  offers: MarketComparisonOffer[],
  currentOfferId?: string | null,
): MarketComparisonResult {
  const normalized = offers
    .map((offer) => {
      const payment = normalizePaymentTerms(offer);
      return {
        offer,
        price: payment.regular_price ?? payment.card_price ?? payment.pix_price,
        effectivePrice: payment.effective_price,
      };
    })
    .filter((entry) => entry.effectivePrice !== null && entry.effectivePrice > 0);

  const effectivePrices = normalized.map((entry) => entry.effectivePrice as number);
  const marketplaces = new Set(
    normalized
      .map((entry) => String(entry.offer.marketplace ?? "").trim().toLowerCase())
      .filter(Boolean),
  );

  if (!normalized.length) {
    return {
      lowest_price: null,
      lowest_pix_price: null,
      lowest_card_price: null,
      lowest_effective_price: null,
      average_price: null,
      median_price: null,
      highest_price: null,
      marketplace_count: 0,
      offer_count: 0,
      valid_offer_count: 0,
      outlier_count: 0,
      market_confidence_score: 0,
      outlier_offer_ids: [],
      price_difference_percent: null,
      position_in_market: "UNKNOWN",
      best_offer_id: null,
      comparison_confidence: "unavailable",
    };
  }

  const outlierIds = normalized
    .filter((entry) => isLowOutlier(entry.effectivePrice as number, effectivePrices))
    .map((entry) => entry.offer.id);
  const valid = normalized.filter((entry) => !outlierIds.includes(entry.offer.id));
  const validEffectivePrices = valid.map((entry) => entry.effectivePrice as number);
  const validRegularPrices = valid
    .map((entry) => entry.price)
    .filter((price): price is number => price !== null && price > 0);
  const pixPrices = valid
    .map((entry) => normalizePaymentTerms(entry.offer).pix_price)
    .filter((price): price is number => price !== null && price > 0);
  const cardPrices = valid
    .map((entry) => normalizePaymentTerms(entry.offer).card_price)
    .filter((price): price is number => price !== null && price > 0);
  const validMarketplaces = new Set(
    valid
      .map((entry) => String(entry.offer.marketplace ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  const lowestEffective = validEffectivePrices.length ? Math.min(...validEffectivePrices) : null;
  const highestEffective = validEffectivePrices.length ? Math.max(...validEffectivePrices) : null;
  const avg = average(validEffectivePrices);
  const med = median(validEffectivePrices);
  const best = lowestEffective === null
    ? null
    : valid.find((entry) => entry.effectivePrice === lowestEffective) ?? null;
  const current = currentOfferId
    ? normalized.find((entry) => entry.offer.id === currentOfferId)
    : best;
  const currentEffective = current?.effectivePrice ?? null;
  const diffPct =
    currentEffective !== null && avg !== null && avg > 0
      ? roundMoney(((avg - currentEffective) / avg) * 100)
      : null;
  const matchScores = valid
    .map((entry) => Number(entry.offer.match_score))
    .filter((score) => Number.isFinite(score) && score > 0);
  const avgMatchScore = matchScores.length ? average(matchScores) : null;
  const marketConfidenceScore = confidenceScore({
    validOfferCount: valid.length,
    marketplaceCount: validMarketplaces.size,
    averageMatchScore: avgMatchScore === null ? null : roundMoney(avgMatchScore),
    outlierCount: outlierIds.length,
  });

  let position: MarketComparisonResult["position_in_market"] = "UNKNOWN";
  if (currentEffective !== null && lowestEffective !== null) {
    if (currentEffective === lowestEffective) position = "BEST";
    else if (diffPct !== null && diffPct >= 5) position = "COMPETITIVE";
    else if (diffPct !== null && diffPct >= -5) position = "AVERAGE";
    else position = "EXPENSIVE";
  }

  return {
    lowest_price: validRegularPrices.length ? roundMoney(Math.min(...validRegularPrices)) : null,
    lowest_pix_price: pixPrices.length ? roundMoney(Math.min(...pixPrices)) : null,
    lowest_card_price: cardPrices.length ? roundMoney(Math.min(...cardPrices)) : null,
    lowest_effective_price: lowestEffective === null ? null : roundMoney(lowestEffective),
    average_price: avg === null ? null : roundMoney(avg),
    median_price: med === null ? null : roundMoney(med),
    highest_price: highestEffective === null ? null : roundMoney(highestEffective),
    marketplace_count: validMarketplaces.size || marketplaces.size,
    offer_count: normalized.length,
    valid_offer_count: valid.length,
    outlier_count: outlierIds.length,
    market_confidence_score: marketConfidenceScore,
    outlier_offer_ids: outlierIds,
    price_difference_percent: diffPct,
    position_in_market: position,
    best_offer_id: best?.offer.id ?? null,
    comparison_confidence: confidence(valid.length, validMarketplaces.size),
  };
}
