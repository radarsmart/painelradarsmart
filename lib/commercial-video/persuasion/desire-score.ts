// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Desire Score
//
// PURO - DESIRE_SCORE e mais estreito que PURCHASE_MOTIVATION_SCORE (que
// inclui trust/oferta/contexto tambem): mede especificamente se o
// storyboard constroi DESEJO real (beneficio+demonstracao+hook com
// desejo), independente de o consumidor confiar/ter friccao reduzida.

import type { BenefitVisualizationScore, HookPersuasionResult, ProductDesireProfile } from "@/lib/commercial-video/persuasion/types";

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function confidenceScore(confidence: "LOW" | "MEDIUM" | "HIGH"): number {
  return confidence === "HIGH" ? 90 : confidence === "MEDIUM" ? 60 : 25;
}

export function computeDesireScore(desireProfile: ProductDesireProfile, hookPersuasion: HookPersuasionResult, benefitVisualization: BenefitVisualizationScore): number {
  const primaryDesireScore = confidenceScore(desireProfile.primaryDesire.confidence);
  const hookDesireSignal = hookPersuasion.signals.benefitOrDesirePresent ? 80 : 30;
  return clamp(primaryDesireScore * 0.35 + hookDesireSignal * 0.25 + benefitVisualization.score * 0.4);
}
