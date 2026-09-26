import type { GenerationCostEstimate } from "@/lib/generation-orchestrator/types";
import type { ProductGenerationStrategy, ProductGenerationStrategyInput } from "@/lib/generation-orchestrator/product-generation-strategy";
import type { OverlayInstructions, SceneMediaType } from "@/lib/prompt-builder/types";
import type { CommercialGenerationResult, SceneRunnerPlan } from "@/lib/commercial-video/runner/types";
import type { CommercialQualityResult, SceneQualityResult } from "@/lib/commercial-video/quality/types";

export type SceneRepairAction = "REUSE" | "REGENERATE" | "REVIEW_REQUIRED" | "BLOCKED";

export type RepairStrategy =
  | "KEEP_CURRENT"
  | "PROMPT_RESTRICT_TEXT"
  | "STRICT_BACKGROUND_REGENERATION"
  | ProductGenerationStrategy;

export type HumanReviewEvidenceLevel = "OBJECTIVE" | "INSUFFICIENT";

export type HumanReviewResolution = {
  decision: SceneRepairAction;
  commercialReusable: boolean;
  repairStrategy: RepairStrategy;
  evidenceLevel: HumanReviewEvidenceLevel;
  reasons: string[];
  promptGuards?: string[];
};

export type SceneRepairContext = {
  sceneId: string;
  mediaType?: SceneMediaType;
  productStrategyInput?: ProductGenerationStrategyInput;
  baseOverlays?: OverlayInstructions;
  providerOverride?: string;
  humanReviewResolution?: HumanReviewResolution;
};

export type SceneRepairPlan = {
  sceneId: string;
  currentProvider: string | null;
  currentAsset: SceneRunnerPlan["existingAsset"];
  qualityStatus: SceneQualityResult["status"];
  previousReuseDecision: SceneQualityResult["reuseDecision"];
  reasons: string[];
  action: SceneRepairAction;
  recommendedStrategy: RepairStrategy;
  provider: string | null;
  providerProductionEligible: boolean;
  estimatedCost: GenerationCostEstimate | null;
  reuseNarration: boolean;
  effectiveOverlays: OverlayInstructions;
  promptGuards: string[];
  repairFingerprint: string;
  canAutoRepair: boolean;
  blockingReasons: string[];
};

export type RepairCostSummary = {
  wanCredits: number;
  klingCredits: number;
  heygenUsdCents: number;
  elevenLabsCredits: number;
  unknownCostScenes: string[];
};

export type CommercialRepairPlan = {
  campaignId: string;
  sourceJobId: string | null;
  sourceQualityResult: CommercialQualityResult["status"];
  scenes: SceneRepairPlan[];
  estimatedNewCosts: RepairCostSummary;
  canAutoRepair: boolean;
  blockingReasons: string[];
};

export type CommercialRepairPlannerInput = {
  runnerResult: CommercialGenerationResult;
  qualityResult: CommercialQualityResult;
  sourceJobId?: string | null;
  sceneContexts?: SceneRepairContext[];
};
