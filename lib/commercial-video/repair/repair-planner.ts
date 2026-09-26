import { buildRepairFingerprint } from "@/lib/commercial-video/repair/repair-fingerprint";
import { estimateRepairSceneCost, summarizeRepairCosts } from "@/lib/commercial-video/repair/repair-cost-estimator";
import { assessRepairReadiness } from "@/lib/commercial-video/repair/repair-readiness";
import { buildEffectiveRepairOverlays, chooseRepairAction, chooseRepairStrategy } from "@/lib/commercial-video/repair/scene-repair-policy";
import type { OverlayInstructions } from "@/lib/prompt-builder/types";
import type { OfferQualitySnapshot } from "@/lib/commercial-video/quality/types";
import type { CommercialRepairPlannerInput, CommercialRepairPlan, SceneRepairContext, SceneRepairPlan } from "@/lib/commercial-video/repair/types";

const EMPTY_OVERLAYS: OverlayInstructions = { priceText: null, discountText: null, ctaText: null };

function contextFor(sceneId: string, contexts: SceneRepairContext[] | undefined): SceneRepairContext | null {
  return contexts?.find((context) => context.sceneId === sceneId) ?? null;
}

function inferOfferFromQuality(input: CommercialRepairPlannerInput): OfferQualitySnapshot {
  const priceIssue = input.qualityResult.offerConsistency.issues.find((issue) => issue.category === "PRICE_MISMATCH");
  void priceIssue;
  return {
    price: null,
    priceText: null,
    originalPrice: null,
    discountPercent: null,
    discountText: null,
  };
}

export function planCommercialRepair(input: CommercialRepairPlannerInput & { offer?: OfferQualitySnapshot }): CommercialRepairPlan {
  const offer = input.offer ?? inferOfferFromQuality(input);

  const scenes: SceneRepairPlan[] = input.runnerResult.scenes.map((scene) => {
    const quality = input.qualityResult.sceneResults.find((entry) => entry.sceneId === scene.sceneId);
    if (!quality) {
      const effectiveOverlays = buildEffectiveRepairOverlays(EMPTY_OVERLAYS, offer);
      return {
        sceneId: scene.sceneId,
        currentProvider: scene.selectedProvider ?? null,
        currentAsset: scene.existingAsset,
        qualityStatus: "FAIL",
        previousReuseDecision: "NOT_REUSABLE",
        reasons: ["Cena sem SceneQualityResult no CommercialQualityResult."],
        action: "BLOCKED",
        recommendedStrategy: "KEEP_CURRENT",
        provider: scene.selectedProvider ?? null,
        providerProductionEligible: false,
        estimatedCost: null,
        reuseNarration: false,
        effectiveOverlays,
        promptGuards: [],
        repairFingerprint: buildRepairFingerprint({
          originalFingerprint: null,
          qualityFailureReasons: ["missing quality result"],
          repairStrategy: "KEEP_CURRENT",
          effectiveOverlays,
          provider: scene.selectedProvider ?? null,
          promptGuards: [],
        }),
        canAutoRepair: false,
        blockingReasons: ["Cena sem SceneQualityResult no CommercialQualityResult."],
      };
    }

    const sceneContext = contextFor(scene.sceneId, input.sceneContexts);
    const action = sceneContext?.humanReviewResolution?.decision ?? chooseRepairAction(scene, quality);
    const strategy = chooseRepairStrategy({ scene, quality, action, context: sceneContext });
    const narrationTiming = input.qualityResult.narrationConsistency.sceneTimings.find((timing) => timing.sceneId === scene.sceneId);
    const reuseNarration = input.qualityResult.narrationConsistency.status === "PASS" && narrationTiming?.status === "PASS";
    const baseOverlays = sceneContext?.baseOverlays ?? EMPTY_OVERLAYS;
    const effectiveOverlays = buildEffectiveRepairOverlays(baseOverlays, offer);
    const executedDuration = input.runnerResult.sceneExecutionRecords.find((record) => record.sceneId === scene.sceneId)?.durationSeconds ?? null;
    const repairDuration = executedDuration ?? narrationTiming?.sceneDurationSeconds ?? 0;
    const cost = action === "REGENERATE" ? estimateRepairSceneCost(strategy.provider, repairDuration) : null;
    const originalFingerprint =
      input.runnerResult.sceneExecutionRecords.find((record) => record.sceneId === scene.sceneId)?.fingerprint ?? null;
    const reasons = [...quality.reasons, ...quality.observations, ...(sceneContext?.humanReviewResolution?.reasons ?? [])];
    const unknownCost = action === "REGENERATE" && (!cost || cost.costUnit === "UNKNOWN");
    const blockingReasons = [
      ...strategy.blockingReasons,
      ...(unknownCost ? [`Custo novo desconhecido para cena ${scene.sceneId}.`] : []),
      ...(!reuseNarration ? [`Narracao da cena ${scene.sceneId} nao pode ser reutilizada automaticamente.`] : []),
    ];

    return {
      sceneId: scene.sceneId,
      currentProvider: scene.selectedProvider ?? null,
      currentAsset: scene.existingAsset,
      qualityStatus: quality.status,
      previousReuseDecision: quality.reuseDecision,
      reasons,
      action,
      recommendedStrategy: strategy.strategy,
      provider: strategy.provider,
      providerProductionEligible: strategy.providerProductionEligible,
      estimatedCost: cost,
      reuseNarration,
      effectiveOverlays,
      promptGuards: sceneContext?.humanReviewResolution?.promptGuards ?? [],
      repairFingerprint: buildRepairFingerprint({
        originalFingerprint,
        qualityFailureReasons: reasons,
        repairStrategy: strategy.strategy,
        effectiveOverlays,
        provider: strategy.provider,
        promptGuards: sceneContext?.humanReviewResolution?.promptGuards ?? [],
      }),
      canAutoRepair: action === "REGENERATE" && blockingReasons.length === 0,
      blockingReasons,
    };
  });

  const readiness = assessRepairReadiness(scenes);

  return {
    campaignId: input.runnerResult.campaignId,
    sourceJobId: input.sourceJobId ?? null,
    sourceQualityResult: input.qualityResult.status,
    scenes,
    estimatedNewCosts: summarizeRepairCosts(scenes),
    canAutoRepair: readiness.canAutoRepair,
    blockingReasons: readiness.blockingReasons,
  };
}
