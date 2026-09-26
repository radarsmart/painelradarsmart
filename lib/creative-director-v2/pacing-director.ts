// Radar Creative AI - Creative Director V2 / Pacing Director
//
// Ritmo especifico para short-form, derivado dos DADOS REAIS da campanha
// (durationSeconds/sceneCount de V1) - nunca hardcoda 3s/4s fixos. Tambem
// planeja a INTENCAO de transicao entre cenas (estruturada, enum fechado) -
// nao implementa nada no FFmpeg, so produz a intencao.

import type { CommercialDirection, CommercialPace, ScenePurpose } from "@/lib/commercial-director/types";
import type { MotionIntensityLevel, PacingDirectionV2, PacingStyleV2, TransitionIntentV2 } from "@/lib/creative-director-v2/types";

const PACE_TO_STYLE: Record<CommercialPace, PacingStyleV2> = {
  FAST: "FAST",
  MEDIUM: "BALANCED",
  CINEMATIC: "PREMIUM_SLOW",
};

const MOTION_BY_STYLE: Record<PacingStyleV2, MotionIntensityLevel> = {
  FAST: "HIGH",
  BALANCED: "MEDIUM",
  PREMIUM_SLOW: "LOW",
};

export function buildPacingDirection(direction: CommercialDirection): PacingDirectionV2 {
  const style = PACE_TO_STYLE[direction.pace];
  const averageSceneDurationSeconds = Number((direction.durationSeconds / direction.sceneCount).toFixed(1));
  const cuts = Math.max(0, direction.sceneCount - 1);
  const cutsPerMinute = Number(((cuts / direction.durationSeconds) * 60).toFixed(1));
  const informationDensity = direction.sceneCount >= 5 ? "HIGH" : direction.sceneCount >= 3 ? "MEDIUM" : "LOW";

  return {
    style,
    averageSceneDurationSeconds,
    cutsPerMinute,
    motionIntensity: MOTION_BY_STYLE[style],
    informationDensity,
    reason: `pace "${direction.pace}" (V1) -> pacing "${style}"; ${direction.sceneCount} cenas em ${direction.durationSeconds}s (media ${averageSceneDurationSeconds}s/cena)`,
  };
}

const BASE_TRANSITION_BY_PURPOSE: Record<ScenePurpose, TransitionIntentV2> = {
  HOOK: "WHIP",
  PROBLEM: "CUT",
  PRODUCT: "MATCH_CUT",
  BENEFIT: "ZOOM",
  PROOF: "CUT",
  OFFER: "FLASH",
  CTA: "CROSSFADE",
};

export function selectTransitionIntent(purpose: ScenePurpose, pacing: PacingStyleV2): TransitionIntentV2 {
  const base = BASE_TRANSITION_BY_PURPOSE[purpose];

  if (pacing === "PREMIUM_SLOW") {
    // ritmo lento evita cortes agressivos - substitui transicoes bruscas por algo suave.
    if (base === "WHIP" || base === "FLASH") return "CROSSFADE";
    return base;
  }

  if (pacing === "FAST" && base === "CROSSFADE") {
    // ritmo rapido evita transicao lenta demais no fechamento.
    return "CUT";
  }

  return base;
}
