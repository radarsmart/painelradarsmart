// Radar Creative AI - Creative Director V2 / Decision Engine / Character Performance Decision
//
// Decide COMO a apresentadora se comporta por cena (nao so QUE ela aparece -
// isso continua vindo de PresenterStrategy/V1). So se aplica a cenas != HOOK
// (o HOOK ja tem sua propria direcao de personagem decidida por
// hook-strategy-v2.ts, especifica de cada HookStrategyV2). Intencao
// criativa, documentado - sem garantia de execucao pelo provider (mesmo
// principio de cta-director.ts). Mapeada pros 3 campos que
// CommercialScene.characterDirection ja aceita (expression/pose/shot) - sem
// precisar de tipo novo em V1.

import type { CharacterExpression, CharacterPose, CharacterShot } from "@/lib/brand-character/character-types";
import type { ScenePurpose } from "@/lib/commercial-director/types";

export type EyeDirection = "LOOK_CAMERA" | "LOOK_PRODUCT" | "LOOK_CTA";
export type GestureIntent = "OPEN_HAND" | "POINT_DOWN" | "POINT_SIDE" | "PRESENT_PRODUCT" | "SUBTLE_NOD" | "NONE";
export type PerformanceEnergy = "SUBTLE" | "CONFIDENT" | "ENTHUSIASTIC";
export type InteractionTarget = "PRODUCT" | "CTA" | "AUDIENCE" | "NONE";

export type CharacterPerformanceDirectionV2 = {
  eyeDirection: EyeDirection;
  gestureIntent: GestureIntent;
  facialEnergy: PerformanceEnergy;
  bodyEnergy: PerformanceEnergy;
  interactionTarget: InteractionTarget;
  performancePurpose: string;
};

const PERFORMANCE_BY_PURPOSE: Record<ScenePurpose, CharacterPerformanceDirectionV2> = {
  HOOK: {
    eyeDirection: "LOOK_CAMERA",
    gestureIntent: "OPEN_HAND",
    facialEnergy: "ENTHUSIASTIC",
    bodyEnergy: "ENTHUSIASTIC",
    interactionTarget: "AUDIENCE",
    performancePurpose: "prender atencao logo de cara",
  },
  PROBLEM: {
    eyeDirection: "LOOK_CAMERA",
    gestureIntent: "SUBTLE_NOD",
    facialEnergy: "SUBTLE",
    bodyEnergy: "SUBTLE",
    interactionTarget: "AUDIENCE",
    performancePurpose: "criar empatia com a dor/situacao do publico",
  },
  PRODUCT: {
    eyeDirection: "LOOK_PRODUCT",
    gestureIntent: "PRESENT_PRODUCT",
    facialEnergy: "CONFIDENT",
    bodyEnergy: "CONFIDENT",
    interactionTarget: "PRODUCT",
    performancePurpose: "demonstrar o produto com confianca",
  },
  BENEFIT: {
    eyeDirection: "LOOK_PRODUCT",
    gestureIntent: "PRESENT_PRODUCT",
    facialEnergy: "CONFIDENT",
    bodyEnergy: "CONFIDENT",
    interactionTarget: "PRODUCT",
    performancePurpose: "reforcar o beneficio com o produto em maos",
  },
  PROOF: {
    eyeDirection: "LOOK_CAMERA",
    gestureIntent: "SUBTLE_NOD",
    facialEnergy: "CONFIDENT",
    bodyEnergy: "SUBTLE",
    interactionTarget: "AUDIENCE",
    performancePurpose: "reforcar credibilidade com a prova real disponivel",
  },
  OFFER: {
    eyeDirection: "LOOK_PRODUCT",
    gestureIntent: "POINT_DOWN",
    facialEnergy: "ENTHUSIASTIC",
    bodyEnergy: "CONFIDENT",
    interactionTarget: "PRODUCT",
    performancePurpose: "revelar a oferta com energia",
  },
  CTA: {
    eyeDirection: "LOOK_CTA",
    gestureIntent: "POINT_SIDE",
    facialEnergy: "CONFIDENT",
    bodyEnergy: "CONFIDENT",
    interactionTarget: "CTA",
    performancePurpose: "convidar o publico para a acao",
  },
};

export function decideCharacterPerformance(purpose: ScenePurpose): CharacterPerformanceDirectionV2 {
  return PERFORMANCE_BY_PURPOSE[purpose];
}

const EXPRESSION_BY_ENERGY: Record<PerformanceEnergy, CharacterExpression> = {
  SUBTLE: "THOUGHTFUL",
  CONFIDENT: "CONFIDENT",
  ENTHUSIASTIC: "EXCITED",
};

const POSE_BY_GESTURE: Record<GestureIntent, CharacterPose> = {
  OPEN_HAND: "INVITING",
  POINT_DOWN: "POINTING_DOWN",
  POINT_SIDE: "POINTING",
  PRESENT_PRODUCT: "PRESENTING",
  SUBTLE_NOD: "NEUTRAL",
  NONE: "NEUTRAL",
};

export function toCharacterDirectionFields(performance: CharacterPerformanceDirectionV2): {
  expression: CharacterExpression;
  pose: CharacterPose;
  shot: CharacterShot;
} {
  return {
    expression: EXPRESSION_BY_ENERGY[performance.facialEnergy],
    pose: POSE_BY_GESTURE[performance.gestureIntent],
    shot: "HALF_BODY",
  };
}
