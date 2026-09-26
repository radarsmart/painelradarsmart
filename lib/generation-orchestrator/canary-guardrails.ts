// Radar Creative AI - Generation Orchestrator / Canary Guardrails
//
// Regras EXCLUSIVAS do modo CANARY - deliberadamente separadas de
// guardrails.ts (que continua garantindo que o fluxo normal de campanha
// - /generate - so aceita MOCK). CANARY e a UNICA excecao controlada que
// permite um provider pago real fora de LIVE, e so sob todas estas
// condicoes ao mesmo tempo.

import type { CanaryRequestInput, GenerationMode, SceneExecutionPlan } from "@/lib/generation-orchestrator/types";

// Unico provider real aprovado para CANARY ate agora (ver
// provider-capabilities.ts) - CHARACTER_IMAGE via OpenAI gpt-image-1.
// Qualquer outro provider real precisa passar por uma nova avaliacao
// explicita (secao 5 do prompt) antes de entrar aqui.
export const APPROVED_CANARY_PROVIDER = "openai-image-edit";

export type CanaryValidationResult = { ok: true } | { ok: false; reason: string };

// mode nunca e inferido - o endpoint /generate-canary exige o literal
// "CANARY" no corpo da requisicao.
export function assertModeIsCanary(mode: GenerationMode): void {
  if (mode !== "CANARY") {
    throw new Error('O endpoint /generate-canary so aceita mode="CANARY" explicito no corpo da requisicao.');
  }
}

export function validateCanarySceneSelection(sceneIds: string[]): CanaryValidationResult {
  if (sceneIds.length !== 1) {
    return {
      ok: false,
      reason: `CANARY permite exatamente 1 cena por execucao (recebido: ${sceneIds.length}).`,
    };
  }
  return { ok: true };
}

export function validateCanaryRequest(
  plan: SceneExecutionPlan,
  input: CanaryRequestInput,
): CanaryValidationResult {
  if (!input.confirmed) {
    return { ok: false, reason: "CANARY exige confirmacao explicita (confirmed=true)." };
  }

  if (typeof input.maxCostBRL !== "number" || !Number.isFinite(input.maxCostBRL) || input.maxCostBRL <= 0) {
    return {
      ok: false,
      reason: "CANARY exige um limite maximo de custo (maxCostBRL > 0) - nunca executar sem limite informado.",
    };
  }

  // Reaproveita a validacao ja feita na preparacao do plano (ex: cena de
  // personagem sem PRIMARY ja chega aqui com status FAILED).
  if (plan.status !== "READY") {
    return { ok: false, reason: plan.statusReason ?? "Cena nao esta pronta para geracao (status != READY)." };
  }

  if (input.dryRun || plan.selectedProvider === "mock") {
    // dryRun explicito, ou a capability simplesmente nao tem provider
    // real ainda - nos dois casos so roda mock, sem risco de custo.
    return { ok: true };
  }

  if (plan.providerCapability !== "CHARACTER_IMAGE") {
    return {
      ok: false,
      reason:
        `Capability "${plan.providerCapability}" ainda nao foi aprovada para CANARY real - ` +
        `somente CHARACTER_IMAGE (via ${APPROVED_CANARY_PROVIDER}) foi avaliada ate agora.`,
    };
  }

  if (plan.selectedProvider !== APPROVED_CANARY_PROVIDER) {
    return {
      ok: false,
      reason:
        `Provider "${plan.selectedProvider}" nao e o provider aprovado para CANARY ` +
        `(${APPROVED_CANARY_PROVIDER}) - sem fallback para outro provider pago.`,
    };
  }

  const cost = plan.estimatedCost;
  if (cost.estimatedCurrencyCostCents === null) {
    if (!input.acknowledgeUnknownCost) {
      return {
        ok: false,
        reason:
          "Custo estimado desconhecido para este provider - confirme explicitamente " +
          "com acknowledgeUnknownCost=true para prosseguir mesmo assim.",
      };
    }
  } else if (cost.estimatedCurrencyCostCents > Math.round(input.maxCostBRL * 100)) {
    return {
      ok: false,
      reason:
        `Custo estimado (R$ ${(cost.estimatedCurrencyCostCents / 100).toFixed(2)}) acima do ` +
        `limite maximo informado (R$ ${input.maxCostBRL.toFixed(2)}).`,
    };
  }

  return { ok: true };
}
