// Radar Creative AI - Commercial Generation Runner V1 / Job Progress
//
// PURO - mapeamento deterministico e centralizado de RunnerJobStatus para
// uma porcentagem. BLOCKED/FAILED NUNCA recebem uma porcentagem propria -
// eles preservam o progresso do ULTIMO estagio realmente alcancado (nunca
// fingem 100%, ver item 3 do enunciado).

import type { RunnerJobStatus } from "@/lib/commercial-video/runner/types";

export const JOB_STAGE_PROGRESS: Record<
  Exclude<RunnerJobStatus, "BLOCKED" | "FAILED">,
  number
> = {
  CREATED: 0,
  PREPARING: 5,
  GENERATING_SCENES: 20,
  RESOLVING_ASSETS: 45,
  BUILDING_NARRATION: 55,
  GENERATING_NARRATION: 65,
  COMPOSING_VIDEO: 75,
  MIXING_AUDIO: 85,
  FINALIZING: 95,
  COMPLETED: 100,
};

export function computeProgressForStatus(status: RunnerJobStatus, lastKnownProgress: number): number {
  if (status === "BLOCKED" || status === "FAILED") {
    return lastKnownProgress;
  }
  return JOB_STAGE_PROGRESS[status];
}
