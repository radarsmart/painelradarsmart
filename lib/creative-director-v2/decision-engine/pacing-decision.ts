// Radar Creative AI - Creative Director V2 / Decision Engine / Pacing Decision
//
// Timing PROPRIO do V2 pra este plano - substitui os pesos proporcionais
// fixos de scene-planner.ts (V1) SO dentro do plano que o decision engine
// monta (V1 continua com seu proprio timing, intocado). Reusa
// estimateSpeechSeconds() (dado real medido, 14 chars/s) pra garantir que o
// CTA tenha tempo real de fala + margem, em vez de um numero fixo (3s/4s).

import type { ScenePurpose } from "@/lib/commercial-director/types";
import { estimateSpeechSeconds } from "@/lib/commercial-video/narration/narration-duration-budget";
import { BRAND_CTA_LINE } from "@/lib/ugc/brand-kit";

export const MINIMUM_NARRATION_TAIL_MARGIN_SECONDS = 0.25;

const BASE_TARGET_SECONDS: Record<ScenePurpose, number> = {
  HOOK: 2.0, // curto/agressivo - faixa 1.5-2.5s
  PROBLEM: 4.0, // DESIRE - espaco de leitura visual
  PRODUCT: 4.0, // DESIRE - espaco de leitura visual
  BENEFIT: 3.0,
  PROOF: 3.0,
  OFFER: 2.0, // curto e claro - faixa 1.5-2.5s
  CTA: 0, // calculado abaixo a partir da fala real, nao fixo
};

const HOOK_MAX_SECONDS = 2.5;
const OFFER_MAX_SECONDS = 2.5;

// Purposes que legitimamente podem absorver sobra/deficit de duracao - sao
// os momentos de "leitura visual" do pedido (item 15), nunca HOOK/OFFER/CTA
// (que tem faixas curtas/precisas por design).
const FLEXIBLE_PURPOSES: ScenePurpose[] = ["PRODUCT", "PROBLEM", "BENEFIT", "PROOF"];

function ctaFloorSeconds(): number {
  return Number((estimateSpeechSeconds(BRAND_CTA_LINE.length) + MINIMUM_NARRATION_TAIL_MARGIN_SECONDS).toFixed(2));
}

export type ScenePacingPlanEntry = { purpose: ScenePurpose; startSecond: number; endSecond: number };

export type ScenePacingPlan = {
  scenes: ScenePacingPlanEntry[];
  totalDurationSeconds: number;
};

export function decideScenePacing(purposes: ScenePurpose[], v1DurationSeconds: number): ScenePacingPlan {
  const ctaFloor = ctaFloorSeconds();

  const rawTargets = purposes.map((purpose) => (purpose === "CTA" ? ctaFloor : BASE_TARGET_SECONDS[purpose]));
  const sumRaw = rawTargets.reduce((sum, value) => sum + value, 0);
  const totalDurationSeconds = Number(Math.max(v1DurationSeconds, sumRaw).toFixed(2));

  const surplus = Number((totalDurationSeconds - sumRaw).toFixed(2));
  const flexibleIndexes = purposes.map((p, i) => (FLEXIBLE_PURPOSES.includes(p) ? i : -1)).filter((i) => i >= 0);
  const distributionTargetIndexes = flexibleIndexes.length > 0 ? flexibleIndexes : purposes.map((_, i) => i).filter((i) => purposes[i] !== "HOOK" && purposes[i] !== "CTA");
  const fallbackIndexes = distributionTargetIndexes.length > 0 ? distributionTargetIndexes : purposes.map((_, i) => i);

  const durations = [...rawTargets];
  if (surplus > 0 && fallbackIndexes.length > 0) {
    const perScene = surplus / fallbackIndexes.length;
    fallbackIndexes.forEach((index) => {
      durations[index] = Number((durations[index] + perScene).toFixed(2));
    });
  }

  // Garante HOOK/OFFER dentro da faixa curta, mesmo se algum ajuste anterior
  // (nao deveria, ja que eles nao estao em fallbackIndexes por padrao, mas
  // fica documentado como guarda defensiva).
  purposes.forEach((purpose, index) => {
    if (purpose === "HOOK") durations[index] = Math.min(durations[index], HOOK_MAX_SECONDS);
    if (purpose === "OFFER") durations[index] = Math.min(durations[index], OFFER_MAX_SECONDS);
  });

  // Ajuste de arredondamento final: a ultima cena flexivel absorve a
  // diferenca residual pra soma bater exatamente com totalDurationSeconds.
  const roundingTargetIndex = fallbackIndexes[fallbackIndexes.length - 1] ?? purposes.length - 1;
  const sumSoFar = durations.reduce((sum, value) => sum + value, 0);
  durations[roundingTargetIndex] = Number((durations[roundingTargetIndex] + (totalDurationSeconds - sumSoFar)).toFixed(2));

  let elapsed = 0;
  const scenes: ScenePacingPlanEntry[] = purposes.map((purpose, index) => {
    const startSecond = elapsed;
    const isLast = index === purposes.length - 1;
    const endSecond = isLast ? totalDurationSeconds : Number((elapsed + durations[index]).toFixed(2));
    elapsed = endSecond;
    return { purpose, startSecond, endSecond };
  });

  return { scenes, totalDurationSeconds };
}
