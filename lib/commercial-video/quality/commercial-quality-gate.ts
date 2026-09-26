import { assessAudioQuality } from "@/lib/commercial-video/audio/audio-quality-gate";
import { assessFinalVideoTechnicalQuality } from "@/lib/commercial-video/quality/final-video-quality-check";
import { assessNarrationConsistency } from "@/lib/commercial-video/quality/narration-consistency-check";
import { assessOfferConsistency } from "@/lib/commercial-video/quality/offer-consistency-check";
import {
  aggregateCommercialStatus,
  collectNonBlockingPublishObservations,
  collectPublishBlockingIssues,
  decidePublishReady,
  requiresHumanAcknowledgement,
} from "@/lib/commercial-video/quality/publish-readiness";
import { assessScenesQuality } from "@/lib/commercial-video/quality/scene-quality-gate";
import type { NarrationSegment } from "@/lib/commercial-video/audio/types";
import type {
  CommercialQualityGateInput,
  CommercialQualityIssue,
  CommercialQualityResult,
  ManualSceneAssessment,
} from "@/lib/commercial-video/quality/types";

// Mesma tolerancia/raciocinio de DURATION_TOLERANCE_SECONDS em
// lib/commercial-video/runner/execute/final-composer.ts (um CROSSFADE de
// 0.5s por transicao ja produz uma diferenca esperada pequena) -
// duplicada aqui de proposito (evita import cruzado quality<->runner/execute)
// em vez de importada. Item 7 do pedido COMMERCIAL V2 FINAL ASSEMBLY FIX
// V1: o Commercial Quality Gate (o gate "de publicacao") NUNCA verificava
// isso - so o gate interno do compositor verificava, o que deixava
// publishReady=true passar despesar de um MP4 mais curto que o planejado
// (aprendizado do COMMERCIAL V2 FULL CANARY real, 2026-08-11).
export const TIMELINE_DURATION_TOLERANCE_SECONDS = 2;

function buildSceneInputs(input: CommercialQualityGateInput) {
  const assessments = input.manualSceneAssessments ?? [];
  return input.runnerResult.scenes.map((scene) => ({
    scene,
    narrationRecord: input.runnerResult.narrationExecutionRecords.find((record) => record.sceneId === scene.sceneId) ?? null,
    manualAssessments: assessments.filter((assessment) => assessment.sceneId === scene.sceneId),
  }));
}

function collectIssues(input: CommercialQualityResult): CommercialQualityIssue[] {
  return [
    ...input.offerConsistency.issues,
    ...input.narrationConsistency.issues,
    ...input.finalVideoTechnicalQuality.issues,
    ...input.sceneResults.flatMap((scene) => scene.issues),
  ];
}

export function assessCommercialQuality(input: CommercialQualityGateInput): CommercialQualityResult {
  const offerConsistency = assessOfferConsistency(input.offer, input.visualClaims);
  const narrationConsistency = assessNarrationConsistency(input.runnerResult.narrationPlan, input.runnerResult.narrationExecutionRecords);
  const sceneResults = assessScenesQuality(buildSceneInputs(input));
  const finalVideoTechnicalQuality = assessFinalVideoTechnicalQuality({
    probe: input.finalVideoProbe,
    // Web-safe (Chrome/Edge): h264/avc1 - ver commercial-video-composer.ts.
    // "mpeg4" era a regra antiga (o motivo real por tras do remux manual
    // pos-hoc em sync-websafe-audiofix-final-video.js) - corrigida para
    // exigir o codec correto na origem.
    expectedVideoCodec: "h264",
    allowLegacyEncoderObservation: input.allowLegacyEncoderObservation,
  });

  // TIMELINE_DURATION_CONSISTENCY (item 7 do pedido) - so verifica quando o
  // chamador informa plannedTimelineDurationSeconds (opcional, omitido =
  // comportamento identico ao anterior, sem essa checagem - callers
  // antigos como run-final-reassembly-prepublish-qa.js nunca quebram).
  const timelineDurationIssues: CommercialQualityIssue[] = [];
  if (input.plannedTimelineDurationSeconds != null && input.finalVideoProbe.durationSeconds != null) {
    const durationDifference = Math.abs(input.finalVideoProbe.durationSeconds - input.plannedTimelineDurationSeconds);
    if (durationDifference > TIMELINE_DURATION_TOLERANCE_SECONDS) {
      timelineDurationIssues.push({
        category: "TIMELINE_DURATION_MISMATCH",
        severity: "CRITICAL",
        message:
          `Duracao final (${input.finalVideoProbe.durationSeconds.toFixed(2)}s) diverge da timeline planejada ` +
          `(${input.plannedTimelineDurationSeconds.toFixed(2)}s) em ${durationDifference.toFixed(2)}s - ` +
          `acima da tolerancia de ${TIMELINE_DURATION_TOLERANCE_SECONDS}s.`,
      });
    }
  }

  const statuses = [
    offerConsistency.status,
    narrationConsistency.status,
    finalVideoTechnicalQuality.status,
    input.audioQuality.status === "PASS" ? "PASS" : "FAIL",
    timelineDurationIssues.length > 0 ? "FAIL" : "PASS",
    ...sceneResults.map((scene) => scene.status),
  ] as const;
  const status = aggregateCommercialStatus([...statuses]);

  const preliminary: CommercialQualityResult = {
    status,
    publishReady: false,
    sceneResults,
    offerConsistency,
    narrationConsistency,
    finalVideoTechnicalQuality,
    audioQuality: input.audioQuality,
    blockingReasons: [],
    observations: [],
    publishObservations: [],
    requiresHumanAcknowledgement: false,
    reusePolicy: sceneResults.map((scene) => ({
      sceneId: scene.sceneId,
      provider: scene.provider,
      decision: scene.reuseDecision,
      commercialReusable: scene.commercialReusable,
      reasons: [...scene.reasons, ...scene.observations],
    })),
  };

  const issues = collectIssues(preliminary);
  const audioIssues: CommercialQualityIssue[] = input.audioQuality.status === "PASS"
    ? []
    : input.audioQuality.notes.map((note) => ({
        category: note.toLowerCase().includes("clipping") ? "AUDIO_CLIPPING" : "MISSING_AUDIO_STREAM",
        severity: note.toLowerCase().includes("clipping") || note.toLowerCase().includes("stream de audio") ? "CRITICAL" : "BLOCKING",
        message: note,
      }));

  const allIssues = [...issues, ...audioIssues, ...timelineDurationIssues];
  const publishBlockingIssues = collectPublishBlockingIssues(allIssues);
  const publishObservations = collectNonBlockingPublishObservations(allIssues);
  const blockingReasons = publishBlockingIssues.map((issue) => issue.message);
  const observations = publishObservations.map((issue) => issue.message);
  const finalStatus = aggregateCommercialStatus([status, audioIssues.length > 0 ? "FAIL" : "PASS", timelineDurationIssues.length > 0 ? "FAIL" : "PASS"]);

  return {
    ...preliminary,
    status: finalStatus,
    publishReady: decidePublishReady(finalStatus, allIssues, input.audioQuality),
    requiresHumanAcknowledgement: requiresHumanAcknowledgement(allIssues),
    blockingReasons,
    observations,
    publishObservations,
  };
}

export function buildAudioQualityFromMeasuredFacts(input: {
  videoDurationSeconds: number;
  audioDurationSeconds: number | null;
  narrationSegments: NarrationSegment[];
  peakLevelDb: number | null;
  audioStreamPresent: boolean;
  masterLoudnessLUFS: number | null;
}) {
  return assessAudioQuality(input);
}

export function buildManualAssessment(
  sceneId: string,
  category: ManualSceneAssessment["category"],
  severity: ManualSceneAssessment["severity"],
  message: string,
): ManualSceneAssessment {
  return { sceneId, category, severity, message };
}
