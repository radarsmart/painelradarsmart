// Radar Creative AI - Generation Orchestrator / Adapter Registry
//
// Registry MINIMO e explicito - so o provider aprovado para CANARY entra
// aqui. Isso e deliberadamente separado do provider-selector.ts (que so
// diz qual provider SERIA ideal) - este registry e quem de fato dispara
// uma chamada de rede, entao so contem o que ja foi avaliado e aprovado.

import { openaiCharacterImageAdapter } from "@/lib/generation-orchestrator/adapters/openai-character-image";
import type { ProviderAdapter } from "@/lib/generation-orchestrator/adapters/types";

const ADAPTERS: Record<string, ProviderAdapter> = {
  "openai-image-edit": openaiCharacterImageAdapter,
};

export function getProviderAdapter(provider: string): ProviderAdapter | null {
  return ADAPTERS[provider] ?? null;
}
