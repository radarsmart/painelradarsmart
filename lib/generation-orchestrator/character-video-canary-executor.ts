// Radar Creative AI - Generation Orchestrator / Character Video Canary Executor
//
// Orquestra o CANARY de CHARACTER_VIDEO: valida (guardrails puros) ->
// calcula custo via o cost-estimator JA existente (nunca hardcoded) ->
// executa (mock de lib/ai em dryRun, ou o adapter OmniHuman isolado em
// execucao real). Nunca chama outro provider em caso de falha - mesma
// arquitetura de video-canary-executor.ts, paralela e independente.

import fs from "node:fs";

import { createVideoProvider } from "@/lib/ai";
import { estimateSceneCost } from "@/lib/generation-orchestrator/cost-estimator";
import { validateCharacterVideoCanaryRequest } from "@/lib/generation-orchestrator/character-video-canary-guardrails";
import { executeOmniHumanCharacterVideo } from "@/lib/generation-orchestrator/adapters/freepik-omnihuman";
import type { CharacterVideoCanaryRequestInput, CharacterVideoCanaryResult } from "@/lib/generation-orchestrator/types";

export type CharacterVideoCanaryExecutorDeps = {
  // Seams de injecao EXCLUSIVOS de teste - producao usa os defaults reais.
  executeOmniHuman?: typeof executeOmniHumanCharacterVideo;
  fileExistsFn?: (path: string) => boolean;
};

export async function executeCharacterVideoCanary(
  input: CharacterVideoCanaryRequestInput,
  deps: CharacterVideoCanaryExecutorDeps = {},
): Promise<CharacterVideoCanaryResult> {
  const executeOmniHuman = deps.executeOmniHuman ?? executeOmniHumanCharacterVideo;
  const fileExistsFn = deps.fileExistsFn ?? fs.existsSync;

  const startedAt = new Date().toISOString();
  const estimatedCost = estimateSceneCost(input.provider, input.durationSeconds);

  const validation = validateCharacterVideoCanaryRequest(input, estimatedCost, fileExistsFn);
  if (!validation.ok) {
    return {
      provider: input.provider,
      model: "omni-human-1-5",
      identityImageUrl: input.identityImageUrl,
      audioUrl: input.audioUrl,
      prompt: input.prompt ?? null,
      resolution: input.resolution,
      taskId: null,
      outputUrl: null,
      estimatedCost,
      estimatedCostUSD: null,
      actualCost: { credits: null, currencyCostCents: null },
      status: "FAILED",
      startedAt,
      completedAt: new Date().toISOString(),
      error: validation.reason,
    };
  }

  if (input.dryRun) {
    const provider = createVideoProvider("mock");
    const result = await provider.render({
      imageUrl: input.identityImageUrl,
      script: { hook: input.prompt ?? "canary dry-run", body: "", cta: "", duration: input.durationSeconds },
      productName: "canary-character-video-dry-run",
    });

    return {
      provider: "mock",
      model: "mock",
      identityImageUrl: input.identityImageUrl,
      audioUrl: input.audioUrl,
      prompt: input.prompt ?? null,
      resolution: input.resolution,
      taskId: null,
      outputUrl: result.status === "success" ? (result.videoUrl ?? result.previewUrl ?? null) : null,
      estimatedCost: { ...estimatedCost, provider: "mock", estimatedCredits: 0, estimatedCurrencyCostCents: 0 },
      estimatedCostUSD: 0,
      actualCost: { credits: 0, currencyCostCents: 0 },
      status: result.status === "success" ? "COMPLETED" : "FAILED",
      startedAt,
      completedAt: new Date().toISOString(),
      error: result.status === "error" ? (result.error ?? "Erro desconhecido no provider mock.") : null,
    };
  }

  // Unica tentativa paga - nunca retry, nunca fallback para outro
  // provider (ver guardrails, provider aprovado e fixo).
  const result = await executeOmniHuman({
    imageUrl: input.identityImageUrl,
    audioUrl: input.audioUrl,
    prompt: input.prompt,
    resolution: input.resolution,
    turboMode: input.turboMode,
  });

  return {
    provider: input.provider,
    model: "omni-human-1-5",
    identityImageUrl: input.identityImageUrl,
    audioUrl: input.audioUrl,
    prompt: input.prompt ?? null,
    resolution: input.resolution,
    taskId: result.taskId,
    outputUrl: result.outputUrl,
    estimatedCost,
    estimatedCostUSD: null,
    // OmniHuman/Magnific nao retorna custo/creditos reais na resposta -
    // nunca inventar; fica null ate haver uma fonte real desse dado.
    actualCost: { credits: null, currencyCostCents: null },
    status: result.status === "success" ? "COMPLETED" : "FAILED",
    startedAt,
    completedAt: new Date().toISOString(),
    error: result.error,
  };
}
