// Radar Creative AI - Commercial Director / Selling Argument
//
// Escolha 100% deterministica, sem IA. So usa dados reais ja disponiveis
// (desconto, categoria, avaliacao real) - nunca inventa metrica.

import type { SellingArgument } from "@/lib/commercial-director/types";

export type SellingArgumentInput = {
  category: string;
  discountPct: number | null;
  rating: number | null;
  reviewsCount: number | null;
};

const HIGH_DISCOUNT_THRESHOLD = 30;
const STRONG_RATING_THRESHOLD = 4.5;
const MEANINGFUL_REVIEWS_THRESHOLD = 50;

// Prioridade por categoria quando nao ha sinal mais forte (desconto alto
// ou avaliacao real). Primeiro item da lista = argumento principal.
const CATEGORY_ARGUMENTS: Record<string, SellingArgument[]> = {
  casa: ["PRACTICAL_BENEFIT", "DEMONSTRATION"],
  cozinha: ["PRACTICAL_BENEFIT", "DEMONSTRATION"],
  ferramentas: ["PRACTICAL_BENEFIT", "DEMONSTRATION"],
  pet: ["PRACTICAL_BENEFIT", "EMOTIONAL_BENEFIT"],
  suplementos: ["PRACTICAL_BENEFIT", "SOCIAL_PROOF"],
  eletronicos: ["PRACTICAL_BENEFIT", "SOCIAL_PROOF"],
  perfumes: ["EMOTIONAL_BENEFIT", "EXCLUSIVITY"],
  beleza: ["EMOTIONAL_BENEFIT", "EXCLUSIVITY"],
  moda: ["EMOTIONAL_BENEFIT", "EXCLUSIVITY"],
  geral: ["CONVENIENCE", "SAVINGS"],
};

function hasStrongRealRating(rating: number | null, reviewsCount: number | null): boolean {
  return Boolean(
    (rating !== null && rating >= STRONG_RATING_THRESHOLD) ||
      (reviewsCount !== null && reviewsCount >= MEANINGFUL_REVIEWS_THRESHOLD),
  );
}

export function selectSellingArgument(
  input: SellingArgumentInput,
): { argument: SellingArgument; reason: string } {
  if ((input.discountPct ?? 0) >= HIGH_DISCOUNT_THRESHOLD) {
    return {
      argument: "DISCOUNT",
      reason: `desconto de ${input.discountPct}% e forte o suficiente para liderar o argumento de venda`,
    };
  }

  if (hasStrongRealRating(input.rating, input.reviewsCount)) {
    return {
      argument: "SOCIAL_PROOF",
      reason: `avaliacao real (${input.rating ?? "-"}⭐, ${input.reviewsCount ?? 0} avaliacoes) justifica prova social como argumento principal`,
    };
  }

  const [primary] = CATEGORY_ARGUMENTS[input.category] ?? CATEGORY_ARGUMENTS.geral;
  return {
    argument: primary,
    reason: `categoria "${input.category}" favorece o argumento "${primary}" na ausencia de um sinal mais forte`,
  };
}
