// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Emotional Progression
//
// PURO - detecta quando TODAS as cenas tem a mesma "energia emocional"
// (arcStage identico do inicio ao fim = trajetoria emocional achatada),
// mesmo sem exigir melodrama (item 13 do pedido).

import type { EmotionalProgressionResult, PersuasionArcStage, PersuasionSceneConcept } from "@/lib/commercial-video/persuasion/types";

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

const STAGE_EMOTION_LABEL: Record<PersuasionArcStage, string> = {
  ATTENTION: "curiosidade",
  INTEREST: "interesse",
  DESIRE: "desejo",
  VALUE: "percepcao de valor",
  ACTION: "decisao/acao",
};

export function scoreEmotionalProgression(scenes: PersuasionSceneConcept[]): EmotionalProgressionResult {
  const emotionalTrajectory = scenes.map((s) => STAGE_EMOTION_LABEL[s.arcStage]);
  const distinctStages = new Set(scenes.map((s) => s.arcStage));
  const flatline = scenes.length > 1 && distinctStages.size <= 1;

  const transitions = scenes.slice(1).filter((s, i) => s.arcStage !== scenes[i].arcStage).length;
  const maxTransitions = Math.max(1, scenes.length - 1);
  const score = flatline ? 10 : clamp((transitions / maxTransitions) * 70 + (distinctStages.size / 5) * 30);

  const reasons: string[] = [];
  if (flatline) reasons.push("Todas as cenas compartilham o mesmo arcStage - trajetoria emocional achatada (flatline), mesmo com variacao visual (camera/ambiente).");
  else if (distinctStages.size < 3) reasons.push(`So ${distinctStages.size} estagio(s) emocional(is) distintos ao longo do comercial - progressao limitada.`);

  return { score, emotionalTrajectory, flatline, reasons };
}
