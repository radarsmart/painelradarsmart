// Radar Creative AI - Generation Orchestrator / WAN Background CANARY Guardrails
//
// Regras do CANARY de background do HYBRID_PRODUCT_COMPOSITE via WAN 2.5
// T2V. Deliberadamente separado de video-canary-guardrails.ts (aquele e
// pra image-to-video de produto/personagem, com inputImageUrl - este e
// text-to-video PURO, nunca recebe nenhuma imagem/referencia de produto,
// arquitetura diferente, guardrails proprios). Existe SOMENTE dentro do
// fluxo controlado de CANARY - nunca pelo Generation Orchestrator normal
// (que continua reportando "No active TEXT_TO_VIDEO provider available."
// historico: nasceu para validar wan-2-5-t2v enquanto o provider ainda era
// UNVERIFIED; mantido como caminho de CANARY controlado, separado do fluxo
// normal de campanha (ver guardrails.ts).

import { canProviderRunCanary, getProviderProfile } from "@/lib/generation-orchestrator/provider-capabilities";
import { estimateSceneCost } from "@/lib/generation-orchestrator/cost-estimator";
import {
  validateWanTextToVideoRequest,
  WAN_APPROVED_DURATIONS,
  type WanApprovedDuration,
} from "@/lib/generation-orchestrator/adapters/wan-2-5-text-to-video";
import type { HybridCompositePlan, ProductGenerationStrategy } from "@/lib/generation-orchestrator/product-generation-strategy";
import type { GenerationCostEstimate } from "@/lib/generation-orchestrator/types";

export const WAN_BACKGROUND_CANARY_PROVIDER = "wan-2-5-t2v";

export type WanBackgroundCanaryRequestInput = {
  prompt: string;
  negativePrompt: string;
  duration: WanApprovedDuration;
  confirmed: boolean;
  // Teto em CREDITOS, nao em BRL - ver types.ts (centavosPerCredit pode
  // ser null quando a taxa de conversao desta conta ainda nao foi
  // confirmada, que e exatamente o caso do WAN hoje). maxCostBRL de
  // outros CANARYs continua existindo sem alteracao - isso e especifico
  // deste provider.
  maxCredits: number;
};

export type CanaryValidationResult = { ok: true } | { ok: false; reason: string };

export function isValidWanBackgroundCanaryMode(mode: string): boolean {
  return mode === "CANARY";
}

/**
 * Validacao completa do request - cobre confirmacao, teto de creditos,
 * elegibilidade do provider (Provider Lifecycle - UNVERIFIED PODE rodar
 * aqui, mas so aqui, nunca no fluxo normal), duracao aprovada e os
 * limites de prompt/negative_prompt documentados oficialmente
 * (reaproveita a validacao pura do proprio adapter, nunca duplica a
 * regra). estimatedCost ja deve ter sido calculado pelo cost-estimator.ts
 * ANTES de chamar isso (nunca inventado aqui).
 */
export function validateWanBackgroundCanaryRequest(
  input: WanBackgroundCanaryRequestInput,
  estimatedCost: GenerationCostEstimate,
): CanaryValidationResult {
  if (!input.confirmed) {
    return { ok: false, reason: "CANARY de background WAN exige confirmacao explicita (confirmed=true)." };
  }

  if (typeof input.maxCredits !== "number" || !Number.isFinite(input.maxCredits) || input.maxCredits <= 0) {
    return {
      ok: false,
      reason: "CANARY de background WAN exige um teto maximo de creditos (maxCredits > 0) - nunca executar sem limite.",
    };
  }

  const profile = getProviderProfile(WAN_BACKGROUND_CANARY_PROVIDER);
  if (!profile || !canProviderRunCanary(profile.status)) {
    return {
      ok: false,
      reason: `Provider "${WAN_BACKGROUND_CANARY_PROVIDER}" nao e elegivel para CANARY (status: ${profile?.status ?? "desconhecido"}).`,
    };
  }

  if (!(WAN_APPROVED_DURATIONS as readonly string[]).includes(input.duration)) {
    return {
      ok: false,
      reason: `Duracao "${input.duration}" nao aprovada - so ${WAN_APPROVED_DURATIONS.join(" ou ")} sao documentadas.`,
    };
  }

  const promptValidation = validateWanTextToVideoRequest({
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    duration: input.duration,
  });
  if (!promptValidation.ok) return promptValidation;

  if (estimatedCost.estimatedCredits !== null && estimatedCost.estimatedCredits > input.maxCredits) {
    return {
      ok: false,
      reason:
        `Custo estimado (${estimatedCost.estimatedCredits} creditos) acima do teto maximo informado ` +
        `(${input.maxCredits} creditos).`,
    };
  }

  return { ok: true };
}

// --- Dry-run / preview (nenhuma rede, nenhuma execucao) ------------------

export type WanBackgroundCanaryPreview = {
  provider: string;
  model: string;
  endpoint: string;
  strategy: ProductGenerationStrategy;
  prompt: string;
  negativePrompt: string;
  duration: WanApprovedDuration;
  estimatedCredits: number | null;
  estimatedCurrencyCostCents: number | null;
  maxCredits: number;
  productReferenceSentToProvider: false;
  hybridCompositePlan: HybridCompositePlan;
};

/**
 * Monta exatamente o que SERIA enviado pro CANARY #5, a partir de um
 * HybridCompositePlan real ja persistido - sem chamar rede, sem montar
 * nenhum request de execucao de verdade. productReferenceSentToProvider
 * e sempre `false` (tipo literal, nao um boolean generico) porque o
 * payload do WAN text-to-video nem tem campo de imagem - estrutural, nao
 * uma checagem em runtime.
 */
export function buildWanBackgroundCanaryPreview(
  plan: HybridCompositePlan,
  duration: WanApprovedDuration,
  maxCredits: number,
): WanBackgroundCanaryPreview {
  const estimatedCost = estimateSceneCost(WAN_BACKGROUND_CANARY_PROVIDER, Number(duration));

  return {
    provider: WAN_BACKGROUND_CANARY_PROVIDER,
    model: "wan-2-5-t2v-1080p",
    endpoint: "https://api.magnific.com/v1/ai/text-to-video/wan-2-5-t2v-1080p",
    strategy: "HYBRID_PRODUCT_COMPOSITE",
    prompt: plan.backgroundGenerationPrompt,
    negativePrompt: plan.backgroundNegativePrompt,
    duration,
    estimatedCredits: estimatedCost.estimatedCredits,
    estimatedCurrencyCostCents: estimatedCost.estimatedCurrencyCostCents,
    maxCredits,
    productReferenceSentToProvider: false,
    hybridCompositePlan: plan,
  };
}
