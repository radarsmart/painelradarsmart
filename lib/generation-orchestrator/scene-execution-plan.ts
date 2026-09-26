// Radar Creative AI - Generation Orchestrator / Scene Execution Plan
//
// Compositor PURO de UMA cena: recebe o SceneGenerationPrompt (do Prompt
// Builder) + as referencias ja resolvidas (URLs reais, resolvidas por
// reference-resolver.ts) e devolve o SceneExecutionPlan completo. Nao
// chama Supabase nem provider nenhum.

import { mapSceneToCapability } from "@/lib/generation-orchestrator/capability-map";
import { selectProvider } from "@/lib/generation-orchestrator/provider-selector";
import { estimateSceneCost } from "@/lib/generation-orchestrator/cost-estimator";
import { validateSceneForGeneration } from "@/lib/generation-orchestrator/guardrails";
import { evaluateCapabilityFidelityFit } from "@/lib/generation-orchestrator/capability-fidelity-gate";
import { upgradeToStrictIntegrityPrompt } from "@/lib/prompt-builder/product-integrity-mode";
import { promoteProductFidelityRequirementByReferenceQuality } from "@/lib/prompt-builder/product-fidelity-requirement";
import {
  buildHybridCompositePlan,
  decideProductGenerationStrategy,
} from "@/lib/generation-orchestrator/product-generation-strategy";
import type {
  GenerationCapability,
  NormalizedGenerationRequest,
  ResolvedSceneReferences,
  SceneExecutionPlan,
} from "@/lib/generation-orchestrator/types";
import type { SceneGenerationPrompt } from "@/lib/prompt-builder/types";

const CHARACTER_CAPABILITIES = new Set(["CHARACTER_IMAGE", "CHARACTER_VIDEO"]);

export function buildSceneExecutionPlan(
  scene: SceneGenerationPrompt,
  resolvedRefs: ResolvedSceneReferences,
): SceneExecutionPlan {
  const baseCapability = mapSceneToCapability(scene);

  // Generation Strategy Router (ver product-generation-strategy.ts):
  // aprendizado dos CANARY #3/#4 (Invictus) - quando a cena ja exigiria
  // preservacao forte de embalagem E a referencia disponivel tem
  // fidelityRisk HIGH, nao insistimos mais em image-to-video puramente
  // generativo (PRESERVE_PACKAGE_STRICT ja foi tentado e falhou). A
  // estrategia HYBRID_PRODUCT_COMPOSITE troca a capability real para
  // TEXT_TO_VIDEO (gerar so o fundo/ambiente, sem imagem do produto) -
  // reaproveita uma capability/provider JA existente (freepik-kling-t2v,
  // com custo real conhecido) em vez de inventar uma capability nova sem
  // modelo de custo.
  const productGenerationStrategy = decideProductGenerationStrategy({
    mediaType: scene.mediaType,
    productIntegrityRisk: scene.productIntegrityRisk,
    fidelityRisk: resolvedRefs.productReferenceQuality?.fidelityRisk ?? null,
    hasProductReference: Boolean(resolvedRefs.productReferenceUrl),
  });

  const isHybrid = productGenerationStrategy === "HYBRID_PRODUCT_COMPOSITE";

  const hybridCompositePlan =
    isHybrid && resolvedRefs.productReferenceUrl
      ? buildHybridCompositePlan({
          productReferenceUrl: resolvedRefs.productReferenceUrl,
          environment: scene.environment,
          visualStyle: scene.visualStyle,
          lighting: scene.lighting,
          safeAreaDirection: scene.safeAreaDirection,
          overlayInstructions: scene.overlayInstructions,
        })
      : null;

  const capability: GenerationCapability = hybridCompositePlan ? "TEXT_TO_VIDEO" : baseCapability;
  const needsIdentityReference = CHARACTER_CAPABILITIES.has(capability);

  const { selectedProvider, fallbackProviders } = selectProvider(capability, {
    needsIdentityReference,
  });

  const estimatedCost = estimateSceneCost(selectedProvider, scene.durationSeconds);

  // Product Reference Quality Gate (ver product-reference-quality.ts): o
  // Prompt Builder so decide ate PRESERVE_PACKAGE (nao tem acesso aos
  // bytes reais da imagem). PRESERVE_PACKAGE_STRICT so e aplicado aqui
  // quando a estrategia escolhida NAO for HYBRID - sob HYBRID, o produto
  // nem e enviado ao provider generativo, entao promover o texto do
  // prompt para STRICT seria irrelevante (o CANARY #4 ja mostrou que nem
  // ajuda). Custo NAO muda por causa do modo (estimatedCost acima ja foi
  // calculado so por provider+duracao).
  const recommendedMode = resolvedRefs.productReferenceQuality?.recommendedIntegrityMode ?? scene.productIntegrityMode;
  const shouldUpgradeToStrict =
    !isHybrid && recommendedMode === "PRESERVE_PACKAGE_STRICT" && scene.productIntegrityMode !== "PRESERVE_PACKAGE_STRICT";

  const effectiveProductIntegrityMode = shouldUpgradeToStrict ? "PRESERVE_PACKAGE_STRICT" : scene.productIntegrityMode;
  const { positivePrompt: strictPositivePrompt, negativePrompt: strictNegativePrompt } = shouldUpgradeToStrict
    ? upgradeToStrictIntegrityPrompt(scene.positivePrompt, scene.negativePrompt)
    : { positivePrompt: scene.positivePrompt, negativePrompt: scene.negativePrompt };

  // Subject-Aware Capability Routing V1 (ver capability-fidelity-gate.ts):
  // mesma promocao STRICT de productIntegrityMode acima, aplicada ao
  // fidelityRequirement decidido pelo Prompt Builder - so promove quando a
  // referencia real disponivel tem fidelityRisk HIGH.
  const effectiveProductFidelityRequirement = promoteProductFidelityRequirementByReferenceQuality(
    scene.productFidelityRequirement,
    resolvedRefs.productReferenceQuality?.fidelityRisk ?? null,
  );

  // providerRequest e o que de fato SERIA enviado ao provider - sob
  // HYBRID isso e o prompt de FUNDO (nunca descreve o produto), e a
  // referencia de produto nunca vai para o provider generativo (fica so
  // em hybridCompositePlan/productReferenceUrl, para um futuro
  // compositor). plan.positivePrompt/negativePrompt abaixo continuam
  // sendo o registro criativo completo da cena (audit trail do Prompt
  // Builder), mesmo quando HYBRID muda o que realmente seria enviado.
  const providerRequest: NormalizedGenerationRequest = {
    capability,
    prompt: hybridCompositePlan ? hybridCompositePlan.backgroundGenerationPrompt : strictPositivePrompt,
    negativePrompt: hybridCompositePlan ? hybridCompositePlan.backgroundNegativePrompt : strictNegativePrompt,
    aspectRatio: scene.aspectRatio,
    durationSeconds: scene.durationSeconds,
    references: {
      identity: resolvedRefs.identityReferenceUrl,
      support: resolvedRefs.supportReferenceUrl,
      product: hybridCompositePlan ? null : resolvedRefs.productReferenceUrl,
    },
    motion: hybridCompositePlan ? hybridCompositePlan.cameraMotion : scene.movement,
    quality: "standard",
  };

  const plan: SceneExecutionPlan = {
    sceneId: scene.sceneId,
    sceneOrder: scene.sceneOrder,
    mediaType: scene.mediaType,

    providerCapability: capability,

    selectedProvider,
    fallbackProviders,

    // Registro criativo da cena (audit trail do Prompt Builder, com o
    // upgrade STRICT aplicado quando relevante) - NUNCA o que foi de fato
    // enviado ao provider quando HYBRID (isso e providerRequest.prompt
    // acima, o prompt de fundo).
    positivePrompt: strictPositivePrompt,
    negativePrompt: strictNegativePrompt,

    identityReferenceAssetId: scene.identityReferenceAssetId,
    identityReferenceUrl: resolvedRefs.identityReferenceUrl,
    // NUNCA scene.supportReferenceAssetId aqui - aquele e o escolhido pelo
    // Commercial Director so para planejamento/preview. O valor autoritativo
    // para geracao real e o que reference-resolver.ts reselecionou exigindo
    // generationSafe=true (pode ser null se nao houver suporte seguro).
    supportReferenceAssetId: resolvedRefs.supportReferenceAssetId,
    supportReferenceUrl: resolvedRefs.supportReferenceUrl,
    productReferenceUrl: resolvedRefs.productReferenceUrl,

    durationSeconds: scene.durationSeconds,
    aspectRatio: scene.aspectRatio,

    providerRequest,

    overlayInstructions: scene.overlayInstructions,
    safeAreaDirection: scene.safeAreaDirection,

    productIntegrityRisk: scene.productIntegrityRisk,
    productIntegrityMode: effectiveProductIntegrityMode,
    productReferenceQuality: resolvedRefs.productReferenceQuality,

    productFidelityRequirement: effectiveProductFidelityRequirement,
    capabilityFidelityBlocked: false,

    productGenerationStrategy,
    hybridCompositePlan,

    estimatedCost,

    status: "READY",
    statusReason: null,
  };

  // Capability Fidelity Gate (item 9 do pedido) - ANTES de
  // validateSceneForGeneration de proposito: um bloqueio estrutural de
  // fidelidade de produto merece um motivo/eligibility PROPRIO
  // (BLOCKED_CAPABILITY_FIDELITY, ver execution-readiness.ts), nao cair no
  // balde generico de BLOCKED_VALIDATION.
  const fidelityFit = evaluateCapabilityFidelityFit({
    productFidelityRequirement: effectiveProductFidelityRequirement,
    capability,
    isHybridComposite: isHybrid,
  });
  if (!fidelityFit.ok) {
    return { ...plan, status: "FAILED", statusReason: fidelityFit.reason, capabilityFidelityBlocked: true };
  }

  const validation = validateSceneForGeneration(plan);
  if (!validation.ok) {
    return { ...plan, status: "FAILED", statusReason: validation.reason };
  }

  return plan;
}
