import type { NarrationExecutionRecord } from "@/lib/commercial-video/runner/types";
import type { NarrationPlan } from "@/lib/commercial-video/narration/types";
import type { CommercialQualityIssue, CommercialQualityStatus, NarrationConsistencyResult } from "@/lib/commercial-video/quality/types";

const TIMING_TOLERANCE_SECONDS = 0.05;

export function assessNarrationConsistency(
  narrationPlan: NarrationPlan | null,
  records: NarrationExecutionRecord[],
): NarrationConsistencyResult {
  const issues: CommercialQualityIssue[] = [];
  const sceneTimings: NarrationConsistencyResult["sceneTimings"] = [];

  if (!narrationPlan) {
    return {
      status: "FAIL",
      issues: [{ category: "MISSING_NARRATION", severity: "BLOCKING", message: "NarrationPlan ausente." }],
      sceneTimings,
    };
  }

  for (const scene of narrationPlan.scenes) {
    const record = records.find((entry) => entry.sceneId === scene.sceneId && (entry.status === "COMPLETED" || entry.status === "REUSED"));
    const audioDuration = record?.actualDurationSeconds ?? null;
    let status: "PASS" | "FAIL" = "PASS";

    if (!record) {
      status = "FAIL";
      issues.push({
        category: "MISSING_NARRATION",
        severity: "BLOCKING",
        sceneId: scene.sceneId,
        message: `Cena ${scene.sceneId} nao tem audio COMPLETED/REUSED.`,
      });
    } else if (audioDuration !== null && audioDuration > scene.durationSeconds + TIMING_TOLERANCE_SECONDS) {
      status = "FAIL";
      issues.push({
        category: "NARRATION_TOO_LONG",
        severity: "BLOCKING",
        sceneId: scene.sceneId,
        message: `Narracao da cena ${scene.sceneId} (${audioDuration.toFixed(2)}s) ultrapassa a janela (${scene.durationSeconds.toFixed(2)}s).`,
      });
    }

    sceneTimings.push({
      sceneId: scene.sceneId,
      text: scene.text,
      sceneDurationSeconds: scene.durationSeconds,
      audioDurationSeconds: audioDuration,
      status,
    });
  }

  const qualityStatus: CommercialQualityStatus =
    issues.some((issue) => issue.severity === "BLOCKING" || issue.severity === "CRITICAL") ? "FAIL" : "PASS";
  return { status: qualityStatus, issues, sceneTimings };
}
