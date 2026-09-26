// Radar Creative AI - Generation Orchestrator / Cost Estimator
//
// Estimativa de custo PURA. mock = sempre 0. Providers reais sem
// modelo documentado = null (nunca inventar numero). Providers
// Magnific/Freepik usam creditos; providers como HeyGen podem usar wallet
// USD separada, sem conversao para creditos.

import { getProviderProfile } from "@/lib/generation-orchestrator/provider-capabilities";
import type { GenerationCostEstimate } from "@/lib/generation-orchestrator/types";

// Providers cujo schema real SO aceita duration como enum "5"|"10" segundos
// (confirmado na documentacao oficial e/ou nos adapters isolados - ver
// lib/generation-orchestrator/adapters/wan-2-5-text-to-video.ts e
// adapters/freepik-kling-image-to-video.ts, este ultimo tambem confirmado
// em producao por lib/ugc/freepik.ts, que sempre envia duration:"5" fixo).
// Achado do CREATIVE V2 HOOK FIDELITY CANARY pre-flight (2026-08-10): o
// custo estimado de freepik-kling-i2v NUNCA aplicava esse piso (so
// wan-2-5-t2v tinha a regra) - uma cena de 2s era cobrada como se o
// provider aceitasse submeter exatamente 2s, o que a API real nao permite.
// Isso subestimava o custo de QUALQUER cena Kling cuja duracao real nao
// fosse exatamente 5 ou 10 (a maioria) - nao so do HOOK.
const DURATION_ENUM_5_OR_10_PROVIDERS = new Set(["wan-2-5-t2v", "freepik-kling-i2v"]);

function resolveBillableDurationSeconds(provider: string, durationSeconds: number): number {
  if (DURATION_ENUM_5_OR_10_PROVIDERS.has(provider)) {
    return durationSeconds <= 5 ? 5 : 10;
  }
  return durationSeconds;
}

export function estimateSceneCost(provider: string, durationSeconds: number): GenerationCostEstimate {
  const billableDurationSeconds = resolveBillableDurationSeconds(provider, durationSeconds);

  if (provider === "mock") {
    return {
      provider: "mock",
      estimatedCredits: 0,
      estimatedCurrencyCostCents: 0,
      costUnit: "FREE",
      estimatedUsdCostCents: 0,
      actualCredits: null,
      actualCurrencyCostCents: null,
    };
  }

  const profile = getProviderProfile(provider);
  const estimatedUsdCostCents = estimateProviderUsdCostCents(
    provider,
    profile?.usdCostModel?.resolution ?? null,
    billableDurationSeconds,
  );
  if (estimatedUsdCostCents !== null) {
    return {
      provider,
      estimatedCredits: null,
      estimatedCurrencyCostCents: null,
      costUnit: "USD",
      estimatedUsdCostCents,
      actualCredits: null,
      actualCurrencyCostCents: null,
    };
  }

  if (!profile || !profile.costModel) {
    return {
      provider,
      estimatedCredits: null,
      estimatedCurrencyCostCents: null,
      costUnit: "UNKNOWN",
      estimatedUsdCostCents: null,
      actualCredits: null,
      actualCurrencyCostCents: null,
    };
  }

  const estimatedCredits = Math.round(profile.costModel.creditsPerSecond * billableDurationSeconds);
  const estimatedCurrencyCostCents =
    profile.costModel.centavosPerCredit !== null
      ? Math.round(estimatedCredits * profile.costModel.centavosPerCredit)
      : null;

  return {
    provider,
    estimatedCredits,
    estimatedCurrencyCostCents,
    costUnit: "CREDITS",
    estimatedUsdCostCents: null,
    actualCredits: null,
    actualCurrencyCostCents: null,
  };
}

export function estimateProviderUsdCostCents(
  provider: string,
  resolution: string | null,
  durationSeconds: number,
): number | null {
  const profile = getProviderProfile(provider);
  if (!profile?.usdCostModel || resolution !== profile.usdCostModel.resolution) return null;
  return Math.round((durationSeconds / 60) * profile.usdCostModel.costPerMinuteUSD * 100);
}
