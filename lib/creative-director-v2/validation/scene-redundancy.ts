// Radar Creative AI - Creative Director V2 / Validation / Scene Redundancy
//
// Diferente de GENERIC_AD_RISK/REPETITIVE_COMPOSITION (generic-ad-risk.ts),
// que so verifica se TODAS as cenas compartilham a mesma camera (sinal
// global), este modulo compara CADA PAR DE CENAS CONSECUTIVAS (sinal de
// adjacencia) - um storyboard pode nao ter todas as cenas identicas mas
// ainda assim ter dois cortes seguidos quase iguais, o que o check global
// nao pega. Granularidade diferente, resultado genuinamente adicional -
// nao substitui nem duplica o check existente.

import type { ProductPresentationStrategy, SceneBlueprintV2, SubjectPriority } from "@/lib/creative-director-v2/types";
import type { SceneRedundancyAnalysis, SceneRedundancyPair, SceneRedundancyRisk } from "@/lib/creative-director-v2/validation/types";

type ComparableSceneFields = {
  cameraDirection: string;
  subjectPriority: SubjectPriority;
  productPresentationStrategy: ProductPresentationStrategy | null;
  environmentDirection: string;
};

function comparableFields(blueprint: SceneBlueprintV2): ComparableSceneFields {
  return {
    cameraDirection: blueprint.cameraDirection,
    subjectPriority: blueprint.subjectPriority,
    productPresentationStrategy: blueprint.productPresentationStrategy,
    environmentDirection: blueprint.environmentDirection,
  };
}

function riskFromMatchCount(matchCount: number): SceneRedundancyRisk {
  if (matchCount >= 3) return "HIGH";
  if (matchCount === 2) return "MEDIUM";
  return "LOW";
}

export function compareScenePair(sceneA: SceneBlueprintV2, sceneB: SceneBlueprintV2): SceneRedundancyPair {
  const a = comparableFields(sceneA);
  const b = comparableFields(sceneB);

  const matchedFields = (Object.keys(a) as Array<keyof ComparableSceneFields>).filter((field) => a[field] === b[field]);

  const risk = riskFromMatchCount(matchedFields.length);
  const similarityReason =
    matchedFields.length > 0
      ? `campos iguais entre ${sceneA.sceneId} e ${sceneB.sceneId}: ${matchedFields.join(", ")}`
      : `nenhum campo relevante compartilhado entre ${sceneA.sceneId} e ${sceneB.sceneId}`;

  return { sceneA: sceneA.sceneId, sceneB: sceneB.sceneId, matchedFields, similarityReason, risk };
}

export const SCENE_REDUNDANCY_RISK_RANK: Record<SceneRedundancyRisk, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export function analyzeSceneRedundancy(sceneBlueprints: SceneBlueprintV2[]): SceneRedundancyAnalysis {
  const pairs: SceneRedundancyPair[] = [];
  for (let i = 0; i < sceneBlueprints.length - 1; i += 1) {
    pairs.push(compareScenePair(sceneBlueprints[i], sceneBlueprints[i + 1]));
  }

  const overallRisk = pairs.reduce<SceneRedundancyRisk>(
    (worst, pair) => (SCENE_REDUNDANCY_RISK_RANK[pair.risk] > SCENE_REDUNDANCY_RISK_RANK[worst] ? pair.risk : worst),
    "LOW",
  );

  return { pairs, overallRisk };
}
