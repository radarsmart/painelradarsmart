import { planCommercialRepair } from "@/lib/commercial-video/repair/repair-planner";
import type { CommercialGenerationResult, SceneRunnerPlan } from "@/lib/commercial-video/runner/types";
import type { CommercialQualityIssueCategory, CommercialQualityResult, OfferQualitySnapshot, SceneQualityResult } from "@/lib/commercial-video/quality/types";
import type { CommercialRepairPlan, HumanReviewResolution, SceneRepairContext } from "@/lib/commercial-video/repair/types";

export const STRICT_BACKGROUND_REGENERATION_PROMPT_GUARDS = [
  "no products",
  "no packages",
  "no bottles",
  "no text",
  "no typography",
  "no logos",
  "no brands",
  "no prices",
  "no discount labels",
  "no watermarks",
] as const;

const BACKGROUND_CONTAMINATION_CATEGORIES = new Set<CommercialQualityIssueCategory>([
  "GENERATED_TEXT",
  "GENERATED_LOGO",
  "GENERATED_PRICE",
  "GENERATED_DISCOUNT",
  "BRAND_MUTATION",
  "GENERATED_CONTENT_CONTAMINATION",
]);

const CHARACTER_REGENERATION_CATEGORIES = new Set<CommercialQualityIssueCategory>([
  "CTA_TRUNCATED",
  "PRODUCT_MUTATION",
  "BRAND_MUTATION",
  "GENERATED_CONTENT_CONTAMINATION",
]);

function qualityForScene(qualityResult: CommercialQualityResult, sceneId: string): SceneQualityResult | null {
  return qualityResult.sceneResults.find((scene) => scene.sceneId === sceneId) ?? null;
}

function hasIssueCategory(quality: SceneQualityResult, categories: Set<CommercialQualityIssueCategory>): boolean {
  return quality.issues.some((issue) => categories.has(issue.category));
}

function hasCharacterObjectiveFailure(quality: SceneQualityResult): boolean {
  return quality.issues.some((issue) => issue.severity === "BLOCKING" && CHARACTER_REGENERATION_CATEGORIES.has(issue.category));
}

function narrationTimingPasses(qualityResult: CommercialQualityResult, sceneId: string): boolean {
  return qualityResult.narrationConsistency.sceneTimings.find((timing) => timing.sceneId === sceneId)?.status === "PASS";
}

function resolveSceneReview(scene: SceneRunnerPlan, qualityResult: CommercialQualityResult): HumanReviewResolution | null {
  const quality = qualityForScene(qualityResult, scene.sceneId);
  if (!quality || quality.reuseDecision !== "REVIEW_REQUIRED") return null;

  if (scene.providerCapability === "TEXT_TO_VIDEO" && scene.purpose === "HOOK") {
    if (hasIssueCategory(quality, BACKGROUND_CONTAMINATION_CATEGORIES)) {
      return {
        decision: "REGENERATE",
        commercialReusable: false,
        repairStrategy: "STRICT_BACKGROUND_REGENERATION",
        evidenceLevel: "OBJECTIVE",
        reasons: [
          "HOOK/TEXT_TO_VIDEO tinha evidencia registrada de contaminacao visual; cena de background nao deve conter produto, embalagem, texto, logo, preco ou desconto.",
        ],
        promptGuards: [...STRICT_BACKGROUND_REGENERATION_PROMPT_GUARDS],
      };
    }

    return {
      decision: "REVIEW_REQUIRED",
      commercialReusable: false,
      repairStrategy: "KEEP_CURRENT",
      evidenceLevel: "INSUFFICIENT",
      reasons: ["Sem evidencia objetiva suficiente para decidir REUSE ou REGENERATE em cena HOOK/TEXT_TO_VIDEO."],
    };
  }

  if (scene.providerCapability === "CHARACTER_VIDEO") {
    if (hasCharacterObjectiveFailure(quality)) {
      return {
        decision: "REGENERATE",
        commercialReusable: false,
        repairStrategy: "KEEP_CURRENT",
        evidenceLevel: "OBJECTIVE",
        reasons: ["CHARACTER_VIDEO tem falha objetiva registrada no QA."],
      };
    }

    if (narrationTimingPasses(qualityResult, scene.sceneId)) {
      return {
        decision: "REUSE",
        commercialReusable: true,
        repairStrategy: "KEEP_CURRENT",
        evidenceLevel: "OBJECTIVE",
        reasons: ["Narration timing passou e nao ha CTA_TRUNCATED/falha objetiva registrada; asset pode ser reutilizado sem nova chamada HeyGen."],
      };
    }
  }

  return {
    decision: "REVIEW_REQUIRED",
    commercialReusable: false,
    repairStrategy: "KEEP_CURRENT",
    evidenceLevel: "INSUFFICIENT",
    reasons: ["Review required mantido por falta de evidencia objetiva suficiente."],
  };
}

export function resolveHumanReviewRepairPlan(input: {
  runnerResult: CommercialGenerationResult;
  qualityResult: CommercialQualityResult;
  offer: OfferQualitySnapshot;
  sourceJobId?: string | null;
  sceneContexts?: SceneRepairContext[];
}): { sceneContexts: SceneRepairContext[]; repairPlan: CommercialRepairPlan; readyForRepairExecute: boolean } {
  const sceneContextsById = new Map<string, SceneRepairContext>();
  for (const context of input.sceneContexts ?? []) {
    sceneContextsById.set(context.sceneId, { ...context });
  }

  for (const scene of input.runnerResult.scenes) {
    const resolution = resolveSceneReview(scene, input.qualityResult);
    if (!resolution) continue;
    const existing = sceneContextsById.get(scene.sceneId) ?? { sceneId: scene.sceneId };
    sceneContextsById.set(scene.sceneId, { ...existing, humanReviewResolution: resolution });
  }

  const sceneContexts = [...sceneContextsById.values()];
  const repairPlan = planCommercialRepair({
    runnerResult: input.runnerResult,
    qualityResult: input.qualityResult,
    sourceJobId: input.sourceJobId,
    offer: input.offer,
    sceneContexts,
  });

  return { sceneContexts, repairPlan, readyForRepairExecute: repairPlan.canAutoRepair };
}
