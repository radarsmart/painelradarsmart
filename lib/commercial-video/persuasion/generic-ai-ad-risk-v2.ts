// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Generic AI Ad Risk V2
//
// PURO - expande o GenericAdRisk existente (lib/creative-director-v2/
// generic-ad-risk.ts, focado em producao/pacing) com riscos
// especificamente PERSUASIVOS observados no CANARY real (item 17 do
// pedido). Cada razao so e adicionada com evidencia mecanica (nunca por
// "achar que parece generico").

import type {
  BenefitVisualizationScore,
  CharacterIntegrationResult,
  GenericAiAdRiskV2Reason,
  GenericAiAdRiskV2Result,
  OfferRevealPlan,
  PersuasionSceneConcept,
  ProductContextRelevanceResult,
  PurchaseMotivationAnswers,
} from "@/lib/commercial-video/persuasion/types";

const ALL_REASONS: GenericAiAdRiskV2Reason[] = [
  "FLOATING_PRODUCT_SYNDROME",
  "UNRELATED_LUXURY_ENVIRONMENT",
  "GENERIC_PEDESTAL_REVEAL",
  "EXCESSIVE_PACKSHOT",
  "NO_PRODUCT_USE",
  "NO_HUMAN_CONTEXT",
  "NO_DEMONSTRATION",
  "REPEATED_PRODUCT_ROTATION",
  "BEAUTIFUL_BUT_EMPTY",
  "DISCONNECTED_PRESENTER",
  "GENERIC_CTA",
  "BENEFIT_NOT_VISUALIZED",
  "NO_PURCHASE_REASON",
  "NO_PRICE_STRATEGY",
  "AI_STOCK_AD_FEEL",
];

export type AssessGenericAiAdRiskV2Input = {
  scenes: PersuasionSceneConcept[];
  contextRelevance: ProductContextRelevanceResult;
  characterIntegration: CharacterIntegrationResult;
  benefitVisualization: BenefitVisualizationScore;
  offerReveal: OfferRevealPlan;
  motivationAnswers: PurchaseMotivationAnswers;
};

export function assessGenericAiAdRiskV2(input: AssessGenericAiAdRiskV2Input): GenericAiAdRiskV2Result {
  const { scenes, contextRelevance, characterIntegration, benefitVisualization, offerReveal, motivationAnswers } = input;
  const affectedScenes = ALL_REASONS.reduce<Record<GenericAiAdRiskV2Reason, string[]>>((acc, reason) => {
    acc[reason] = [];
    return acc;
  }, {} as Record<GenericAiAdRiskV2Reason, string[]>);
  const reasons: GenericAiAdRiskV2Reason[] = [];

  const floatingScenes = scenes.filter((s) => s.productVisualRole === "FLOATING_HERO" && s.characterNarrativeRole === "NONE");
  if (floatingScenes.length >= 2) {
    reasons.push("FLOATING_PRODUCT_SYNDROME");
    affectedScenes.FLOATING_PRODUCT_SYNDROME = floatingScenes.map((s) => s.sceneId);
  }

  const unrelatedScenes = contextRelevance.perScene.filter((s) => s.relevance === "UNRELATED_ASPIRATIONAL" && !s.justificationPresent);
  if (unrelatedScenes.length > 0) {
    reasons.push("UNRELATED_LUXURY_ENVIRONMENT");
    affectedScenes.UNRELATED_LUXURY_ENVIRONMENT = unrelatedScenes.map((s) => s.sceneId);
  }

  const pedestalRevealScenes = scenes.filter((s) => s.purpose === "HOOK" && s.productVisualRole === "FLOATING_HERO" && s.benefitClaimId === null);
  if (pedestalRevealScenes.length > 0) {
    reasons.push("GENERIC_PEDESTAL_REVEAL");
    affectedScenes.GENERIC_PEDESTAL_REVEAL = pedestalRevealScenes.map((s) => s.sceneId);
  }

  if (benefitVisualization.packshotRatio > 0.6) {
    reasons.push("EXCESSIVE_PACKSHOT");
    affectedScenes.EXCESSIVE_PACKSHOT = scenes.filter((s) => s.productVisualRole === "PACKSHOT" || s.productVisualRole === "FLOATING_HERO").map((s) => s.sceneId);
  }

  const noUseScenes = scenes.filter((s) => s.productInteraction === "NONE");
  if (noUseScenes.length === scenes.length) {
    reasons.push("NO_PRODUCT_USE");
    affectedScenes.NO_PRODUCT_USE = noUseScenes.map((s) => s.sceneId);
  }

  if (scenes.every((s) => s.characterNarrativeRole === "NONE")) {
    reasons.push("NO_HUMAN_CONTEXT");
  }

  if (benefitVisualization.demonstrationRatio === 0) {
    reasons.push("NO_DEMONSTRATION");
  }

  const rotationScenes = scenes.filter((s) => s.productVisualRole === "FLOATING_HERO" || s.productVisualRole === "PACKSHOT");
  if (rotationScenes.length >= 3) {
    reasons.push("REPEATED_PRODUCT_ROTATION");
    affectedScenes.REPEATED_PRODUCT_ROTATION = rotationScenes.map((s) => s.sceneId);
  }

  if (benefitVisualization.score < 40 && contextRelevance.score >= 60) {
    // Bonito (contexto/producao ok) mas vazio de beneficio - a combinacao
    // exata observada no CANARY real.
    reasons.push("BEAUTIFUL_BUT_EMPTY");
  }

  if (characterIntegration.disconnected) {
    reasons.push("DISCONNECTED_PRESENTER");
    affectedScenes.DISCONNECTED_PRESENTER = characterIntegration.appearsInScenes;
  }

  const ctaScene = scenes.find((s) => s.ctaRole === "PRIMARY");
  if (ctaScene && ctaScene.benefitClaimId === null && offerReveal.visualHierarchy.length === 0) {
    reasons.push("GENERIC_CTA");
    affectedScenes.GENERIC_CTA = [ctaScene.sceneId];
  }

  if (benefitVisualization.score < 40) {
    reasons.push("BENEFIT_NOT_VISUALIZED");
  }

  if (motivationAnswers.whyBuyThisProduct.confidence === "LOW") {
    reasons.push("NO_PURCHASE_REASON");
  }

  if (!offerReveal.discountAllowed && offerReveal.priceAnchor === "NONE_AVAILABLE" && scenes.every((s) => s.offerRole === "NONE")) {
    reasons.push("NO_PRICE_STRATEGY");
  }

  if (reasons.includes("FLOATING_PRODUCT_SYNDROME") && reasons.includes("NO_HUMAN_CONTEXT") && reasons.includes("NO_DEMONSTRATION")) {
    reasons.push("AI_STOCK_AD_FEEL");
  }

  const riskLevel: GenericAiAdRiskV2Result["riskLevel"] = reasons.length >= 5 ? "HIGH" : reasons.length >= 2 ? "MEDIUM" : "LOW";

  return { riskLevel, reasons, affectedScenes };
}
