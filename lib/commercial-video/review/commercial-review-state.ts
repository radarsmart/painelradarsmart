import type { CommercialJobApiView } from "@/lib/commercial-video/jobs/commercial-job-view";
import type { CommercialQualityIssue, CommercialQualityResult, CommercialQualityStatus } from "@/lib/commercial-video/quality/types";

export type CommercialReviewAction = "APPROVE" | "REJECT";

export type CommercialReviewScene = {
  sceneId: string;
  purpose: string;
  provider: string | null;
  assetSource: string | null;
  quality: CommercialQualityStatus | "NOT_EVALUATED";
  history: "repair" | "reused" | "generated" | "unknown";
};

export type CommercialReviewSummary = {
  jobId: string;
  finalVideoUrl: string | null;
  finalVideoPath: string | null;
  qualityStatus: CommercialQualityStatus | "NOT_EVALUATED";
  publishReady: boolean;
  requiresHumanAcknowledgement: boolean;
  observations: CommercialQualityIssue[];
  scenes: CommercialReviewScene[];
  traceability: CommercialJobApiView["traceability"];
  costs: {
    wanCredits: number | null;
    klingCredits: number | null;
    heygenUsdCents: number | null;
    elevenLabsCredits: number | null;
    repairWanCredits: number | null;
    repairKlingCredits: number | null;
    repairHeygenUsdCents: number | null;
    repairElevenLabsCredits: number | null;
  };
};

function getCommercialQuality(job: CommercialJobApiView): CommercialQualityResult | null {
  const runner = job.runnerResult as (CommercialJobApiView["runnerResult"] & {
    commercialQualityResult?: CommercialQualityResult;
    commercialQuality?: CommercialQualityResult;
  }) | null;
  return runner?.commercialQualityResult ?? runner?.commercialQuality ?? null;
}

function inferSceneHistory(
  scene: NonNullable<CommercialJobApiView["runnerResult"]>["scenes"][number] | undefined,
): CommercialReviewScene["history"] {
  if (!scene) return "unknown";
  if (scene.requiresHybridPipeline || scene.productGenerationStrategy === "HYBRID_PRODUCT_COMPOSITE") return "repair";
  if (scene.existingAsset?.status === "READY") return "reused";
  if (scene.eligibility === "ELIGIBLE") return "generated";
  return "unknown";
}

function estimateCosts(job: CommercialJobApiView): CommercialReviewSummary["costs"] {
  const scenes = job.runnerResult?.scenes ?? [];
  const wanCredits = scenes
    .filter((scene) => scene.selectedProvider === "wan-2-5-t2v")
    .reduce((sum, scene) => sum + (scene.estimatedCost.estimatedCredits ?? 0), 0);
  const klingCredits = scenes
    .filter((scene) => scene.selectedProvider === "freepik-kling-i2v")
    .reduce((sum, scene) => sum + (scene.estimatedCost.estimatedCredits ?? 0), 0);
  const heygenUsdCents = scenes
    .filter((scene) => scene.selectedProvider === "heygen-image-avatar")
    .reduce((sum, scene) => sum + (scene.estimatedCost.estimatedUsdCostCents ?? 0), 0);

  return {
    wanCredits: wanCredits || null,
    klingCredits: klingCredits || null,
    heygenUsdCents: heygenUsdCents || null,
    elevenLabsCredits: job.costSummary.estimatedTtsCredits,
    repairWanCredits: null,
    repairKlingCredits: null,
    repairHeygenUsdCents: null,
    repairElevenLabsCredits: null,
  };
}

export function buildCommercialReviewSummary(job: CommercialJobApiView): CommercialReviewSummary {
  const quality = getCommercialQuality(job);
  const runnerResult = job.runnerResult;
  const sceneQuality = new Map((quality?.sceneResults ?? []).map((scene) => [scene.sceneId, scene.status]));

  return {
    jobId: job.id,
    finalVideoUrl: runnerResult?.finalVideoUrl ?? null,
    finalVideoPath: runnerResult?.finalVideoPath ?? null,
    qualityStatus: quality?.status ?? job.qualityStatus ?? runnerResult?.quality.finalStatus ?? "NOT_EVALUATED",
    publishReady: quality?.publishReady ?? (job.qualityStatus === "PASS"),
    requiresHumanAcknowledgement: quality?.requiresHumanAcknowledgement ?? false,
    observations: quality?.publishObservations ?? [],
    scenes: (runnerResult?.scenes ?? []).map((scene) => ({
      sceneId: scene.sceneId,
      purpose: scene.purpose,
      provider: scene.selectedProvider,
      assetSource: scene.existingAsset?.source ?? null,
      quality: sceneQuality.get(scene.sceneId) ?? "NOT_EVALUATED",
      history: inferSceneHistory(scene),
    })),
    traceability: job.traceability,
    costs: estimateCosts(job),
  };
}

export function canApproveCommercial(summary: CommercialReviewSummary, humanAcknowledgedObservations: boolean): boolean {
  if (!summary.publishReady) return false;
  if (summary.observations.some((issue) => issue.severity === "BLOCKING" || issue.severity === "CRITICAL")) return false;
  if (summary.requiresHumanAcknowledgement && !humanAcknowledgedObservations) return false;
  return true;
}

export function canRejectCommercial(): boolean {
  return true;
}
