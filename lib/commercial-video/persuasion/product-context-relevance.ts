// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Product Context Relevance
//
// PURO - PRODUCT_CONTEXT_RELEVANCE_SCORE. Achado real do CANARY: creme
// facial apresentado repetidamente em academia premium - visualmente
// bonito, mas categoria (skincare) e contexto (fitness) nao conversam.
// Nao proibe criatividade/ambiente inesperado - exige so que
// environmentJustification exista quando o ambiente nao e obviamente
// nativo da categoria (ver PersuasionSceneConcept.environmentJustification).

import type { PersuasionSceneConcept, ProductContextRelevanceResult } from "@/lib/commercial-video/persuasion/types";

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

const RELEVANCE_BASE_SCORE: Record<PersuasionSceneConcept["environmentRelevance"], number> = {
  PRODUCT_NATIVE_CONTEXT: 90,
  LIFESTYLE_ADJACENT: 65,
  GENERIC_STUDIO: 55,
  UNRELATED_ASPIRATIONAL: 20,
};

export function scoreProductContextRelevance(scenes: PersuasionSceneConcept[]): ProductContextRelevanceResult {
  const adjustedScores = scenes.map((scene) => {
    const justificationPresent = Boolean(scene.environmentJustification);
    let adjustedScore = RELEVANCE_BASE_SCORE[scene.environmentRelevance];
    // Ambiente inesperado com justificativa criativa explicita nao e
    // penalizado tao pesado - item 11 do pedido ("nao proibir
    // criatividade... mas deve existir justificativa").
    if (scene.environmentRelevance === "UNRELATED_ASPIRATIONAL" && justificationPresent) adjustedScore = 45;
    return adjustedScore;
  });

  const perScene = scenes.map((scene) => {
    const justificationPresent = Boolean(scene.environmentJustification);
    return {
      sceneId: scene.sceneId,
      relevance: scene.environmentRelevance,
      justificationPresent,
      reason:
        scene.environmentRelevance === "UNRELATED_ASPIRATIONAL" && !justificationPresent
          ? `Ambiente ("${scene.environmentDescription}") nao relacionado a categoria e sem justificativa criativa - penalizado.`
          : `Ambiente ("${scene.environmentDescription}") classificado como ${scene.environmentRelevance}.`,
    };
  });

  const categoryEnvironmentFit = scenes.length ? clamp(adjustedScores.reduce((sum, s) => sum + s, 0) / scenes.length) : 0;
  const usageContextFit = clamp(
    scenes.filter((s) => s.productInteraction !== "NONE").length / Math.max(1, scenes.length) * 100,
  );
  const consumerGoalFit = categoryEnvironmentFit;

  const score = clamp(categoryEnvironmentFit * 0.5 + usageContextFit * 0.3 + consumerGoalFit * 0.2);

  const reasons: string[] = [];
  const unrelatedCount = scenes.filter((s) => s.environmentRelevance === "UNRELATED_ASPIRATIONAL").length;
  if (unrelatedCount > 0) reasons.push(`${unrelatedCount}/${scenes.length} cena(s) com ambiente UNRELATED_ASPIRATIONAL.`);
  if (usageContextFit < 30) reasons.push("Quase nenhuma cena mostra interacao real com o produto (productInteraction != NONE).");

  return { score, perScene, categoryEnvironmentFit, usageContextFit, consumerGoalFit, reasons };
}
