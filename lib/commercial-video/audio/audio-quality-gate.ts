// Radar Creative AI - Audio Pipeline / Audio Quality Gate
//
// PURO - monta o AudioQualityResult a partir de FATOS JA MEDIDOS (duracao
// real via ffprobe, pico via astats, presenca de stream). Nunca infere uma
// metrica que nao foi de fato medida (ver item 22 - "nao inventar
// metricas") - campos sem medicao ficam null.

import type { AudioQualityResult, NarrationSegment } from "@/lib/commercial-video/audio/types";

const DURATION_TOLERANCE_SECONDS = 0.15;
const CLIPPING_THRESHOLD_DB = -0.1;

export type AssessAudioQualityInput = {
  videoDurationSeconds: number;
  audioDurationSeconds: number | null;
  narrationSegments: NarrationSegment[];
  peakLevelDb: number | null;
  audioStreamPresent: boolean;
  masterLoudnessLUFS: number | null;
};

export function assessAudioQuality(input: AssessAudioQualityInput): AudioQualityResult {
  const notes: string[] = [];

  const durationMatchesVideo =
    input.audioDurationSeconds !== null &&
    Math.abs(input.audioDurationSeconds - input.videoDurationSeconds) <= DURATION_TOLERANCE_SECONDS;
  if (!durationMatchesVideo) {
    notes.push(
      `Duracao do audio (${input.audioDurationSeconds ?? "null"}) nao bate com o video (${input.videoDurationSeconds}) dentro da tolerancia de ${DURATION_TOLERANCE_SECONDS}s.`,
    );
  }

  const tooLongSegments = input.narrationSegments.filter((segment) => segment.status === "NARRATION_TOO_LONG");
  const missingSegments = input.narrationSegments.filter((segment) => segment.status === "MISSING_ASSET");
  const narrationTimingValid = tooLongSegments.length === 0 && missingSegments.length === 0;
  if (!narrationTimingValid) {
    for (const segment of tooLongSegments) notes.push(`Cena ${segment.sceneId}: NARRATION_TOO_LONG (${segment.error ?? ""}).`);
    for (const segment of missingSegments) notes.push(`Cena ${segment.sceneId}: MISSING_ASSET (${segment.error ?? ""}).`);
  }

  const clippingDetected = input.peakLevelDb === null ? null : input.peakLevelDb >= CLIPPING_THRESHOLD_DB;
  if (clippingDetected === null) {
    notes.push("Pico de audio nao medido - clippingDetected fica null (nunca assumido como false sem medicao).");
  } else if (clippingDetected) {
    notes.push(`Pico medido (${input.peakLevelDb}dBFS) >= limiar de clipping (${CLIPPING_THRESHOLD_DB}dBFS).`);
  }

  if (!input.audioStreamPresent) {
    notes.push("Nenhum stream de audio encontrado no arquivo final.");
  }

  const status: AudioQualityResult["status"] =
    durationMatchesVideo && narrationTimingValid && input.audioStreamPresent && clippingDetected !== true ? "PASS" : "FAIL";

  return {
    status,
    durationMatchesVideo,
    narrationTimingValid,
    clippingDetected,
    audioStreamPresent: input.audioStreamPresent,
    masterLoudnessLUFS: input.masterLoudnessLUFS,
    notes,
  };
}
