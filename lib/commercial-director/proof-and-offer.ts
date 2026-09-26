// Radar Creative AI - Commercial Director / Proof & Offer Strategy
//
// REGRA CENTRAL: nunca inventar avaliacao, vendas ou depoimento. So usa
// campos que realmente existem em `offers` (rating, reviews_count).
// Nao ha coluna de "vendas"/"sales_count" na tabela hoje - por isso
// SALES_COUNT, BEFORE_AFTER e TESTIMONIAL_STYLE nunca sao selecionados
// nesta versao (documentado, nao e esquecimento).

import type {
  HookStrategy,
  OfferStrategy,
  PriceRevealTiming,
  ProofStrategy,
  SellingArgument,
  StoryStructure,
} from "@/lib/commercial-director/types";

const STRONG_RATING_THRESHOLD = 4;
const HIGH_DISCOUNT_THRESHOLD = 30;

export type ProofStrategyInput = {
  rating: number | null;
  reviewsCount: number | null;
  marketplace: string | null;
  storyStructure: StoryStructure;
};

export function selectProofStrategy(input: ProofStrategyInput): { strategy: ProofStrategy; reason: string } {
  if (input.rating !== null && input.rating >= STRONG_RATING_THRESHOLD) {
    return { strategy: "RATING", reason: `avaliacao real de ${input.rating}⭐ disponivel` };
  }

  if (input.storyStructure === "DEMONSTRATION") {
    return { strategy: "DEMONSTRATION", reason: "a propria demonstracao do produto funciona como prova" };
  }

  if (input.marketplace) {
    return { strategy: "MARKETPLACE_TRUST", reason: `confianca do marketplace real (${input.marketplace}) usada como prova` };
  }

  return { strategy: "NONE", reason: "nenhum dado real de prova disponivel - nao inventar avaliacao/vendas/depoimento" };
}

export type OfferStrategyInput = {
  price: number | null;
  originalPrice: number | null;
  discountPct: number | null;
  sellingArgument: SellingArgument;
  hookStrategy: HookStrategy;
};

function selectPriceReveal(input: OfferStrategyInput): PriceRevealTiming {
  if (input.hookStrategy === "PRICE_SHOCK" || (input.discountPct ?? 0) >= HIGH_DISCOUNT_THRESHOLD) {
    return "SHOW_PRICE_EARLY";
  }
  if (input.sellingArgument === "EMOTIONAL_BENEFIT" || input.sellingArgument === "EXCLUSIVITY") {
    return "SHOW_PRICE_LATE";
  }
  return "SHOW_PRICE_MIDDLE";
}

export function buildOfferStrategy(input: OfferStrategyInput): OfferStrategy {
  const hasRealOriginal = input.originalPrice !== null && input.price !== null && input.originalPrice > input.price;

  return {
    currentPrice: input.price,
    originalPrice: hasRealOriginal ? input.originalPrice : null,
    discountPercent: input.discountPct,
    savingsAmount: hasRealOriginal ? Number((input.originalPrice! - input.price!).toFixed(2)) : null,
    priceReveal: selectPriceReveal(input),
  };
}
