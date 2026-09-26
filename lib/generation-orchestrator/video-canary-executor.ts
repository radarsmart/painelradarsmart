// Radar Creative AI - Generation Orchestrator / Video Canary Executor
//
// Orquestra o CANARY de image-to-video: valida (guardrails puros) ->
// confirma que a imagem de entrada e realmente uma imagem acessivel ->
// calcula custo via o cost-estimator JA existente (nunca hardcoded) ->
// executa (mock real de lib/ai em dryRun, ou o adapter Freepik Kling
// isolado em execucao real). Nunca chama outro provider em caso de falha.

import { createVideoProvider } from "@/lib/ai";
import { estimateSceneCost } from "@/lib/generation-orchestrator/cost-estimator";
import { validateVideoCanaryRequest } from "@/lib/generation-orchestrator/video-canary-guardrails";
import { executeFreepikKlingImageToVideo } from "@/lib/generation-orchestrator/adapters/freepik-kling-image-to-video";
import type { VideoCanaryRequestInput, VideoCanaryResult } from "@/lib/generation-orchestrator/types";

/**
 * Confirma que a URL responde e que o Content-Type e image/* - checagem
 * de rede contra a PROPRIA origem da imagem (nosso Storage), nunca contra
 * o provider pago. Roda depois da validacao sincrona de forma/host.
 */
async function validateInputImageAccessible(url: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store" });
    if (!response.ok) {
      return { ok: false, reason: `inputImageUrl nao respondeu (HTTP ${response.status}).` };
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return { ok: false, reason: `inputImageUrl nao e uma imagem (content-type: "${contentType}").` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: `Falha ao acessar inputImageUrl: ${error instanceof Error ? error.message : "erro desconhecido"}.`,
    };
  }
}

export async function executeVideoCanary(input: VideoCanaryRequestInput): Promise<VideoCanaryResult> {
  const startedAt = new Date().toISOString();
  const estimatedCost = estimateSceneCost(input.provider, Number(input.duration) || 0);

  const validation = validateVideoCanaryRequest(input, estimatedCost);
  if (!validation.ok) {
    return {
      provider: input.provider,
      model: "kling-v2-5-pro",
      inputImageUrl: input.inputImageUrl,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      duration: input.duration,
      cfgScale: input.cfgScale,
      taskId: null,
      outputUrl: null,
      estimatedCost,
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
      imageUrl: input.inputImageUrl,
      script: { hook: input.prompt, body: "", cta: "", duration: Number(input.duration) || 5 },
      productName: "canary-video-dry-run",
    });

    return {
      provider: "mock",
      model: "mock",
      inputImageUrl: input.inputImageUrl,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      duration: input.duration,
      cfgScale: input.cfgScale,
      taskId: null,
      outputUrl: result.status === "success" ? (result.videoUrl ?? result.previewUrl ?? null) : null,
      estimatedCost: { ...estimatedCost, provider: "mock", estimatedCredits: 0, estimatedCurrencyCostCents: 0 },
      actualCost: { credits: 0, currencyCostCents: 0 },
      status: result.status === "success" ? "COMPLETED" : "FAILED",
      startedAt,
      completedAt: new Date().toISOString(),
      error: result.status === "error" ? (result.error ?? "Erro desconhecido no provider mock.") : null,
    };
  }

  const accessible = await validateInputImageAccessible(input.inputImageUrl);
  if (!accessible.ok) {
    return {
      provider: input.provider,
      model: "kling-v2-5-pro",
      inputImageUrl: input.inputImageUrl,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      duration: input.duration,
      cfgScale: input.cfgScale,
      taskId: null,
      outputUrl: null,
      estimatedCost,
      actualCost: { credits: null, currencyCostCents: null },
      status: "FAILED",
      startedAt,
      completedAt: new Date().toISOString(),
      error: accessible.reason,
    };
  }

  const result = await executeFreepikKlingImageToVideo({
    inputImageUrl: input.inputImageUrl,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    duration: input.duration,
    cfgScale: input.cfgScale,
  });

  return {
    provider: input.provider,
    model: "kling-v2-5-pro",
    inputImageUrl: input.inputImageUrl,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    duration: input.duration,
    cfgScale: input.cfgScale,
    taskId: result.taskId,
    outputUrl: result.outputUrl,
    estimatedCost,
    // Freepik nao retorna custo/creditos reais na resposta - nunca
    // inventar; fica null ate haver uma fonte real desse dado.
    actualCost: { credits: null, currencyCostCents: null },
    status: result.status === "success" ? "COMPLETED" : "FAILED",
    startedAt,
    completedAt: new Date().toISOString(),
    error: result.error,
  };
}
