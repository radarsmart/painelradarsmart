// Radar Creative AI - Generation Orchestrator / Canary Executor
//
// Executa UMA cena em modo CANARY. So dois caminhos possiveis:
// 1) dryRun (ou capability sem provider real ainda) -> mock REAL de
//    lib/ai, identico ao mock-executor.ts;
// 2) provider real aprovado (APPROVED_CANARY_PROVIDER) -> adapter
//    dedicado. Se falhar, PARA - nunca tenta outro provider pago.
//
// Deliberadamente NAO reaproveita guardrails.assertProviderAllowedForMode
// (essa funcao so libera provider != mock quando mode === "LIVE", e
// CANARY e uma excecao estreita e propria - ver canary-guardrails.ts,
// que ja e a unica porta de entrada e cobre exatamente isso).

import { createImageProvider } from "@/lib/ai";
import { getProviderAdapter } from "@/lib/generation-orchestrator/adapters";
import { validateCanaryRequest } from "@/lib/generation-orchestrator/canary-guardrails";
import type {
  CanaryRequestInput,
  CanaryResult,
  SceneExecutionPlan,
} from "@/lib/generation-orchestrator/types";

async function runMockDryRun(plan: SceneExecutionPlan): Promise<CanaryResult> {
  const createdAt = new Date().toISOString();
  const provider = createImageProvider("mock");
  const result = await provider.generate({
    productName: `canary-${plan.sceneId}`,
    description: plan.positivePrompt,
    sourceImageUrl:
      plan.providerRequest.references.identity ?? plan.providerRequest.references.support ?? undefined,
  });

  return {
    provider: "mock",
    requestId: null,
    status: result.status === "success" ? "COMPLETED" : "FAILED",
    outputUrl: result.status === "success" ? result.outputUrl : null,
    creditsUsed: 0,
    currencyCostCents: 0,
    createdAt,
    error: result.status === "error" ? (result.error ?? "Erro desconhecido no provider mock.") : null,
  };
}

export async function executeCanaryScene(
  plan: SceneExecutionPlan,
  input: CanaryRequestInput,
): Promise<CanaryResult> {
  const createdAt = new Date().toISOString();

  const validation = validateCanaryRequest(plan, input);
  if (!validation.ok) {
    return {
      provider: plan.selectedProvider,
      requestId: null,
      status: "FAILED",
      outputUrl: null,
      creditsUsed: null,
      currencyCostCents: null,
      createdAt,
      error: validation.reason,
    };
  }

  if (input.dryRun || plan.selectedProvider === "mock") {
    return runMockDryRun(plan);
  }

  const adapter = getProviderAdapter(plan.selectedProvider);
  if (!adapter) {
    return {
      provider: plan.selectedProvider,
      requestId: null,
      status: "FAILED",
      outputUrl: null,
      creditsUsed: null,
      currencyCostCents: null,
      createdAt,
      error: `Nenhum adapter implementado para "${plan.selectedProvider}" - PARE, nao tentar outro provider pago.`,
    };
  }

  const result = await adapter.execute(plan.providerRequest);

  return {
    provider: plan.selectedProvider,
    requestId: result.requestId,
    status: result.status === "success" ? "COMPLETED" : "FAILED",
    outputUrl: result.outputUrl,
    // OpenAI images/edits nao retorna dado de custo/creditos na resposta -
    // nunca inventar um numero aqui.
    creditsUsed: null,
    currencyCostCents: null,
    createdAt,
    error: result.error,
  };
}
