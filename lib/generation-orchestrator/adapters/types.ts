// Radar Creative AI - Generation Orchestrator / Provider Adapters
//
// Um adapter converte o NormalizedGenerationRequest (independente de
// provider) para a chamada especifica de UM provider real. Nenhuma
// logica de provider deve viver no Commercial Director, Prompt Builder
// ou no core do Generation Orchestrator - so aqui.

import type { NormalizedGenerationRequest } from "@/lib/generation-orchestrator/types";

export type ProviderAdapterResult = {
  status: "success" | "error";
  outputUrl: string | null;
  requestId: string | null;
  error: string | null;
};

export interface ProviderAdapter {
  provider: string;
  execute(request: NormalizedGenerationRequest): Promise<ProviderAdapterResult>;
}
