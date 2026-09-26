// Radar Creative AI - Audio Pipeline / Audio Timeline Builder
//
// PURO - monta a CommercialAudioTimeline e calcula as janelas de ducking
// (quando a musica deve baixar de volume) a partir dos segmentos de
// narracao ja resolvidos (ver narration-track.ts). Nao decide volume final
// em si (isso e audio-filter-graph.ts) - so calcula ONDE o ducking se
// aplica.

import type {
  CommercialAudioTimeline,
  DuckingConfig,
  MusicTrack,
  NarrationSegment,
  SfxEvent,
} from "@/lib/commercial-video/audio/types";

// Defaults sensatos (ver item 9 do enunciado): musica normal em 0.25,
// abaixando pra 0.10 durante narracao (dentro da faixa 0.08-0.12 pedida),
// com 0.15s de rampa pra evitar corte abrupto.
export const DEFAULT_DUCKING: DuckingConfig = {
  enabled: true,
  normalVolume: 0.25,
  duckedVolume: 0.1,
  transitionSeconds: 0.15,
};

export function buildCommercialAudioTimeline(
  durationSeconds: number,
  narrationSegments: NarrationSegment[],
  musicTrack: MusicTrack | null,
  sfxEvents: SfxEvent[],
  ducking: DuckingConfig = DEFAULT_DUCKING,
): CommercialAudioTimeline {
  return { durationSeconds, narrationSegments, musicTrack, sfxEvents, ducking };
}

export type DuckingWindow = { start: number; end: number };

/**
 * So segmentos READY (com duracao real medida) geram janela de ducking -
 * SILENT/NARRATION_TOO_LONG/MISSING_ASSET nunca abaixam a musica (nao ha
 * fala de verdade acontecendo). Janelas sao ordenadas e mescladas quando
 * se sobrepoem (defensivo - narracoes nao deveriam se sobrepor numa
 * timeline bem formada, mas o merge evita uma rampa dupla incorreta se
 * acontecer).
 */
export function computeDuckingWindows(narrationSegments: NarrationSegment[]): DuckingWindow[] {
  const raw = narrationSegments
    .filter((segment): segment is NarrationSegment & { actualDurationSeconds: number } => segment.status === "READY" && segment.actualDurationSeconds !== null)
    .map((segment) => ({ start: segment.startTime, end: segment.startTime + segment.actualDurationSeconds }))
    .sort((a, b) => a.start - b.start);

  const merged: DuckingWindow[] = [];
  for (const window of raw) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end) {
      last.end = Math.max(last.end, window.end);
    } else {
      merged.push({ ...window });
    }
  }
  return merged;
}

/**
 * Constroi a expressao FFmpeg (variavel `t` = tempo em segundos) do ganho
 * da musica ao longo do tempo: normalVolume fora de qualquer narracao,
 * duckedVolume durante, com rampa linear de transitionSeconds nas bordas.
 * Retorna so um numero literal (sem `t`) quando ducking esta desabilitado
 * ou nao ha nenhuma janela - grafo mais simples, mesmo resultado.
 */
export function buildDuckingVolumeExpression(windows: DuckingWindow[], ducking: DuckingConfig): string {
  if (!ducking.enabled || windows.length === 0) {
    return `${ducking.normalVolume}`;
  }

  const transition = ducking.transitionSeconds;
  let expression = `${ducking.normalVolume}`;

  for (const window of [...windows].reverse()) {
    const duckedFlat = `if(between(t,${window.start},${window.end}),${ducking.duckedVolume},${expression})`;
    const rampIn = `if(between(t,${window.start - transition},${window.start}),${ducking.normalVolume}+(${ducking.duckedVolume}-${ducking.normalVolume})*((t-(${window.start - transition}))/${transition}),${duckedFlat})`;
    const rampOut = `if(between(t,${window.end},${window.end + transition}),${ducking.duckedVolume}+(${ducking.normalVolume}-${ducking.duckedVolume})*((t-${window.end})/${transition}),${rampIn})`;
    expression = rampOut;
  }

  return expression;
}
