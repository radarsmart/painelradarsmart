// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Scorer (orquestrador)
//
// PURO - roda TODOS os engines sobre um PersuasionStoryboard (seja o
// CURRENT_V2 adaptado ou o DESIRE_ENGINE_V1 proposto) e monta o
// ScoredStoryboard completo, incluindo o Commercial Persuasion Quality
// Gate. UMA unica implementacao usada para os dois lados da comparacao
// (item 27 do pedido) - garante que a comparacao e justa (mesmos
// criterios, nunca calibrados por storyboard).

import { scoreHookPersuasion } from "@/lib/commercial-video/persuasion/hook-persuasion-engine";
import { scoreScrollStop } from "@/lib/commercial-video/persuasion/scroll-stop-engine";
import { scoreProductContextRelevance } from "@/lib/commercial-video/persuasion/product-context-relevance";
import { scoreBenefitVisualization } from "@/lib/commercial-video/persuasion/benefit-visualization";
import { buildPersuasionArc } from "@/lib/commercial-video/persuasion/persuasion-arc";
import { scoreEmotionalProgression } from "@/lib/commercial-video/persuasion/emotional-progression";
import { scoreCharacterIntegration } from "@/lib/commercial-video/persuasion/character-integration";
import { scorePersuasionRedundancy } from "@/lib/commercial-video/persuasion/persuasion-redundancy";
import { assessGenericAiAdRiskV2 } from "@/lib/commercial-video/persuasion/generic-ai-ad-risk-v2";
import { computePurchaseMotivationScore } from "@/lib/commercial-video/persuasion/purchase-motivation-score";
import { computeDesireScore } from "@/lib/commercial-video/persuasion/desire-score";
import { buildCommercialPersuasionQualityGate } from "@/lib/commercial-video/persuasion/commercial-persuasion-quality-gate";
import { buildOfferRevealPlan } from "@/lib/commercial-video/persuasion/offer-reveal";
import type { PersuasionEvidence, PersuasionStoryboard, ProductDesireProfile, PurchaseMotivationAnswers, ScoredStoryboard } from "@/lib/commercial-video/persuasion/types";

export function scoreStoryboard(
  label: string,
  storyboard: PersuasionStoryboard,
  evidence: PersuasionEvidence,
  desireProfile: ProductDesireProfile,
  motivationAnswers: PurchaseMotivationAnswers,
): ScoredStoryboard {
  const scenes = storyboard.scenes;
  const hookScene = scenes.find((s) => s.purpose === "HOOK") ?? scenes[0];

  const hookPersuasion = scoreHookPersuasion({ hookScene, evidence, desireProfile });
  const scrollStop = scoreScrollStop(hookScene, evidence);
  const contextRelevance = scoreProductContextRelevance(scenes);
  const benefitVisualization = scoreBenefitVisualization(scenes);
  const arc = buildPersuasionArc(scenes);
  const emotionalProgression = scoreEmotionalProgression(scenes);
  const characterIntegration = scoreCharacterIntegration(scenes);
  const redundancy = scorePersuasionRedundancy(scenes);
  const offerReveal = buildOfferRevealPlan(evidence);
  const genericAdRisk = assessGenericAiAdRiskV2({ scenes, contextRelevance, characterIntegration, benefitVisualization, offerReveal, motivationAnswers });
  const desireScore = computeDesireScore(desireProfile, hookPersuasion, benefitVisualization);

  const purchaseMotivationScore = computePurchaseMotivationScore({
    evidence,
    motivationAnswers,
    hookPersuasion,
    contextRelevance,
    benefitVisualization,
    arc,
    emotionalProgression,
    characterIntegration,
    redundancy,
    genericAdRisk,
  });

  const characterUsedInStoryboard = scenes.some((s) => s.characterNarrativeRole !== "NONE");

  const qualityGate = buildCommercialPersuasionQualityGate({
    evidence,
    hookPersuasion,
    scrollStop,
    contextRelevance,
    benefitVisualization,
    purchaseMotivation: purchaseMotivationScore,
    emotionalProgression,
    redundancy,
    characterIntegration,
    genericAdRisk,
    desireScore,
    characterUsedInStoryboard,
    motivationAnswers,
  });

  return {
    label,
    storyboard,
    hookPersuasion,
    scrollStop,
    contextRelevance,
    benefitVisualization,
    arc,
    emotionalProgression,
    characterIntegration,
    redundancy,
    genericAdRisk,
    purchaseMotivationScore,
    desireScore,
    qualityGate,
  };
}
