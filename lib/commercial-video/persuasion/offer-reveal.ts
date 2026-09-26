// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Offer Reveal
//
// PURO - decide COMO revelar preco/oferta. Regra dura (item 15 do pedido,
// mesma ja validada em overlay-plan.ts): discountPercent=0/null NUNCA gera
// discountAllowed=true nem "0% OFF". Sem originalPrice real, priceAnchor
// fica NONE_AVAILABLE - nunca inventa "de X por Y".

import type { OfferRevealPlan, PersuasionEvidence } from "@/lib/commercial-video/persuasion/types";

export function buildOfferRevealPlan(evidence: PersuasionEvidence): OfferRevealPlan {
  const hasRealDiscount = Boolean(evidence.discountPercent && evidence.discountPercent > 0);
  const hasRealAnchor = evidence.originalPrice !== null && evidence.price !== null && evidence.originalPrice > evidence.price;

  const cheapEnoughForEarlyReveal = evidence.price !== null && evidence.price < 30;

  return {
    // Preco pode ser o proprio elemento de surpresa/curiosidade quando e
    // real e baixo (ver hook-persuasion-engine.ts#generateHookConcepts) -
    // nesse caso revelar CEDO (no proprio hook) e uma estrategia valida,
    // nao so "revelar tarde por convencao".
    revealTiming: cheapEnoughForEarlyReveal ? "EARLY" : "LATE",
    setupBeforePrice: !cheapEnoughForEarlyReveal,
    priceAnchor: hasRealAnchor ? "REAL_ORIGINAL_PRICE" : "NONE_AVAILABLE",
    discountAllowed: hasRealDiscount,
    urgencyAllowed: false, // nenhum sinal real de estoque/prazo existe no schema atual - nunca permitir urgencia
    valueMessage: hasRealDiscount
      ? `Desconto real de ${evidence.discountPercent}%.`
      : `Preco baixo em si (R$ ${evidence.price?.toFixed(2).replace(".", ",") ?? "?"}) e o argumento - sem desconto real a comunicar.`,
    visualHierarchy: hasRealDiscount ? ["discountText", "priceText"] : ["priceText"],
  };
}
