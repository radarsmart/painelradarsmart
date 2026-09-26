import type { AudioQualityResult } from "@/lib/commercial-video/audio/types";
import type { CommercialGenerationResult, NarrationExecutionRecord, SceneRunnerPlan } from "@/lib/commercial-video/runner/types";

export type CommercialQualityStatus = "PASS" | "PASS_WITH_OBSERVATIONS" | "FAIL";

export type CommercialQualityIssueCategory =
  | "PRICE_MISMATCH"
  | "DISCOUNT_MISMATCH"
  | "INVALID_DISCOUNT_OVERLAY"
  | "GENERATED_CONTENT_CONTAMINATION"
  | "GENERATED_TEXT"
  | "GENERATED_LOGO"
  | "GENERATED_PRICE"
  | "GENERATED_DISCOUNT"
  | "PRODUCT_LABEL_MUTATION"
  | "BRAND_MUTATION"
  | "PRODUCT_MUTATION"
  | "CTA_TRUNCATED"
  | "NARRATION_TOO_LONG"
  | "MISSING_NARRATION"
  | "AUDIO_CLIPPING"
  | "MISSING_AUDIO_STREAM"
  | "INVALID_MP4"
  | "INVALID_VIDEO_DIMENSIONS"
  | "INVALID_VIDEO_FPS"
  | "INVALID_VIDEO_CODEC"
  | "TIMELINE_DURATION_MISMATCH"
  | "MISSING_SCENE"
  | "REVIEW_REQUIRED";

export type QualitySeverity = "NON_BLOCKING" | "BLOCKING" | "CRITICAL";

export type CommercialQualityIssue = {
  category: CommercialQualityIssueCategory;
  severity: QualitySeverity;
  message: string;
  sceneId?: string;
};

export type OfferQualitySnapshot = {
  price: number | null;
  priceText: string | null;
  originalPrice: number | null;
  originalPriceText?: string | null;
  discountPercent: number | null;
  discountText: string | null;
};

export type VisualCommercialClaim = {
  sceneId: string;
  source: "COMPOSITOR_OVERLAY" | "GENERATED_CONTENT" | "NARRATION";
  kind: "PRICE" | "DISCOUNT";
  value: string;
};

export type OfferConsistencyResult = {
  status: CommercialQualityStatus;
  issues: CommercialQualityIssue[];
};

export type ManualSceneAssessment = {
  sceneId: string;
  category: Extract<
    CommercialQualityIssueCategory,
    | "GENERATED_CONTENT_CONTAMINATION"
    | "GENERATED_TEXT"
    | "GENERATED_LOGO"
    | "GENERATED_PRICE"
    | "GENERATED_DISCOUNT"
    | "PRODUCT_LABEL_MUTATION"
    | "BRAND_MUTATION"
    | "PRODUCT_MUTATION"
    | "CTA_TRUNCATED"
    | "REVIEW_REQUIRED"
  >;
  severity: QualitySeverity;
  message: string;
};

export type SceneReuseDecision = "REUSABLE" | "NOT_REUSABLE" | "REVIEW_REQUIRED";

export type SceneQualityResult = {
  sceneId: string;
  provider: string | null;
  capability: string;
  technicalStatus: string;
  status: CommercialQualityStatus;
  commercialReusable: boolean;
  reuseDecision: SceneReuseDecision;
  reasons: string[];
  observations: string[];
  issues: CommercialQualityIssue[];
};

export type NarrationConsistencyResult = {
  status: CommercialQualityStatus;
  issues: CommercialQualityIssue[];
  sceneTimings: Array<{
    sceneId: string;
    text: string | null;
    sceneDurationSeconds: number;
    audioDurationSeconds: number | null;
    status: "PASS" | "FAIL";
  }>;
};

export type FinalVideoProbe = {
  valid: boolean;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string | null;
  videoEncoder: string | null;
  audioCodec: string | null;
  audioStreamCount: number;
  error: string | null;
};

export type FinalVideoTechnicalQualityResult = {
  status: CommercialQualityStatus;
  issues: CommercialQualityIssue[];
  probe: FinalVideoProbe;
};

export type CommercialQualityGateInput = {
  runnerResult: CommercialGenerationResult;
  offer: OfferQualitySnapshot;
  visualClaims: VisualCommercialClaim[];
  manualSceneAssessments?: ManualSceneAssessment[];
  finalVideoProbe: FinalVideoProbe;
  audioQuality: AudioQualityResult;
  allowLegacyEncoderObservation?: boolean;
  // TIMELINE_DURATION_CONSISTENCY (item 7, COMMERCIAL V2 FINAL ASSEMBLY FIX
  // V1) - soma de CommercialVideoSceneAsset.durationSeconds planejada (ver
  // CommercialTimeline.totalDurationSeconds, timeline-builder.ts). Opcional:
  // omitido = checagem pulada (comportamento identico ao anterior desta
  // correcao) - nunca inventado a partir de outro dado quando o chamador
  // nao informa.
  plannedTimelineDurationSeconds?: number | null;
};

export type CommercialQualityResult = {
  status: CommercialQualityStatus;
  publishReady: boolean;
  requiresHumanAcknowledgement: boolean;
  sceneResults: SceneQualityResult[];
  offerConsistency: OfferConsistencyResult;
  narrationConsistency: NarrationConsistencyResult;
  finalVideoTechnicalQuality: FinalVideoTechnicalQualityResult;
  audioQuality: AudioQualityResult;
  blockingReasons: string[];
  observations: string[];
  publishObservations: CommercialQualityIssue[];
  reusePolicy: Array<{
    sceneId: string;
    provider: string | null;
    decision: SceneReuseDecision;
    commercialReusable: boolean;
    reasons: string[];
  }>;
};

export type SceneQualityInput = {
  scene: SceneRunnerPlan;
  narrationRecord: NarrationExecutionRecord | null;
  manualAssessments: ManualSceneAssessment[];
};
