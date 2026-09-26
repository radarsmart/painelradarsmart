// Radar Creative AI - Commercial Generation Runner V1 / State Machine
//
// PURO - so define transicoes validas e monta o registro de transicao.
// Nenhuma logica de negocio aqui (isso fica no runner principal).

import type { RunnerJobStatus, RunnerStateTransition } from "@/lib/commercial-video/runner/types";

// BLOCKED e FAILED sao alcancaveis de qualquer estado intermediario (uma
// falha/bloqueio pode acontecer a qualquer momento do pipeline) - nunca
// terminal->terminal (COMPLETED/FAILED/BLOCKED nao tem saida).
export const RUNNER_STATE_TRANSITIONS: Record<RunnerJobStatus, RunnerJobStatus[]> = {
  CREATED: ["PREPARING"],
  PREPARING: ["GENERATING_SCENES", "BLOCKED", "FAILED"],
  GENERATING_SCENES: ["RESOLVING_ASSETS", "BLOCKED", "FAILED"],
  RESOLVING_ASSETS: ["BUILDING_NARRATION", "BLOCKED", "FAILED"],
  BUILDING_NARRATION: ["GENERATING_NARRATION", "BLOCKED", "FAILED"],
  GENERATING_NARRATION: ["COMPOSING_VIDEO", "BLOCKED", "FAILED"],
  COMPOSING_VIDEO: ["MIXING_AUDIO", "BLOCKED", "FAILED"],
  MIXING_AUDIO: ["FINALIZING", "BLOCKED", "FAILED"],
  FINALIZING: ["COMPLETED", "BLOCKED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  BLOCKED: [],
};

export function isValidTransition(from: RunnerJobStatus, to: RunnerJobStatus): boolean {
  return RUNNER_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertValidTransition(from: RunnerJobStatus, to: RunnerJobStatus): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`Transicao de estado invalida: ${from} -> ${to}.`);
  }
}

export function buildTransition(from: RunnerJobStatus, to: RunnerJobStatus, note: string | null = null): RunnerStateTransition {
  assertValidTransition(from, to);
  return { from, to, at: new Date().toISOString(), note };
}
