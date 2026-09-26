// Radar Creative AI - Generation Orchestrator / Provider Selector
//
// Escolhe, de forma PURA e deterministica, qual seria o provider real
// ideal para uma capability (informativo, para custo/relatorio - a
// EXECUCAO nesta fase e sempre mock, ver mock-executor.ts). "mock" e
// sempre incluido como ultimo fallback, garantindo que sempre exista
// pelo menos uma opcao executavel.
//
// So considera providers com status "ACTIVE" (ver Provider Lifecycle em
// types.ts/provider-capabilities.ts) - um provider UNVERIFIED/DISABLED/
// DEPRECATED nunca e escolhido automaticamente, mesmo que declare
// suporte real a capability. Se nao houver NENHUM provider ACTIVE,
// selectedProvider cai pra "mock" com fallbackProviders vazio - esse e o
// sinal que guardrails.ts usa pra saber que a cena nao tem nenhum
// caminho real de execucao ainda (ver validateSceneForGeneration).

import { getActiveProvidersForCapability } from "@/lib/generation-orchestrator/provider-capabilities";
import type { GenerationCapability } from "@/lib/generation-orchestrator/types";

export type ProviderSelection = {
  selectedProvider: string;
  fallbackProviders: string[];
};

export function selectProvider(
  capability: GenerationCapability,
  options: { needsIdentityReference: boolean },
): ProviderSelection {
  const candidates = getActiveProvidersForCapability(capability).filter((p) => p.provider !== "mock");

  const ordered = options.needsIdentityReference
    ? [
        ...candidates.filter((p) => p.supportsIdentityReference),
        ...candidates.filter((p) => !p.supportsIdentityReference),
      ]
    : candidates;

  const providerNames = ordered.map((p) => p.provider);
  const chain = [...providerNames, "mock"];

  return {
    selectedProvider: chain[0],
    fallbackProviders: chain.slice(1),
  };
}
