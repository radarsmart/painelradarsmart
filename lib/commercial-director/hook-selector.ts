// Radar Creative AI - Commercial Director / Hook Selector

import type { HookStrategy, SellingArgument } from "@/lib/commercial-director/types";

export type HookSelectionInput = {
  sellingArgument: SellingArgument;
  discountPct: number | null;
  rating: number | null;
  reviewsCount: number | null;
};

// Aberturas proibidas por padrao - guardrail documentado aqui para o
// futuro Prompt Builder consultar, mesmo este modulo nao gerando texto.
export const FORBIDDEN_DEFAULT_OPENERS = [
  "ola pessoal",
  "hoje eu vim mostrar",
  "conheca",
  "temos uma oferta para voce",
];

const HIGH_DISCOUNT_THRESHOLD = 30;

export function selectHookStrategy(
  input: HookSelectionInput,
): { hook: HookStrategy; reason: string } {
  if ((input.discountPct ?? 0) >= HIGH_DISCOUNT_THRESHOLD) {
    return { hook: "PRICE_SHOCK", reason: "desconto alto favorece um gancho de choque de preco" };
  }

  if (input.sellingArgument === "DEMONSTRATION") {
    return { hook: "DEMONSTRATION", reason: "argumento de demonstracao pede abrir mostrando o produto em acao" };
  }

  if (input.sellingArgument === "PRACTICAL_BENEFIT") {
    return { hook: "VISUAL_PROBLEM", reason: "beneficio pratico funciona melhor mostrando o problema primeiro" };
  }

  if (input.sellingArgument === "EMOTIONAL_BENEFIT" || input.sellingArgument === "EXCLUSIVITY") {
    return { hook: "CURIOSITY", reason: "apelo emocional/exclusividade funciona melhor com curiosidade" };
  }

  if (input.sellingArgument === "SOCIAL_PROOF" && (input.rating || input.reviewsCount)) {
    return { hook: "SOCIAL_PROOF", reason: "ha avaliacao real disponivel para abrir com prova social" };
  }

  return { hook: "BENEFIT_FIRST", reason: "fallback: abrir direto pelo beneficio principal" };
}
