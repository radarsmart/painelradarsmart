// Radar Creative AI - Commercial Generation Runner / EXECUTE Guards
//
// PURO - decide se um EXECUTE pode sequer COMECAR a avaliar cenas. Nao e
// sobre custo (isso e runner-cost-guard.ts) - e sobre autorizacao e
// configuracao minima obrigatoria. DRY_RUN nunca passa por aqui de
// verdade (sempre "OK", ver checkExecutionGuards abaixo) - estas duas
// checagens so existem para mode==="EXECUTE".

import type { ExecutionGuardResult, RunnerMode } from "@/lib/commercial-video/runner/types";

export type ExecutionGuardInput = {
  mode: RunnerMode;
  confirmed?: boolean;
  maxVideoCredits: number | null;
  maxTtsCredits: number | null;
};

export function checkExecutionGuards(input: ExecutionGuardInput): ExecutionGuardResult {
  if (input.mode !== "EXECUTE") {
    return { status: "OK", reason: null };
  }

  if (input.confirmed !== true) {
    return {
      status: "BLOCKED_EXECUTION_NOT_CONFIRMED",
      reason: 'EXECUTE exige confirmed=true explicito - nenhuma chamada paga foi feita.',
    };
  }

  if (input.maxVideoCredits === null || input.maxTtsCredits === null) {
    return {
      status: "BLOCKED_NO_LIMIT_CONFIGURED",
      reason:
        "EXECUTE exige maxVideoCredits e maxTtsCredits configurados explicitamente - nunca um valor default silencioso.",
    };
  }

  return { status: "OK", reason: null };
}
