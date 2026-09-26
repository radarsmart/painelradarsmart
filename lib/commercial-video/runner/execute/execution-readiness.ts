// Radar Creative AI - Commercial Generation Runner / Execution Readiness V1
//
// PURO - responde, ANTES de qualquer chamada paga, "esta campanha
// consegue chegar ate um MP4 final com a infraestrutura disponivel HOJE?"
// Nasceu de uma auditoria real (PRE-FLIGHT da campanha 5a0b6e06): gastar
// credito e so descobrir DEPOIS que 2 de 3 cenas nunca poderiam ter asset
// (provider "mock" sem caminho real de producao) e o exato problema que
// este modulo existe para prevenir - avaliado ANTES do Runner tentar
// qualquer geracao/sintese real.
//
// Nao reimplementa elegibilidade (isso continua sendo
// commercial-generation-runner.ts#buildSceneRunnerPlan) - so RECOMBINA o
// que ja foi calculado (SceneRunnerPlan.eligibility/existingAsset/
// estimatedCost/requiresHybridPipeline, ProviderCapabilityProfile) numa
// resposta por cena (REUSE/GENERATE/LOCAL_PIPELINE/BLOCKED) e uma
// resposta agregada por campanha.

import { isProviderProductionEligible, getProvidersForCapability } from "@/lib/generation-orchestrator/provider-capabilities";
import type { GenerationCapability, ProviderCapabilityProfile } from "@/lib/generation-orchestrator/types";
import type { NarrationPlan } from "@/lib/commercial-video/narration/types";
import type { SceneRunnerPlan } from "@/lib/commercial-video/runner/types";
import type { CreativeQualityStatus } from "@/lib/creative-director-v2/types";
import type { PersuasionCheckStatus } from "@/lib/commercial-video/persuasion/types";

export type SceneExecutionReadinessStatus = "REUSE" | "GENERATE" | "LOCAL_PIPELINE" | "BLOCKED";

export type CampaignReadinessBlockedReason =
  | "BLOCKED_PROVIDER_COVERAGE"
  | "BLOCKED_MISSING_ASSET"
  | "BLOCKED_UNKNOWN_COST"
  | "BLOCKED_REFERENCE"
  | "BLOCKED_NARRATION"
  | "BLOCKED_CREATIVE_QUALITY"
  | "BLOCKED_COMMERCIAL_PERSUASION"
  | "BLOCKED_CAPABILITY_FIDELITY"
  | "BLOCKED_OTHER";

export type CampaignExecutionReadinessStatus = "READY" | CampaignReadinessBlockedReason;

export type SceneExecutionReadiness = {
  sceneId: string;
  status: SceneExecutionReadinessStatus;
  // null somente quando status !== "BLOCKED".
  blockedReason: CampaignReadinessBlockedReason | null;
  reason: string;
};

export type CampaignExecutionReadiness = {
  status: CampaignExecutionReadinessStatus;
  canProduceFinalCommercial: boolean;
  scenes: SceneExecutionReadiness[];
  reasons: string[];
};

// Campanha sem nenhuma cena obrigatoria bloqueada, sem NarrationPlan
// bloqueado - estado inicial "neutro" antes de qualquer avaliacao (nunca
// exposto como resultado final por engano, so como base defensiva).
export const READY_EXECUTION_READINESS: CampaignExecutionReadiness = {
  status: "READY",
  canProduceFinalCommercial: true,
  scenes: [],
  reasons: [],
};

function hasKnownGenerationCost(scene: SceneRunnerPlan): boolean {
  return scene.estimatedCost.estimatedCredits !== null || (scene.estimatedCost.estimatedUsdCostCents ?? null) !== null;
}

function describeKnownGenerationCost(scene: SceneRunnerPlan): string {
  if (scene.estimatedCost.estimatedCredits !== null) {
    return `${scene.estimatedCost.estimatedCredits} creditos`;
  }
  const estimatedUsdCostCents = scene.estimatedCost.estimatedUsdCostCents ?? null;
  if (estimatedUsdCostCents !== null) {
    return `US$ ${(estimatedUsdCostCents / 100).toFixed(2)}`;
  }
  return "UNKNOWN";
}

function classifyScene(scene: SceneRunnerPlan): SceneExecutionReadiness | null {
  // SKIPPED nunca bloqueia a campanha (mesmo criterio ja usado em
  // aggregateRunnerQuality#assessSceneEligibilityQuality) - cena
  // intencionalmente fora do comercial nao e "obrigatoria".
  if (scene.eligibility === "SKIPPED") return null;

  // REUSE - asset ja resolvido e pronto (candidato existente com
  // fingerprint valido, ver real-scene-asset-resolver.ts).
  if (scene.existingAsset?.status === "READY") {
    return {
      sceneId: scene.sceneId,
      status: "REUSE",
      blockedReason: null,
      reason: `Asset reutilizavel ja resolvido (source=${scene.existingAsset.source ?? "desconhecida"}).`,
    };
  }

  if (scene.eligibility === "BLOCKED_REFERENCE_QUALITY") {
    return {
      sceneId: scene.sceneId,
      status: "BLOCKED",
      blockedReason: "BLOCKED_REFERENCE",
      reason: scene.eligibilityReason ?? "Referencia de produto insuficiente para gerar esta cena.",
    };
  }

  // Subject-Aware Capability Routing V1 (ver capability-fidelity-gate.ts) -
  // motivo PROPRIO e distinto de BLOCKED_PROVIDER_COVERAGE: a capability
  // selecionada nao aceita nenhuma referencia real de produto que a cena
  // exige (REQUIRED/STRICT), fora do caminho HYBRID_PRODUCT_COMPOSITE.
  if (scene.eligibility === "BLOCKED_CAPABILITY_FIDELITY") {
    return {
      sceneId: scene.sceneId,
      status: "BLOCKED",
      blockedReason: "BLOCKED_CAPABILITY_FIDELITY",
      reason: scene.eligibilityReason ?? "Capability selecionada nao aceita referencia real de produto exigida pela cena.",
    };
  }

  if (scene.eligibility === "BLOCKED_VALIDATION") {
    return {
      sceneId: scene.sceneId,
      status: "BLOCKED",
      blockedReason: "BLOCKED_OTHER",
      reason: scene.eligibilityReason ?? "Validacao da cena falhou.",
    };
  }

  if (scene.eligibility === "BLOCKED_PROVIDER_STATUS") {
    return {
      sceneId: scene.sceneId,
      status: "BLOCKED",
      blockedReason: "BLOCKED_PROVIDER_COVERAGE",
      reason: scene.eligibilityReason ?? `Provider "${scene.selectedProvider}" indisponivel para esta cena.`,
    };
  }

  if (!hasKnownGenerationCost(scene)) {
    return {
      sceneId: scene.sceneId,
      status: "BLOCKED",
      blockedReason: "BLOCKED_UNKNOWN_COST",
      reason: `Custo de "${scene.selectedProvider}" nao pode ser calculado (sem costModel/usdCostModel documentado) - EXECUTE nunca assume custo zero por omissao.`,
    };
  }

  // "mock" (ou qualquer provider ainda nao validado por CANARY real) NAO
  // produz midia de producao, mesmo com status ACTIVE (ver
  // provider-capabilities.ts#productionEligible) - este e o gap que a
  // auditoria original encontrou (HOOK/CTA cairiam pra mock e nunca
  // teriam asset real).
  if (!isProviderProductionEligible(scene.selectedProvider)) {
    return {
      sceneId: scene.sceneId,
      status: "BLOCKED",
      blockedReason: "BLOCKED_PROVIDER_COVERAGE",
      reason:
        scene.selectedProvider === "mock"
          ? `Cena caiu para o provider "mock" - elegivel so para testes locais, nunca produz midia real de producao (nenhum candidato reutilizavel foi fornecido).`
          : `Provider "${scene.selectedProvider}" ainda nao e productionEligible (status atual: ${scene.providerStatus ?? "desconhecido"}) - nao pode ser usado num EXECUTE de producao real.`,
    };
  }

  if (scene.requiresHybridPipeline) {
    return {
      sceneId: scene.sceneId,
      status: "LOCAL_PIPELINE",
      blockedReason: null,
      reason: `Fundo gerado por "${scene.selectedProvider}" (productionEligible) + Product Cutout + Hybrid Compositor (processamento 100% local depois do fundo).`,
    };
  }

  return {
    sceneId: scene.sceneId,
    status: "GENERATE",
    blockedReason: null,
    reason: `Geracao real via "${scene.selectedProvider}" (ACTIVE, productionEligible, custo conhecido: ${describeKnownGenerationCost(scene)}).`,
  };
}

/**
 * Responde a pergunta central desta tarefa. NUNCA chama nenhum provider -
 * so recombina dados ja calculados. `narrationPlan` e opcional porque em
 * alguns pontos do Runner ele pode ainda nao existir (a campanha ja seria
 * BLOCKED_PROVIDER_COVERAGE antes disso importar).
 *
 * `creativeQualityGateStatus` e OPCIONAL - so preenchido quando a campanha
 * usa Creative Director V2 (creative_brief.commercialDirectionV2.
 * storyboardQualityGate.status, ver lib/creative-director-v2/decision-engine/**).
 * Campanhas V1 nunca passam isso (undefined = comportamento identico ao
 * anterior). Mesma regra atomica ja usada pro NarrationPlan: FAIL bloqueia a
 * campanha INTEIRA antes de qualquer chamada paga, mesmo cenas individualmente
 * elegiveis. PASS_WITH_OBSERVATIONS segue a politica conservadora ja
 * existente no resto do sistema (observacao nao-bloqueante) - nunca bloqueia
 * sozinho.
 */
export function evaluateCampaignExecutionReadiness(
  scenes: SceneRunnerPlan[],
  narrationPlan: NarrationPlan | null,
  creativeQualityGateStatus?: CreativeQualityStatus | null,
  commercialPersuasionGateStatus?: PersuasionCheckStatus | null,
): CampaignExecutionReadiness {
  const sceneReadiness = scenes
    .map(classifyScene)
    .filter((entry): entry is SceneExecutionReadiness => entry !== null);

  const blockedScenes = sceneReadiness.filter((entry) => entry.status === "BLOCKED");
  const reasons = blockedScenes.map((entry) => `${entry.sceneId}: ${entry.reason}`);

  let status: CampaignExecutionReadinessStatus = "READY";

  if (blockedScenes.length > 0) {
    status = blockedScenes[0].blockedReason ?? "BLOCKED_OTHER";
  } else if (narrationPlan && narrationPlan.status === "BLOCKED") {
    status = "BLOCKED_NARRATION";
    reasons.push("NarrationPlan global esta BLOCKED (ver narrationPlan.scenes para o motivo exato por cena) - nenhuma sintese real deve ocorrer.");
  } else if (creativeQualityGateStatus === "FAIL") {
    status = "BLOCKED_CREATIVE_QUALITY";
    reasons.push("Creative Director V2 storyboardQualityGate esta FAIL - a direcao criativa nao atinge o padrao minimo antes de qualquer chamada paga (ver commercialDirectionV2.storyboardQualityGate).");
  } else if (commercialPersuasionGateStatus === "FAIL") {
    status = "BLOCKED_COMMERCIAL_PERSUASION";
    reasons.push("Commercial Persuasion Quality Gate esta FAIL - a estrategia de desejo/persuasao nao atinge os thresholds validados antes de qualquer chamada paga (ver commercialPersuasion.persuasionStrategy.qualityGate).");
  }

  return {
    status,
    canProduceFinalCommercial: status === "READY",
    scenes: sceneReadiness,
    reasons,
  };
}

// --- Provider Coverage Matrix -----------------------------------------

export type ProviderCoverageEntry = {
  provider: string;
  status: ProviderCapabilityProfile["status"];
  productionEligible: boolean;
  // ACTIVE + productionEligible - o unico caso realmente selecionavel
  // por um EXECUTE de producao hoje.
  selectableForExecute: boolean;
  costModel: ProviderCapabilityProfile["costModel"];
  usdCostModel: ProviderCapabilityProfile["usdCostModel"];
  notes: string;
};

export type CapabilityCoverage = {
  capability: GenerationCapability;
  providers: ProviderCoverageEntry[];
  // Nenhum provider registrado para esta capability e selectableForExecute.
  hasProductionGap: boolean;
};

/**
 * Matriz completa (todas as capabilities pedidas) - pensada pra
 * responder rapido "o que falta pra fabrica conseguir produzir sozinha".
 * Nunca chama nenhum provider - so le o registro estatico.
 */
export function buildProviderCoverageMatrix(capabilities: GenerationCapability[]): CapabilityCoverage[] {
  return capabilities.map((capability) => {
    const profiles = getProvidersForCapability(capability);
    const providers: ProviderCoverageEntry[] = profiles.map((profile) => ({
      provider: profile.provider,
      status: profile.status,
      productionEligible: profile.productionEligible,
      selectableForExecute: profile.status === "ACTIVE" && profile.productionEligible === true,
      costModel: profile.costModel,
      usdCostModel: profile.usdCostModel ?? null,
      notes: profile.notes,
    }));

    return {
      capability,
      providers,
      hasProductionGap: !providers.some((p) => p.selectableForExecute),
    };
  });
}
