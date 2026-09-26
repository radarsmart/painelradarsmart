// Radar Creative AI - Commercial Generation Runner / EXECUTE Narration Executor
//
// Sintetiza de verdade UMA fala por cena READY do NarrationPlan, via
// createGarotaRadarNarrationProvider() (voz oficial aprovada, ver
// garota-radar-voice-profile.ts) - NUNCA escreve copy aqui (isso e
// exclusividade do Narration Script Builder V1, ja rodado antes). Reusa
// resolveNarrationSegment (ja existente, ja garante "no maximo 1 tentativa,
// nunca corta, nunca regenera automaticamente") - este arquivo so decide
// SE deve reusar um audio ja sintetizado (fingerprint) antes de chamar.

import fs from "node:fs";

import { resolveNarrationSegment, type NarrationProvider } from "@/lib/commercial-video/audio/narration-track";
import { computeNarrationFingerprint } from "@/lib/commercial-video/runner/execute/scene-fingerprint";
import type { NarrationPlan } from "@/lib/commercial-video/narration/types";
import type { NarrationSegment } from "@/lib/commercial-video/audio/types";
import type { NarrationExecutionRecord } from "@/lib/commercial-video/runner/types";
import type { CampaignPromptPlan } from "@/lib/prompt-builder/types";

export type SceneTiming = { sceneId: string; startTime: number; durationSeconds: number };

/**
 * Ordem/duracao das cenas vem SEMPRE do Prompt Builder (mesma fonte que
 * o Timeline Builder usa) - nunca recalculada por conta propria, so
 * espelhada aqui pra nao depender do video ja estar pronto pra saber
 * ONDE cada fala comeca.
 */
export function computeSceneTimings(promptPlan: CampaignPromptPlan): SceneTiming[] {
  const ordered = [...promptPlan.scenes].sort((a, b) => a.sceneOrder - b.sceneOrder);
  let cursor = 0;
  return ordered.map((scene) => {
    const startTime = cursor;
    cursor += scene.durationSeconds;
    return { sceneId: scene.sceneId, startTime, durationSeconds: scene.durationSeconds };
  });
}

export type NarrationExecutorDeps = {
  narrationProvider: NarrationProvider;
  voiceId: string;
  model: string;
};

export type NarrationExecutionOutcome = {
  records: NarrationExecutionRecord[];
  segments: NarrationSegment[];
};

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Reusa um audio ja sintetizado SOMENTE quando: mesmo fingerprint (texto+
 * voz+modelo, item 27) E o arquivo ainda existe fisicamente em disco (um
 * cache-dir de um job anterior pode ter sido limpo - nunca confia so no
 * registro, sempre confere o arquivo real antes de reusar).
 */
function findReusableRecord(
  sceneId: string,
  fingerprint: string,
  existing: NarrationExecutionRecord[],
): NarrationExecutionRecord | null {
  const candidate = existing.find(
    (record) =>
      record.sceneId === sceneId &&
      record.fingerprint === fingerprint &&
      record.status === "COMPLETED" &&
      record.audioPath !== null &&
      fs.existsSync(record.audioPath),
  );
  return candidate ?? null;
}

export async function executeNarrationPlan(
  narrationPlan: NarrationPlan,
  promptPlan: CampaignPromptPlan,
  existingNarrationExecutionRecords: NarrationExecutionRecord[],
  deps: NarrationExecutorDeps,
): Promise<NarrationExecutionOutcome> {
  const timings = computeSceneTimings(promptPlan);
  const records: NarrationExecutionRecord[] = [];
  const segments: NarrationSegment[] = [];

  for (const timing of timings) {
    const narrationScene = narrationPlan.scenes.find((s) => s.sceneId === timing.sceneId) ?? null;
    const text = narrationScene?.status === "READY" ? narrationScene.text : null;

    if (!text) {
      segments.push({
        sceneId: timing.sceneId,
        text: null,
        startTime: timing.startTime,
        maxDurationSeconds: timing.durationSeconds,
        source: null,
        audioPath: null,
        actualDurationSeconds: null,
        status: "SILENT",
        error: null,
      });
      continue;
    }

    const fingerprint = computeNarrationFingerprint(text, deps.voiceId, deps.model);
    const reusable = findReusableRecord(timing.sceneId, fingerprint, existingNarrationExecutionRecords);

    if (reusable) {
      records.push({ ...reusable, status: "REUSED", completedAt: nowIso() });
      segments.push({
        sceneId: timing.sceneId,
        text,
        startTime: timing.startTime,
        maxDurationSeconds: timing.durationSeconds,
        source: "TTS_RESULT",
        audioPath: reusable.audioPath,
        actualDurationSeconds: reusable.actualDurationSeconds,
        status: "READY",
        error: null,
      });
      continue;
    }

    // No maximo 1 chamada real (ver resolveNarrationSegment - ja garante
    // isso, nunca corta a fala, nunca regenera automaticamente).
    const segment = await resolveNarrationSegment(timing.sceneId, text, timing.startTime, timing.durationSeconds, deps.narrationProvider);
    segments.push(segment);

    if (segment.status === "READY") {
      records.push({
        sceneId: timing.sceneId,
        fingerprint,
        status: "COMPLETED",
        audioPath: segment.audioPath,
        actualDurationSeconds: segment.actualDurationSeconds,
        completedAt: nowIso(),
        error: null,
      });
    } else if (segment.status === "NARRATION_TOO_LONG") {
      records.push({
        sceneId: timing.sceneId,
        fingerprint,
        status: "TOO_LONG",
        audioPath: segment.audioPath,
        actualDurationSeconds: segment.actualDurationSeconds,
        completedAt: nowIso(),
        error: segment.error,
      });
    } else {
      records.push({
        sceneId: timing.sceneId,
        fingerprint,
        status: "FAILED",
        audioPath: null,
        actualDurationSeconds: null,
        completedAt: nowIso(),
        error: segment.error,
      });
    }
  }

  return { records, segments };
}
