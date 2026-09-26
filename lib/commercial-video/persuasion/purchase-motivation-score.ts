// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Purchase Motivation Score
//
// PURO - agrega os scores individuais num PURCHASE_MOTIVATION_SCORE unico
// (item 19 do pedido). Pesos documentados aqui como constantes nomeadas -
// NUNCA ajustados depois de ver o resultado do Kokeshi so para faze-lo
// passar (ver DEFAULT_PURCHASE_MOTIVATION_WEIGHTS, escolhidos ANTES de
// rodar o DRY_RUN real desta tarefa contra a campanha).

import type {
  BenefitVisualizationScore,
  CharacterIntegrationResult,
  EmotionalProgressionResult,
  GenericAiAdRiskV2Result,
  HookPersuasionResult,
  PersuasionArcResult,
  PersuasionEvidence,
  PersuasionRedundancyResult,
  ProductContextRelevanceResult,
  PurchaseMotivationAnswers,
  PurchaseMotivationScoreResult,
} from "@/lib/commercial-video/persuasion/types";

export const PURCHASE_MOTIVATION_WEIGHTS = {
  desireClarity: 0.15,
  benefitStrength: 0.15,
  evidenceStrength: 0.1,
  offerStrength: 0.1,
  emotionalProgression: 0.1,
  demonstrationStrength: 0.15,
  contextRelevance: 0.15,
  trust: 0.05,
  ctaContinuity: 0.05,
} as const;

export const PURCHASE_MOTIVATION_PENALTY_WEIGHTS = {
  unsupportedClaims: 20,
  genericAdRisk: 20,
  persuasionRedundancy: 15,
  irrelevantEnvironment: 15,
  weakHook: 15,
} as const;

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function claimConfidenceToScore(confidence: "LOW" | "MEDIUM" | "HIGH"): number {
  return confidence === "HIGH" ? 90 : confidence === "MEDIUM" ? 60 : 25;
}

export type ComputePurchaseMotivationScoreInput = {
  evidence: PersuasionEvidence;
  motivationAnswers: PurchaseMotivationAnswers;
  hookPersuasion: HookPersuasionResult;
  contextRelevance: ProductContextRelevanceResult;
  benefitVisualization: BenefitVisualizationScore;
  arc: PersuasionArcResult;
  emotionalProgression: EmotionalProgressionResult;
  characterIntegration: CharacterIntegrationResult;
  redundancy: PersuasionRedundancyResult;
  genericAdRisk: GenericAiAdRiskV2Result;
};

export function computePurchaseMotivationScore(input: ComputePurchaseMotivationScoreInput): PurchaseMotivationScoreResult {
  const desireClarity = claimConfidenceToScore(input.motivationAnswers.whyBuyThisProduct.confidence);
  const benefitStrength = input.benefitVisualization.score;
  const evidenceStrength = clamp((input.evidence.packagingClaims.length + input.evidence.factualClaims.length) * 15);
  const offerStrength = claimConfidenceToScore(input.motivationAnswers.whyBuyAtThisPrice.confidence);
  const emotionalProgression = input.emotionalProgression.score;
  const demonstrationStrength = clamp(input.benefitVisualization.demonstrationRatio * 100);
  const contextRelevance = input.contextRelevance.score;
  const trust = input.characterIntegration.disconnected ? 30 : clamp((input.evidence.rating !== null ? 60 : 40) + (input.characterIntegration.score >= 60 ? 20 : 0));
  const ctaContinuity = input.arc.scenes.at(-1)?.purchaseIntentContribution ?? 40;

  const weightedBase =
    desireClarity * PURCHASE_MOTIVATION_WEIGHTS.desireClarity +
    benefitStrength * PURCHASE_MOTIVATION_WEIGHTS.benefitStrength +
    evidenceStrength * PURCHASE_MOTIVATION_WEIGHTS.evidenceStrength +
    offerStrength * PURCHASE_MOTIVATION_WEIGHTS.offerStrength +
    emotionalProgression * PURCHASE_MOTIVATION_WEIGHTS.emotionalProgression +
    demonstrationStrength * PURCHASE_MOTIVATION_WEIGHTS.demonstrationStrength +
    contextRelevance * PURCHASE_MOTIVATION_WEIGHTS.contextRelevance +
    trust * PURCHASE_MOTIVATION_WEIGHTS.trust +
    ctaContinuity * PURCHASE_MOTIVATION_WEIGHTS.ctaContinuity;

  const unsupportedClaimsPenalty = input.evidence.forbiddenClaims.length > 0 ? PURCHASE_MOTIVATION_PENALTY_WEIGHTS.unsupportedClaims : 0;
  const genericAdRiskPenalty =
    input.genericAdRisk.riskLevel === "HIGH" ? PURCHASE_MOTIVATION_PENALTY_WEIGHTS.genericAdRisk : input.genericAdRisk.riskLevel === "MEDIUM" ? PURCHASE_MOTIVATION_PENALTY_WEIGHTS.genericAdRisk / 2 : 0;
  const persuasionRedundancyPenalty = input.redundancy.redundantPairs.length > 0 ? PURCHASE_MOTIVATION_PENALTY_WEIGHTS.persuasionRedundancy : 0;
  const irrelevantEnvironmentPenalty = input.contextRelevance.score < 50 ? PURCHASE_MOTIVATION_PENALTY_WEIGHTS.irrelevantEnvironment : 0;
  const weakHookPenalty = input.hookPersuasion.score < 50 ? PURCHASE_MOTIVATION_PENALTY_WEIGHTS.weakHook : 0;

  const score = clamp(weightedBase - unsupportedClaimsPenalty - genericAdRiskPenalty - persuasionRedundancyPenalty - irrelevantEnvironmentPenalty - weakHookPenalty);

  const reasons: string[] = [];
  if (unsupportedClaimsPenalty > 0) reasons.push(`${input.evidence.forbiddenClaims.length} claim(s) FORBIDDEN detectada(s) - penalidade aplicada.`);
  if (genericAdRiskPenalty > 0) reasons.push(`GenericAiAdRiskV2=${input.genericAdRisk.riskLevel} - penalidade aplicada.`);
  if (persuasionRedundancyPenalty > 0) reasons.push(`${input.redundancy.redundantPairs.length} par(es) redundante(s) - penalidade aplicada.`);
  if (irrelevantEnvironmentPenalty > 0) reasons.push("ContextRelevance < 50 - penalidade aplicada.");
  if (weakHookPenalty > 0) reasons.push("HookPersuasion < 50 - penalidade aplicada.");

  return {
    score,
    components: { desireClarity, benefitStrength, evidenceStrength, offerStrength, emotionalProgression, demonstrationStrength, contextRelevance, trust, ctaContinuity },
    penalties: {
      unsupportedClaims: unsupportedClaimsPenalty,
      genericAdRisk: genericAdRiskPenalty,
      persuasionRedundancy: persuasionRedundancyPenalty,
      irrelevantEnvironment: irrelevantEnvironmentPenalty,
      weakHook: weakHookPenalty,
    },
    reasons,
  };
}
