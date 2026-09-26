import type { CommercialQualityIssue, CommercialQualityStatus, QualitySeverity } from "@/lib/commercial-video/quality/types";
import type { AudioQualityResult } from "@/lib/commercial-video/audio/types";

export function statusFromIssues(issues: CommercialQualityIssue[]): CommercialQualityStatus {
  if (issues.some((issue) => issue.severity === "BLOCKING" || issue.severity === "CRITICAL")) return "FAIL";
  if (issues.length > 0) return "PASS_WITH_OBSERVATIONS";
  return "PASS";
}

export function aggregateCommercialStatus(statuses: CommercialQualityStatus[]): CommercialQualityStatus {
  if (statuses.includes("FAIL")) return "FAIL";
  if (statuses.includes("PASS_WITH_OBSERVATIONS")) return "PASS_WITH_OBSERVATIONS";
  return "PASS";
}

export function isPublishBlockingSeverity(severity: QualitySeverity): boolean {
  return severity === "BLOCKING" || severity === "CRITICAL";
}

export function collectPublishBlockingIssues(issues: CommercialQualityIssue[]): CommercialQualityIssue[] {
  return issues.filter((issue) => isPublishBlockingSeverity(issue.severity));
}

export function collectNonBlockingPublishObservations(issues: CommercialQualityIssue[]): CommercialQualityIssue[] {
  return issues.filter((issue) => issue.severity === "NON_BLOCKING");
}

export function requiresHumanAcknowledgement(issues: CommercialQualityIssue[]): boolean {
  return collectNonBlockingPublishObservations(issues).length > 0;
}

export function decidePublishReady(status: CommercialQualityStatus, issues: CommercialQualityIssue[], audioQuality: AudioQualityResult): boolean {
  if (status === "FAIL") return false;
  if (collectPublishBlockingIssues(issues).length > 0) return false;
  return audioQuality.status === "PASS";
}
