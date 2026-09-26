export type OfferPricingInput = {
  price?: unknown;
  old_price?: unknown;
  original_price?: unknown;
  price_old?: unknown;
  discount_pct?: unknown;
  discount_percent?: unknown;
};

export type ResolvedOfferPricing = {
  price: number;
  oldPrice: number | null;
  discountPct: number;
};

export function toOfferNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(
      value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""),
    );
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function resolveOfferPricing(input: OfferPricingInput): ResolvedOfferPricing {
  const parsedPrice = toOfferNumber(input.price);
  const price = parsedPrice !== null && parsedPrice > 0 ? parsedPrice : 0;

  const oldPriceRaw =
    toOfferNumber(input.old_price) ??
    toOfferNumber(input.original_price) ??
    toOfferNumber(input.price_old);

  const directDiscount =
    toOfferNumber(input.discount_percent) ?? toOfferNumber(input.discount_pct);
  const inferredOldPrice =
    price > 0 && directDiscount !== null && directDiscount > 0 && directDiscount < 100
      ? price / (1 - directDiscount / 100)
      : null;
  const oldPrice =
    oldPriceRaw !== null && oldPriceRaw > price && price > 0
      ? oldPriceRaw
      : inferredOldPrice !== null && inferredOldPrice > price
        ? inferredOldPrice
        : null;
  const discountPct =
    directDiscount !== null && directDiscount > 0
      ? Math.round(directDiscount)
      : oldPrice
        ? Math.round(((oldPrice - price) / oldPrice) * 100)
        : 0;

  return {
    price,
    oldPrice,
    discountPct: Math.max(0, Math.min(99, discountPct)),
  };
}

export {
  buildOfferPresentation,
  getBestCashPrice,
  getCardPrice,
  getInstallmentText,
  getPaymentSummary,
  normalizePaymentTerms,
  type NormalizedPaymentTerms,
  type OfferPresentation,
  type PriceNormalizerInput,
} from "@/lib/opportunity-engine/price-normalizer";
