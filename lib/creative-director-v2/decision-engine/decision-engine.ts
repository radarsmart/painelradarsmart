// Radar Creative AI - Creative Director V2 / Decision Engine / Orchestrator
//
// Fase 2: faz o V2 realmente DECIDIR o storyboard (scene-plan-builder.ts) em
// vez de so rotular o de V1. Reusa assembleCommercialCreativeDirectionV2()
// (Fase 1, INTOCADA na assinatura de 2 parametros - so ganhou um 3o parametro
// OPCIONAL) pra ganhar de graca todo blueprint/gate/risco/benchmark. Loop de
// reducao de redundancia limitado (MAX_REDUNDANCY_PASSES, importado de
// redundancy-reducer.ts) - nunca infinito, nunca mascara resultado que
// continua MEDIUM/HIGH depois do limite. v1 e so referencia factual/
// comparacao - NUNCA mutado.

import type { CommercialDirection, CommercialDirectorInput } from "@/lib/commercial-director/types";
import { assembleCommercialCreativeDirectionV2 } from "@/lib/creative-director-v2/creative-director-v2";
import type { CommercialCreativeDirectionV2 } from "@/lib/creative-director-v2/types";
import type { PersuasionStrategy } from "@/lib/commercial-video/persuasion/types";
import { analyzeSceneRedundancy, SCENE_REDUNDANCY_RISK_RANK } from "@/lib/creative-director-v2/validation/scene-redundancy";
import type { SceneRedundancyRisk } from "@/lib/creative-director-v2/validation/types";

import { buildDecisionEngineScenePlan } from "@/lib/creative-director-v2/decision-engine/scene-plan-builder";
import { MAX_REDUNDANCY_PASSES, mutateSceneToReduceRedundancy } from "@/lib/creative-director-v2/decision-engine/redundancy-reducer";
import type { HookAttemptLog } from "@/lib/creative-director-v2/decision-engine/hook-decision-engine";

export type DecisionEngineOutput = {
  result: CommercialCreativeDirectionV2;
  hookStrategyV2: string;
  hookAttempts: HookAttemptLog[];
  hookBelowTarget: boolean;
  redundancyPassesApplied: number;
  redundancyRiskBeforeReduction: SceneRedundancyRisk;
  redundancyRiskAfterReduction: SceneRedundancyRisk;
};

export async function buildCreativeDirectionV2DecisionEngine(
  input: CommercialDirectorInput,
  v1: CommercialDirection,
  persuasionStrategy?: PersuasionStrategy | null,
): Promise<DecisionEngineOutput> {
  const scenePlan = buildDecisionEngineScenePlan(input, v1, persuasionStrategy);

  let direction = scenePlan.direction;
  let sceneOverrides = scenePlan.sceneOverrides;
  const productAppearanceOverride = scenePlan.productAppearanceOverride;
  let result = assembleCommercialCreativeDirectionV2(direction, input, sceneOverrides, productAppearanceOverride, persuasionStrategy);

  const redundancyBefore = analyzeSceneRedundancy(result.sceneBlueprints).overallRisk;

  let redundancyPassesApplied = 0;
  for (let pass = 1; pass <= MAX_REDUNDANCY_PASSES; pass += 1) {
    const redundancy = analyzeSceneRedundancy(result.sceneBlueprints);
    if (redundancy.overallRisk === "LOW") break;

    const worstPair = redundancy.pairs.reduce((worst, candidate) =>
      SCENE_REDUNDANCY_RISK_RANK[candidate.risk] > SCENE_REDUNDANCY_RISK_RANK[worst.risk] ? candidate : worst,
    );
    const sceneIndex = direction.scenes.findIndex((scene) => scene.id === worstPair.sceneB);
    if (sceneIndex < 0) break;

    const mutated = mutateSceneToReduceRedundancy(direction, sceneOverrides, scenePlan.visualWorld, sceneIndex, pass as 1 | 2);
    direction = mutated.direction;
    sceneOverrides = mutated.sceneOverrides;
    // productAppearanceOverride nunca muda entre passes: o reducer so muta a
    // cena mais TARDIA de um par (sceneB, indice >=1) - o HOOK (indice 0,
    // unica fonte deste override) nunca e alvo de mutacao de redundancia.
    result = assembleCommercialCreativeDirectionV2(direction, input, sceneOverrides, productAppearanceOverride, persuasionStrategy);
    redundancyPassesApplied = pass;
  }

  const redundancyAfter = analyzeSceneRedundancy(result.sceneBlueprints).overallRisk;

  return {
    result,
    hookStrategyV2: scenePlan.hookDecision.strategyV2,
    hookAttempts: scenePlan.hookDecision.attempts,
    hookBelowTarget: scenePlan.hookDecision.belowTarget,
    redundancyPassesApplied,
    redundancyRiskBeforeReduction: redundancyBefore,
    redundancyRiskAfterReduction: redundancyAfter,
  };
}
