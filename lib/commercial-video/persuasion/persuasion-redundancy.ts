// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Persuasion Redundancy
//
// PURO - DIFERENTE de SceneRedundancy (lib/creative-director-v2/validation/
// scene-redundancy.ts, que compara camera/motion/environment). Duas cenas
// com ambientes/camera diferentes mas que comunicam a MESMA coisa
// ("produto bonito flutuando") sao redundantes aqui mesmo com
// SceneRedundancy=LOW no gate tecnico (item 18 do pedido - "creative
// diversity nao e persuasion diversity").

import type { PersuasionRedundancyResult, PersuasionSceneConcept } from "@/lib/commercial-video/persuasion/types";

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isRedundantPair(a: PersuasionSceneConcept, b: PersuasionSceneConcept): boolean {
  const sameVisualRole = a.productVisualRole === b.productVisualRole;
  const bothPackshotLike = a.productVisualRole === "PACKSHOT" || a.productVisualRole === "FLOATING_HERO";
  const sameArcStage = a.arcStage === b.arcStage;
  const noDistinctBenefit = a.benefitClaimId === null && b.benefitClaimId === null;
  return sameVisualRole && bothPackshotLike && sameArcStage && noDistinctBenefit;
}

export function scorePersuasionRedundancy(scenes: PersuasionSceneConcept[]): PersuasionRedundancyResult {
  const redundantPairs: PersuasionRedundancyResult["redundantPairs"] = [];

  for (let i = 0; i < scenes.length; i += 1) {
    for (let j = i + 1; j < scenes.length; j += 1) {
      if (isRedundantPair(scenes[i], scenes[j])) {
        redundantPairs.push({
          sceneA: scenes[i].sceneId,
          sceneB: scenes[j].sceneId,
          reason: `Ambas ${scenes[i].productVisualRole}, mesmo arcStage (${scenes[i].arcStage}), sem beneficio distinto - mesma mensagem persuasiva ("produto bonito, sem contexto") mesmo com ambiente/camera potencialmente diferentes.`,
        });
      }
    }
  }

  const maxPairs = Math.max(1, (scenes.length * (scenes.length - 1)) / 2);
  const score = clamp(100 - (redundantPairs.length / maxPairs) * 100);

  const reasons = redundantPairs.length > 0 ? [`${redundantPairs.length} par(es) de cenas persuasivamente redundantes detectado(s).`] : ["Nenhuma redundancia persuasiva detectada."];

  return { score, redundantPairs, reasons };
}
