// Radar Creative AI - Audio Pipeline / SFX Track
//
// PURO - catalogo pequeno e deliberado (ver item 10, "nao criar catalogo
// grande") e validacao de posicionamento. SFX sao sempre OPCIONAIS e
// recebidos via configuracao explicita do chamador (ver item 11, "nao
// inferir automaticamente") - este modulo nunca decide sozinho que uma
// cena "deveria" ter um som.

import type { SfxEvent, SfxType } from "@/lib/commercial-video/audio/types";

export const SFX_TYPES: SfxType[] = ["WHOOSH", "IMPACT", "CLICK", "SUCCESS"];

export const SFX_DEFAULT_VOLUME: Record<SfxType, number> = {
  WHOOSH: 0.6,
  IMPACT: 0.8,
  CLICK: 0.7,
  SUCCESS: 0.7,
};

export function buildSfxEvent(
  sceneId: string,
  type: SfxType,
  inputPath: string,
  startTime: number,
  volumeOverride?: number,
): SfxEvent {
  return {
    sceneId,
    type,
    inputPath,
    startTime,
    volume: volumeOverride ?? SFX_DEFAULT_VOLUME[type],
  };
}

export type SfxValidationResult = { ok: boolean; reason: string | null };

/**
 * Um SFX que comeca fora da janela do comercial (negativo ou depois do
 * fim) nunca deve entrar silenciosamente no mix - fica de fora e o motivo
 * fica registrado (ver traceability).
 */
export function validateSfxEvent(event: SfxEvent, timelineDurationSeconds: number): SfxValidationResult {
  if (event.startTime < 0) {
    return { ok: false, reason: `SFX ${event.type} (${event.sceneId}) tem startTime negativo (${event.startTime}).` };
  }
  if (event.startTime >= timelineDurationSeconds) {
    return {
      ok: false,
      reason: `SFX ${event.type} (${event.sceneId}) comeca em ${event.startTime}s, fora da duracao do comercial (${timelineDurationSeconds}s).`,
    };
  }
  return { ok: true, reason: null };
}

export function filterValidSfxEvents(events: SfxEvent[], timelineDurationSeconds: number): SfxEvent[] {
  return events.filter((event) => validateSfxEvent(event, timelineDurationSeconds).ok);
}
