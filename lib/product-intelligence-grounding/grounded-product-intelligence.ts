// Radar Creative AI - Product Intelligence Grounding V1 - Grounded Product Intelligence
//
// PURO - orquestra identity + category grounding + claim grounding +
// contamination score num unico GroundedProductIntelligence (item 9 do
// pedido). NUNCA persistido nesta tarefa - so uma visao derivada e
// imutavel em memoria. Particiona claims em trusted/quarantined/unknown
// (item 8 - politica de quarentena, nunca apaga nada, so separa).

import { groundProductCategory } from "@/lib/product-intelligence-grounding/category-grounding";
import { groundProductIntelligenceClaims } from "@/lib/product-intelligence-grounding/claim-domain-grounding";
import { scoreProductIntelligenceContamination } from "@/lib/product-intelligence-grounding/contamination-score";
import { buildProductIdentityProfile } from "@/lib/product-intelligence-grounding/product-identity-profile";
import type { GroundedProductIntelligence, ObservedPackagingTextInput, RawOfferInput, RawProductIntelligenceInput } from "@/lib/product-intelligence-grounding/types";

function resolveGroundingQuality(score: number): GroundedProductIntelligence["groundingQuality"] {
  if (score < 20) return "HIGH";
  if (score < 60) return "MEDIUM";
  return "LOW";
}

export function buildGroundedProductIntelligence(
  offer: RawOfferInput,
  productIntelligence: RawProductIntelligenceInput,
  observedPackagingTexts: ObservedPackagingTextInput[] = [],
): GroundedProductIntelligence {
  const identity = buildProductIdentityProfile(offer, productIntelligence.category, observedPackagingTexts);
  const categoryGrounding = groundProductCategory(identity);
  const allClaims = groundProductIntelligenceClaims(productIntelligence, identity);
  const contamination = scoreProductIntelligenceContamination(categoryGrounding, allClaims);

  const trustedClaims = allClaims.filter((c) => c.groundingStatus === "SUPPORTED" || c.groundingStatus === "PLAUSIBLE");
  const quarantinedClaims = allClaims.filter((c) => c.groundingStatus === "CONTAMINATED" || c.groundingStatus === "CONTRADICTED");
  const unknownClaims = allClaims.filter((c) => c.groundingStatus === "UNSUPPORTED");

  return {
    identity,
    categoryGrounding,
    allClaims,
    trustedClaims,
    quarantinedClaims,
    unknownClaims,
    contamination,
    groundingQuality: resolveGroundingQuality(contamination.score),
  };
}
