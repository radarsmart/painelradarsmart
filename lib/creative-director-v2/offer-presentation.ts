// Radar Creative AI - Creative Director V2 / Offer Presentation
//
// So reembala OfferStrategy/CtaStrategy (ja construidos por
// lib/commercial-director/proof-and-offer.ts e cta-strategy.ts) em hierarquia
// visual. NUNCA inventa desconto/urgencia/estoque/frete/rating/reviews -
// deriva estritamente de campos que ja sao reais ou null.

import type { CtaStrategy, OfferStrategy } from "@/lib/commercial-director/types";
import type { OfferPresentationV2, OfferPriority } from "@/lib/creative-director-v2/types";

// Mesma regra ja usada em lib/commercial-video/narration/narration-copy-templates.ts
// (hasRealDiscount) - replicada aqui, documentado, sem duplicar import
// cruzado de uma camada de narracao pra uma de planejamento criativo.
function hasRealDiscount(discountPercent: number | null): boolean {
  return discountPercent !== null && discountPercent > 0;
}

export function buildOfferPresentationV2(offerStrategy: OfferStrategy, ctaStrategy: CtaStrategy): OfferPresentationV2 {
  let pricePriority: OfferPriority = "NONE";
  if (offerStrategy.currentPrice !== null) {
    pricePriority = offerStrategy.priceReveal === "SHOW_PRICE_EARLY" ? "HIGH" : offerStrategy.priceReveal === "HIDE_PRICE" ? "LOW" : "MEDIUM";
  }

  const discountPriority: OfferPriority = hasRealDiscount(offerStrategy.discountPercent) ? "HIGH" : "NONE";
  const urgencyAllowed = ctaStrategy.ctaUrgency !== "LOW";
  const comparisonAllowed = offerStrategy.originalPrice !== null;

  return {
    pricePriority,
    discountPriority,
    urgencyAllowed,
    comparisonAllowed,
    ctaPriority: "HIGH",
  };
}
