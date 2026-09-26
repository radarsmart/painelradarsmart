import { decideProductGenerationStrategy } from "@/lib/generation-orchestrator/product-generation-strategy";
import { getProductionEligibleProvidersForCapability, isProviderProductionEligible } from "@/lib/generation-orchestrator/provider-capabilities";
import type { OverlayInstructions } from "@/lib/prompt-builder/types";
import type { CommercialQualityIssueCategory, OfferQualitySnapshot, SceneQualityResult } from "@/lib/commercial-video/quality/types";
import type { SceneRepairAction, RepairStrategy, SceneRepairContext } from "@/lib/commercial-video/repair/types";
import type { SceneRunnerPlan } from "@/lib/commercial-video/runner/types";

const OBJECTIVE_REGENERATE_CATEGORIES = new Set<CommercialQualityIssueCategory>([
  "GENERATED_CONTENT_CONTAMINATION",
  "GENERATED_DISCOUNT",
  "GENERATED_PRICE",
  "PRODUCT_LABEL_MUTATION",
  "BRAND_MUTATION",
  "PRODUCT_MUTATION",
  "INVALID_DISCOUNT_OVERLAY",
]);

const OBJECTIVE_TEXT_BACKGROUND_CATEGORIES = new Set<CommercialQualityIssueCategory>([
  "GENERATED_TEXT",
  "GENERATED_LOGO",
  "BRAND_MUTATION",
]);

export function buildEffectiveRepairOverlays(base: OverlayInstructions, offer: OfferQualitySnapshot): OverlayInstructions {
  const hasDiscount = (offer.discountPercent ?? 0) > 0;
  return {
    ...base,
    priceText: base.priceText ? offer.priceText : null,
    discountText: base.discountText && hasDiscount ? offer.discountText : null,
  };
}

function hasBlockingObjectiveIssue(quality: SceneQualityResult): boolean {
  return quality.issues.some((issue) => issue.severity === "BLOCKING" && OBJECTIVE_REGENERATE_CATEGORIES.has(issue.category));
}

function hasObjectiveBackgroundTextIssue(quality: SceneQualityResult): boolean {
  return quality.issues.some((issue) => OBJECTIVE_TEXT_BACKGROUND_CATEGORIES.has(issue.category) && issue.severity === "BLOCKING");
}

export function chooseRepairAction(scene: SceneRunnerPlan, quality: SceneQualityResult): SceneRepairAction {
  if (quality.status === "PASS" && quality.reuseDecision === "REUSABLE" && quality.commercialReusable) return "REUSE";
  if (quality.reuseDecision === "NOT_REUSABLE") return "REGENERATE";
  if (hasBlockingObjectiveIssue(quality)) return "REGENERATE";
  if (scene.providerCapability === "TEXT_TO_VIDEO" && hasObjectiveBackgroundTextIssue(quality)) return "REGENERATE";
  if (quality.reuseDecision === "REVIEW_REQUIRED" || quality.status === "PASS_WITH_OBSERVATIONS") return "REVIEW_REQUIRED";
  if (quality.status === "FAIL") return "BLOCKED";
  return "REVIEW_REQUIRED";
}

function providerForStrategy(strategy: RepairStrategy, currentProvider: string | null): string | null {
  if (strategy === "HYBRID_PRODUCT_COMPOSITE") {
    return getProductionEligibleProvidersForCapability("TEXT_TO_VIDEO")[0]?.provider ?? null;
  }
  return currentProvider;
}

export function chooseRepairStrategy(input: {
  scene: SceneRunnerPlan;
  quality: SceneQualityResult;
  action: SceneRepairAction;
  context: SceneRepairContext | null;
}): { strategy: RepairStrategy; provider: string | null; providerProductionEligible: boolean; blockingReasons: string[] } {
  if (input.context?.humanReviewResolution) {
    const provider = input.context.providerOverride ?? providerForStrategy(input.context.humanReviewResolution.repairStrategy, input.scene.selectedProvider ?? null);
    return {
      strategy: input.context.humanReviewResolution.repairStrategy,
      provider,
      providerProductionEligible: provider ? isProviderProductionEligible(provider) : false,
      blockingReasons: provider && isProviderProductionEligible(provider) ? [] : [`Provider ${provider ?? "null"} nao esta productionEligible para repair.`],
    };
  }

  if (input.action === "REUSE") {
    const provider = input.scene.selectedProvider ?? null;
    return { strategy: "KEEP_CURRENT", provider, providerProductionEligible: provider ? isProviderProductionEligible(provider) : false, blockingReasons: [] };
  }
  if (input.action === "REVIEW_REQUIRED") {
    const provider = input.scene.selectedProvider ?? null;
    return { strategy: "KEEP_CURRENT", provider, providerProductionEligible: provider ? isProviderProductionEligible(provider) : false, blockingReasons: [] };
  }

  let strategy: RepairStrategy = input.scene.productGenerationStrategy ?? "KEEP_CURRENT";
  if (input.scene.providerCapability === "TEXT_TO_VIDEO" && hasObjectiveBackgroundTextIssue(input.quality)) {
    strategy = "PROMPT_RESTRICT_TEXT";
  }

  if (input.scene.providerCapability === "PRODUCT_VIDEO" && input.context?.productStrategyInput) {
    strategy = decideProductGenerationStrategy(input.context.productStrategyInput) ?? "KEEP_CURRENT";
  }

  const provider = input.context?.providerOverride ?? providerForStrategy(strategy, input.scene.selectedProvider ?? null);
  const providerProductionEligible = provider ? isProviderProductionEligible(provider) : false;
  const blockingReasons = providerProductionEligible ? [] : [`Provider ${provider ?? "null"} nao esta productionEligible para repair.`];
  return { strategy, provider, providerProductionEligible, blockingReasons };
}
