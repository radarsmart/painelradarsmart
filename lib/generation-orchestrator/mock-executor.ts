// Radar Creative AI - Generation Orchestrator / Mock Executor
//
// UNICO lugar que efetivamente chama um provider. Reaproveita OBRIGATORIAMENTE
// os providers mock ja existentes em lib/ai (createImageProvider("mock") /
// createVideoProvider("mock")) - nao cria um provider mock novo.
//
// Guardrail critico: este executor SEMPRE instancia o provider passando
// o literal "mock" diretamente (nunca le AI_IMAGE_PROVIDER/AI_VIDEO_PROVIDER
// nem usa AIFactory), entao mesmo que uma variavel de ambiente esteja
// configurada errado para um provider pago, nenhuma chamada real acontece
// aqui. Isso satisfaz "MOCK deve sempre impedir chamada real" de forma
// estrutural, nao apenas por configuracao.

import { createImageProvider, createVideoProvider } from "@/lib/ai";
import { validateSceneForGeneration, assertProviderAllowedForMode } from "@/lib/generation-orchestrator/guardrails";
import type { GenerationMode, SceneExecutionPlan, SceneExecutionResult } from "@/lib/generation-orchestrator/types";

const IMAGE_CAPABILITIES = new Set(["TEXT_TO_IMAGE", "IMAGE_TO_IMAGE", "CHARACTER_IMAGE", "PRODUCT_IMAGE"]);

function bestAvailableReference(plan: SceneExecutionPlan): string | undefined {
  return (
    plan.providerRequest.references.identity ??
    plan.providerRequest.references.support ??
    plan.providerRequest.references.product ??
    undefined
  );
}

export async function executeSceneMock(
  plan: SceneExecutionPlan,
  mode: GenerationMode,
): Promise<SceneExecutionResult> {
  const mockedAt = new Date().toISOString();

  // Guardrail estrutural: nesta fase, TODA execucao usa "mock" como
  // provider efetivo, independente do que selectProvider indicou como
  // candidato ideal (selectedProvider e so informativo/custo ate o modo
  // LIVE existir).
  const effectiveProvider = "mock";
  assertProviderAllowedForMode(effectiveProvider, mode);

  const validation = validateSceneForGeneration(plan);
  if (!validation.ok) {
    return {
      sceneId: plan.sceneId,
      provider: effectiveProvider,
      status: "FAILED",
      outputUrl: null,
      cost: 0,
      mockedAt,
      error: validation.reason,
    };
  }

  try {
    if (IMAGE_CAPABILITIES.has(plan.providerCapability)) {
      const provider = createImageProvider("mock");
      const result = await provider.generate({
        productName: `scene-${plan.sceneId}`,
        description: plan.positivePrompt,
        sourceImageUrl: bestAvailableReference(plan),
      });

      return {
        sceneId: plan.sceneId,
        provider: effectiveProvider,
        status: result.status === "success" ? "COMPLETED" : "FAILED",
        outputUrl: result.status === "success" ? result.outputUrl : null,
        cost: 0,
        mockedAt,
        error: result.status === "error" ? (result.error ?? "Erro desconhecido no provider mock.") : null,
      };
    }

    const provider = createVideoProvider("mock");
    const result = await provider.render({
      imageUrl: bestAvailableReference(plan) ?? "mock://sem-referencia-disponivel.png",
      script: {
        hook: plan.positivePrompt,
        body: "",
        cta: "",
        duration: plan.durationSeconds,
      },
      productName: `scene-${plan.sceneId}`,
    });

    return {
      sceneId: plan.sceneId,
      provider: effectiveProvider,
      status: result.status === "success" ? "COMPLETED" : "FAILED",
      outputUrl: result.status === "success" ? (result.videoUrl ?? result.previewUrl ?? null) : null,
      cost: 0,
      mockedAt,
      error: result.status === "error" ? (result.error ?? "Erro desconhecido no provider mock.") : null,
    };
  } catch (error) {
    return {
      sceneId: plan.sceneId,
      provider: effectiveProvider,
      status: "FAILED",
      outputUrl: null,
      cost: 0,
      mockedAt,
      error: error instanceof Error ? error.message : "Erro desconhecido ao executar o provider mock.",
    };
  }
}
