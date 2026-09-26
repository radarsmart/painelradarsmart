// Radar Creative AI - Generation Orchestrator / Guardrails
//
// Bloqueios explicitos e PUROS (nenhuma chamada de rede aqui). Cada
// funcao lanca um erro com mensagem clara em vez de silenciosamente
// deixar passar uma cena/execucao invalida.

import type { GenerationMode, SceneExecutionPlan } from "@/lib/generation-orchestrator/types";

// So MOCK e executavel via /generate (fluxo de campanha completa).
// PREVIEW existe no tipo GenerationMode mas ainda nao faz nada (reservado
// para uma fase futura). LIVE exige habilitacao explicita que ainda nao
// existe no codigo. CANARY existe (ver canary-guardrails.ts) mas SO pode
// rodar via /generate-canary, uma cena por vez - nunca pelo fluxo de
// campanha completa, entao tambem e bloqueado aqui.
export function assertExecutionModeIsMock(mode: GenerationMode): void {
  if (mode === "LIVE") {
    throw new Error(
      "Geracao real (LIVE) ainda nao foi habilitada nesta fase do Radar Creative AI.",
    );
  }
  if (mode === "PREVIEW") {
    throw new Error("Modo PREVIEW esta reservado para uma fase futura e ainda nao executa nada.");
  }
  if (mode === "CANARY") {
    throw new Error(
      "CANARY so pode ser executado via /generate-canary, uma cena por vez - nao pelo fluxo completo da campanha.",
    );
  }
  if (mode !== "MOCK") {
    throw new Error(`Modo de geracao desconhecido: "${mode}".`);
  }
}

// Guarda adicional independente da anterior: mesmo que selectedProvider
// aponte para um provider pago (informativo, para relatorio/custo), a
// execucao em qualquer modo != LIVE NUNCA pode usar um provider != mock.
export function assertProviderAllowedForMode(provider: string, mode: GenerationMode): void {
  if (provider !== "mock" && mode !== "LIVE") {
    throw new Error(
      `Provider pago "${provider}" nao pode ser executado fora do modo LIVE (modo atual: ${mode}).`,
    );
  }
}

export type SceneValidationResult = { ok: true } | { ok: false; reason: string };

const CHARACTER_CAPABILITIES = new Set(["CHARACTER_IMAGE", "CHARACTER_VIDEO"]);

// Cena de personagem sem PRIMARY deve falhar ANTES de qualquer chamada a
// provider - nunca deve chegar ao executor mock/real sem essa checagem.
export function validateSceneForGeneration(plan: SceneExecutionPlan): SceneValidationResult {
  if (!plan.positivePrompt || !plan.positivePrompt.trim()) {
    return { ok: false, reason: "Cena sem prompt valido (positivePrompt vazio)." };
  }

  if (CHARACTER_CAPABILITIES.has(plan.providerCapability) && !plan.identityReferenceAssetId) {
    return {
      ok: false,
      reason: "Cena de personagem sem PRIMARY (identityReferenceAssetId ausente).",
    };
  }

  // Cena de personagem SEM support generation-safe nunca pode seguir para
  // geracao real - reference-resolver.ts ja reselecionou exigindo
  // generationSafe=true; se supportReferenceAssetId ficou null aqui, e
  // porque nao existe nenhuma referencia segura compativel (nunca porque
  // o valor foi ignorado). Nunca cai silenciosamente para uma referencia
  // com logo/texto de fundo.
  if (CHARACTER_CAPABILITIES.has(plan.providerCapability) && !plan.supportReferenceAssetId) {
    return {
      ok: false,
      reason: "No generation-safe support reference available.",
    };
  }

  // Provider Lifecycle (ver provider-capabilities.ts, auditoria
  // TEXT_TO_VIDEO de 2026-08-08): escopo deliberadamente restrito a cenas
  // HYBRID_PRODUCT_COMPOSITE - e o unico caso concreto hoje onde a
  // capability (TEXT_TO_VIDEO) pode nao ter NENHUM provider real ACTIVE
  // (freepik-kling-t2v foi desativado por apontar pra uma capacidade que
  // a Kling nunca ofereceu). Nao generalizamos esse bloqueio pra outras
  // capabilities (ex: CHARACTER_VIDEO, que hoje tambem so tem providers
  // UNVERIFIED) porque isso quebraria fluxos MOCK ja validados sem
  // pedido explicito - selectedProvider/providerCapability continuam
  // informativos (custo/relatorio) fora deste caso especifico.
  if (
    plan.hybridCompositePlan &&
    plan.selectedProvider === "mock" &&
    plan.fallbackProviders.length === 0
  ) {
    return {
      ok: false,
      reason: `No active ${plan.providerCapability} provider available.`,
    };
  }

  return { ok: true };
}
