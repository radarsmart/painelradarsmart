import type { CommercialDirection } from "@/lib/commercial-director/types";
import type { CampaignExecutionPlan, GenerationCapability } from "@/lib/generation-orchestrator/types";
import type { CampaignPromptPlan } from "@/lib/prompt-builder/types";

export type CommercialCreationMode =
  | "PRODUCT_COMMERCIAL"
  | "PRESENTER_UGC"
  | "HYBRID_SALES"
  | "TREND_REFERENCE_REMIX";

export type CommercialContractApprovalState =
  | "DRAFT"
  | "READY_FOR_REVIEW"
  | "APPROVED_FOR_GENERATION"
  | "REJECTED";

export type CommercialPrimaryObjective =
  | "PRODUCT_SALE"
  | "SALES"
  | "TRAFFIC"
  | "VIP_GROUP"
  | "ENGAGEMENT"
  | "CUSTOM";

export type PresenterPreference =
  | "AUTO"
  | "NO_PRESENTER"
  | "HOOK_AND_CTA"
  | "PRESENTER_LED";

export type ProductUsagePreference =
  | "AUTO"
  | "PACKSHOT_FIRST"
  | "DEMONSTRATE_USE"
  | "HOLD_AND_POINT"
  | "NO_USAGE_DEMO";

export type CommercialTargetDuration = 10 | 15 | 20 | 30 | number;

export type ReferenceVideoContract = {
  sourceUrl: string | null;
  sourceLabel: string | null;
  preserveStructure: boolean;
  preservePacing: boolean;
  preserveHookMechanism: boolean;
  preserveCameraLanguage: boolean;
  preserveProductPresentationMechanism: boolean;
  preserveCtaMechanism: boolean;
};

export type CommercialCreativeContract = {
  productId: string;
  campaignId: string;
  creationMode: CommercialCreationMode;
  userPrompt: string;
  targetDuration: CommercialTargetDuration;
  tone: string;
  visualStyle: string;
  primaryObjective: CommercialPrimaryObjective;
  callToActions: string[];
  mustShow: string[];
  mustSay: string[];
  mustAvoid: string[];
  presenterPreference: PresenterPreference;
  productUsagePreference: ProductUsagePreference;
  referenceVideo?: ReferenceVideoContract | null;
};

export type CreativeDNA = {
  source: "REFERENCE_A" | "REFERENCE_B" | "USER_REFERENCE_URL";
  durationSeconds: number;
  hookMechanism: string;
  pacing: "FAST" | "MEDIUM" | "CINEMATIC";
  averageShotLengthSeconds: number;
  presenterUsage: string;
  presenterContinuity: string;
  productFirstAppearanceSecond: number;
  productUsageDemonstration: string;
  shotSequence: string[];
  cameraSequence: string[];
  motionSequence: string[];
  offerTimingSecond: number | null;
  ctaTimingSecond: number;
  emotionalArc: string[];
  narrativePattern: string;
  visualEnergy: "LOW" | "MEDIUM" | "HIGH";
};

export type CreativeRemixGuard = {
  status: "PASS" | "PASS_WITH_OBSERVATIONS" | "FAIL";
  preservedMechanics: string[];
  replacedSpecifics: string[];
  blockedCloneRisks: string[];
  notes: string[];
};

export type SceneCostPreview = {
  estimatedVideoCredits: number | null;
  estimatedTtsCredits: number | null;
  estimatedCurrencyCostCents: number | null;
  estimatedUsdCostCents: number | null;
};

export type CommercialStoryboardPreviewScene = {
  sceneId: string;
  sceneNumber: number;
  purpose: string;
  durationSeconds: number;
  commercialObjective: string;
  visual: string;
  environment: string;
  productAppearance: string;
  productUse: string;
  garotaRadarAppearance: "NONE" | "HOOK" | "DEMO" | "CTA" | "FULL";
  garotaRadarRole: string;
  garotaRadarAction: string;
  camera: string;
  motion: string;
  sceneInstruction: string;
  spokenNarration: string;
  narration: string;
  overlay: string | null;
  price: string | null;
  cta: string | null;
  whyThisSceneExists: string;
  whyViewerKeepsWatching: string;
  estimatedCapability: GenerationCapability;
  estimatedProvider: string;
  cost: SceneCostPreview;
  conflictNotes: string[];
};

export type CommercialStoryboardPreview = {
  contract: CommercialCreativeContract;
  approvalState: CommercialContractApprovalState;
  storyboardFingerprint: string;
  creationTrace: {
    requestedCreationMode: CommercialCreationMode;
    resolvedCreationMode: CommercialCreationMode;
    requestedPresenterPreference: PresenterPreference;
    resolvedPresenterStrategy: string;
    userPrompt: string;
    targetDuration: number;
    primaryObjective: CommercialPrimaryObjective;
    callToActions: string[];
    conflictReason: string | null;
    legacyCopySourcesUsed: false;
  };
  creativeDna: CreativeDNA | null;
  remixGuard: CreativeRemixGuard | null;
  commercialDirection: CommercialDirection;
  promptPlan: CampaignPromptPlan;
  generationPlan: CampaignExecutionPlan;
  scenes: CommercialStoryboardPreviewScene[];
  totals: {
    estimatedVideoCredits: number | null;
    estimatedTtsCredits: number | null;
    estimatedCurrencyCostCents: number | null;
    estimatedUsdCostCents: number | null;
  };
  optimizerAudit: {
    desireEngineVersion: "V1";
    appliedWithinContract: boolean;
    selectedHookVariant: string | null;
    conflicts: string[];
    qualityGateStatus: string;
    notes: string[];
  };
  dryRunGenerationPlanReady: boolean;
};

export type CommercialCreationOfferInput = {
  id: string;
  title: string;
  category: string;
  price: number | null;
  originalPrice: number | null;
  discountPct: number | null;
  rating: number | null;
  reviewsCount: number | null;
  marketplace: string | null;
  imageUrl: string | null;
};

export type CommercialCreationProductIntelligenceInput = {
  category: string;
  painPoints: string[];
  desires: string[];
  objections: string[];
  purchaseMotivations: string[];
  keyBenefits: string[];
  emotionalBenefits: string[];
  functionalBenefits: string[];
  summary: string;
};
