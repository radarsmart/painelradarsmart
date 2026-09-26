// Radar Creative AI - Generation Orchestrator / Character Video HeyGen Canary Executor
//
// Orquestra o CANARY de CHARACTER_VIDEO via HeyGen: valida (guardrails
// puros) -> estima custo em USD (nunca hardcoded, nunca inventado pra
// resolucao sem numero confirmado) -> executa (mock em dryRun, ou o
// adapter HeyGen isolado em execucao real). Nunca chama outro provider em
// caso de falha - mesma arquitetura das outras 2 CANARY executors deste
// projeto (Kling video, OmniHuman), paralela e independente.

import fs from "node:fs";

import { createVideoProvider } from "@/lib/ai";
import {
  validateHeyGenCanaryRequest,
  estimateHeyGenCostUSD,
} from "@/lib/generation-orchestrator/character-video-heygen-canary-guardrails";
import { executeHeyGenImageToVideo, type HeyGenApprovedResolution, type HeyGenApprovedAspectRatio } from "@/lib/generation-orchestrator/adapters/heygen-image-to-video";
import type { CharacterVideoCanaryRequestInput, CharacterVideoCanaryResult } from "@/lib/generation-orchestrator/types";

export type CharacterVideoHeyGenCanaryExecutorDeps = {
  // Seams de injecao EXCLUSIVOS de teste - producao usa os defaults reais.
  executeHeyGen?: typeof executeHeyGenImageToVideo;
  fileExistsFn?: (path: string) => boolean;
};

export async function executeCharacterVideoHeyGenCanary(
  input: CharacterVideoCanaryRequestInput,
  deps: CharacterVideoHeyGenCanaryExecutorDeps = {},
): Promise<CharacterVideoCanaryResult> {
  const executeHeyGen = deps.executeHeyGen ?? executeHeyGenImageToVideo;
  // fileExistsFn existe so pra manter a MESMA assinatura de dependencia
  // das outras executors deste projeto (nunca usado aqui - HeyGen so
  // aceita URL, nunca caminho local).
  void (deps.fileExistsFn ?? fs.existsSync);

  const startedAt = new Date().toISOString();
  const estimatedCostUSD = estimateHeyGenCostUSD(input.resolution, input.durationSeconds);

  const validation = validateHeyGenCanaryRequest(input, estimatedCostUSD);
  if (!validation.ok) {
    return {
      provider: input.provider,
      model: "heygen-image-to-video",
      identityImageUrl: input.identityImageUrl,
      audioUrl: input.audioUrl,
      prompt: input.prompt ?? null,
      resolution: input.resolution,
      taskId: null,
      outputUrl: null,
      estimatedCost: { provider: input.provider, estimatedCredits: null, estimatedCurrencyCostCents: null, actualCredits: null, actualCurrencyCostCents: null },
      estimatedCostUSD,
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
      productName: "canary-character-video-heygen-dry-run",
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
      estimatedCost: { provider: "mock", estimatedCredits: 0, estimatedCurrencyCostCents: 0, actualCredits: null, actualCurrencyCostCents: null },
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
  const result = await executeHeyGen({
    imageUrl: input.identityImageUrl,
    audioUrl: input.audioUrl,
    resolution: input.resolution as HeyGenApprovedResolution,
    aspectRatio: (input.aspectRatio ?? "auto") as HeyGenApprovedAspectRatio,
  });

  return {
    provider: input.provider,
    model: "heygen-image-to-video",
    identityImageUrl: input.identityImageUrl,
    audioUrl: input.audioUrl,
    prompt: input.prompt ?? null,
    resolution: input.resolution,
    taskId: result.videoId,
    outputUrl: result.outputUrl,
    estimatedCost: { provider: input.provider, estimatedCredits: null, estimatedCurrencyCostCents: null, actualCredits: null, actualCurrencyCostCents: null },
    estimatedCostUSD,
    // HeyGen nao retorna custo real consumido na resposta - nunca
    // inventar; fica null ate haver uma fonte real desse dado (ex:
    // conferir GET /v3/users/me antes/depois e calcular a diferenca,
    // fora do escopo desta tarefa).
    actualCost: { credits: null, currencyCostCents: null },
    status: result.status === "success" ? "COMPLETED" : "FAILED",
    startedAt,
    completedAt: new Date().toISOString(),
    error: result.error,
  };
}
