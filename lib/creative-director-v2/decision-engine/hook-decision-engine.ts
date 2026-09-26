// Radar Creative AI - Creative Director V2 / Decision Engine / Hook Decision Engine
//
// Testa candidatos de HookStrategyV2 (rankHookCandidates) ate um bater o
// alvo cinematic (75/100, mesmo threshold de SHORT_FORM_CINEMATIC_COMMERCE -
// importado de la, nao duplicado) ou esgotar MAX_HOOK_ATTEMPTS. Pontua com
// evaluateHookStrength() (hook-engine.ts) SEM ALTERA-LA - so monta cenas
// candidatas diferentes pra ela avaliar.

import type { CommercialDirection, CommercialDirectorInput, CommercialScene } from "@/lib/commercial-director/types";
import { evaluateHookStrength } from "@/lib/creative-director-v2/hook-engine";
import { SHORT_FORM_CINEMATIC_COMMERCE } from "@/lib/creative-director-v2/validation/cinematic-benchmark";
import type { HookStrengthEvaluation } from "@/lib/creative-director-v2/types";
import { buildHookStagingForStrategy, HOOK_STRATEGY_V2_TO_V1, rankHookCandidates, type HookStrategyV2 } from "@/lib/creative-director-v2/decision-engine/hook-strategy-v2";

export const MAX_HOOK_ATTEMPTS = 4;
export const HOOK_STRENGTH_TARGET_V2 = SHORT_FORM_CINEMATIC_COMMERCE.minHookScore;

export type HookAttemptLog = { strategyV2: HookStrategyV2; score: number };

export type HookDecisionResult = {
  strategyV2: HookStrategyV2;
  hookScene: CommercialScene;
  evaluation: HookStrengthEvaluation;
  attempts: HookAttemptLog[];
  belowTarget: boolean;
};

function buildCandidateHookScene(strategyV2: HookStrategyV2, hasOfficialCharacter: boolean, productTitle: string): CommercialScene {
  const staging = buildHookStagingForStrategy(strategyV2, { hasOfficialCharacter, productTitle });
  return {
    id: "scene-1",
    order: 1,
    // timing e so um placeholder aqui - pacing-decision.ts define o timing
    // real depois que a estrategia vencedora ja foi escolhida.
    startSecond: 0,
    endSecond: 2,
    purpose: "HOOK",
    visualSubject: staging.characterDirection ? "Garota Radar" : `produto (${productTitle})`,
    presenter: staging.characterDirection ? "GAROTA_RADAR_FULL" : "PRODUCT_ONLY",
    productAction: staging.productAction,
    characterDirection: staging.characterDirection,
    identityReferenceAssetId: null,
    supportReferenceAssetId: null,
    camera: staging.camera,
    motion: staging.motion,
    lighting: "definida pelo Visual World (environment-decision.ts)",
    textOverlay: staging.textOverlay,
    voiceoverIntent: "gancho de abertura, sem saudacao generica",
    sfxIntent: "whoosh de entrada",
    transitionIntent: "hard cut",
  };
}

export function selectHookStrategyV2(
  input: CommercialDirectorInput,
  draftDirection: CommercialDirection,
  hasOfficialCharacter: boolean,
): HookDecisionResult {
  const candidates = rankHookCandidates(input, draftDirection.sellingArgument, hasOfficialCharacter).slice(0, MAX_HOOK_ATTEMPTS);

  const attempts: HookAttemptLog[] = [];
  let best: { strategyV2: HookStrategyV2; hookScene: CommercialScene; evaluation: HookStrengthEvaluation } | null = null;

  for (const strategyV2 of candidates) {
    const hookScene = buildCandidateHookScene(strategyV2, hasOfficialCharacter, input.productTitle);
    const evaluation = evaluateHookStrength(hookScene, { ...draftDirection, hookStrategy: HOOK_STRATEGY_V2_TO_V1[strategyV2] });
    attempts.push({ strategyV2, score: evaluation.overallScore });

    if (!best || evaluation.overallScore > best.evaluation.overallScore) {
      best = { strategyV2, hookScene, evaluation };
    }

    if (evaluation.overallScore >= HOOK_STRENGTH_TARGET_V2) {
      return { strategyV2, hookScene, evaluation, attempts, belowTarget: false };
    }
  }

  // Nenhum candidato bateu o alvo - fica com o melhor entre os testados,
  // marcado explicitamente como abaixo do alvo (nunca mascarado como PASS).
  return { strategyV2: best!.strategyV2, hookScene: best!.hookScene, evaluation: best!.evaluation, attempts, belowTarget: true };
}
