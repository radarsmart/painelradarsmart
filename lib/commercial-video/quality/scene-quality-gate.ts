import type {
  CommercialQualityIssue,
  CommercialQualityStatus,
  ManualSceneAssessment,
  SceneQualityInput,
  SceneQualityResult,
  SceneReuseDecision,
} from "@/lib/commercial-video/quality/types";

function toIssue(assessment: ManualSceneAssessment): CommercialQualityIssue {
  return {
    category: assessment.category,
    severity: assessment.severity,
    sceneId: assessment.sceneId,
    message: assessment.message,
  };
}

function decideReuse(status: CommercialQualityStatus, issues: CommercialQualityIssue[]): SceneReuseDecision {
  if (status === "FAIL") return "NOT_REUSABLE";
  if (issues.some((issue) => issue.severity === "BLOCKING" || issue.severity === "CRITICAL")) return "REVIEW_REQUIRED";
  return "REUSABLE";
}

export function assessSceneQuality(input: SceneQualityInput): SceneQualityResult {
  const issues = input.manualAssessments.map(toIssue);
  const reasons: string[] = [];
  const observations: string[] = [];
  const scene = input.scene;

  if (scene.existingAsset?.status !== "READY") {
    issues.push({
      category: "MISSING_SCENE",
      severity: "CRITICAL",
      sceneId: scene.sceneId,
      message: `Cena ${scene.sceneId} nao tem asset READY para publicacao.`,
    });
  }

  for (const issue of issues) {
    if (issue.severity === "BLOCKING" || issue.severity === "CRITICAL") reasons.push(issue.message);
    else observations.push(issue.message);
  }

  const status: CommercialQualityStatus = reasons.length > 0 ? "FAIL" : observations.length > 0 ? "PASS_WITH_OBSERVATIONS" : "PASS";
  const reuseDecision = decideReuse(status, issues);

  return {
    sceneId: scene.sceneId,
    provider: scene.selectedProvider ?? null,
    capability: scene.providerCapability,
    technicalStatus: scene.existingAsset?.status ?? scene.persistedStatus,
    status,
    commercialReusable: reuseDecision === "REUSABLE",
    reuseDecision,
    reasons,
    observations,
    issues,
  };
}

export function assessScenesQuality(inputs: SceneQualityInput[]): SceneQualityResult[] {
  return inputs.map(assessSceneQuality);
}
