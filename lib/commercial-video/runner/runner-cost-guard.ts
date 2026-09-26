// Radar Creative AI - Commercial Generation Runner V1 / Cost Guard
//
// PURO - decide se um custo JA CALCULADO (nunca recalculado aqui) pode
// prosseguir. Custo desconhecido NUNCA vira zero - exige reconhecimento
// explicito (mesmo padrao ja usado em canary-guardrails.ts#acknowledgeUnknownCost).

import type { CostGuardResult } from "@/lib/commercial-video/runner/types";

export function checkCreditsGuard(
  knownCredits: number | null,
  maxCredits: number | null,
  acknowledgeUnknownCost = false,
): CostGuardResult {
  if (knownCredits === null) {
    if (acknowledgeUnknownCost) {
      return { status: "OK", reason: "Custo desconhecido reconhecido explicitamente (acknowledgeUnknownCost=true)." };
    }
    return { status: "BLOCKED_UNKNOWN_COST", reason: "Custo nao pode ser calculado - exige acknowledgeUnknownCost=true para prosseguir." };
  }

  if (maxCredits === null) {
    return { status: "BLOCKED_NO_LIMIT_CONFIGURED", reason: "Nenhum limite maximo informado - nunca executar sem limite." };
  }

  if (knownCredits > maxCredits) {
    return {
      status: "BLOCKED_LIMIT_EXCEEDED",
      reason: `Custo estimado (${knownCredits} creditos) excede o limite configurado (${maxCredits} creditos).`,
    };
  }

  return { status: "OK", reason: null };
}

export function checkUsdCentsGuard(
  knownUsdCents: number | null,
  maxUsdCents: number | null,
  acknowledgeUnknownCost = false,
): CostGuardResult {
  if (knownUsdCents === null) {
    if (acknowledgeUnknownCost) {
      return { status: "OK", reason: "Custo USD desconhecido reconhecido explicitamente (acknowledgeUnknownCost=true)." };
    }
    return { status: "BLOCKED_UNKNOWN_COST", reason: "Custo USD nao pode ser calculado - exige acknowledgeUnknownCost=true para prosseguir." };
  }

  if (maxUsdCents === null) {
    return { status: "BLOCKED_NO_LIMIT_CONFIGURED", reason: "Nenhum limite maximo em USD informado - nunca executar provider USD sem limite." };
  }

  if (knownUsdCents > maxUsdCents) {
    return {
      status: "BLOCKED_LIMIT_EXCEEDED",
      reason: `Custo estimado (US$ ${(knownUsdCents / 100).toFixed(2)}) excede o limite configurado (US$ ${(maxUsdCents / 100).toFixed(2)}).`,
    };
  }

  return { status: "OK", reason: null };
}
