// Radar Creative AI - Audio Pipeline / Music Track
//
// PURO - so monta strings de filtro FFmpeg (loop/trim/fade/volume) a
// partir da duracao real da musica (medida fora daqui, ver
// narration-track.ts#probeAudioDurationSeconds, reaproveitada tambem pra
// audio generico) e da duracao alvo do comercial. Nenhuma leitura de
// disco/execucao de ffmpeg acontece neste arquivo.

import type { MusicTrack } from "@/lib/commercial-video/audio/types";

export function needsLoop(musicDurationSeconds: number, targetDurationSeconds: number): boolean {
  return musicDurationSeconds < targetDurationSeconds;
}

export function needsTrim(musicDurationSeconds: number, targetDurationSeconds: number): boolean {
  return musicDurationSeconds > targetDurationSeconds;
}

/**
 * Numero de repeticoes ADICIONAIS (alem da primeira reproducao) - ex:
 * musica de 4s pra um alvo de 18s precisa tocar 5x no total -> 4 loops
 * adicionais.
 */
export function computeAdditionalLoopCount(musicDurationSeconds: number, targetDurationSeconds: number): number {
  if (musicDurationSeconds <= 0) return 0;
  return Math.max(0, Math.ceil(targetDurationSeconds / musicDurationSeconds) - 1);
}

/**
 * Grafo de filtro pra UM stream de audio de entrada (a musica, label
 * "0:a" pelo padrao do fluent-ffmpeg quando e o unico/primeiro input) ->
 * loop se curta, trim se longa, fade-in/out e volume "normal" (ducking e
 * aplicado depois, em audio-filter-graph.ts, sobre a saida deste grafo).
 */
export function buildMusicFilterChain(
  inputLabel: string,
  musicDurationSeconds: number,
  targetDurationSeconds: number,
  track: MusicTrack,
  outputLabel: string,
): string {
  const stages: string[] = [];
  let currentLabel = inputLabel;

  if (needsLoop(musicDurationSeconds, targetDurationSeconds)) {
    const additionalLoops = computeAdditionalLoopCount(musicDurationSeconds, targetDurationSeconds);
    stages.push(`[${currentLabel}]aloop=loop=${additionalLoops}:size=2147483647[music_looped]`);
    currentLabel = "music_looped";
  }

  // atrim sempre roda, mesmo quando a musica ja e mais curta que o alvo
  // (nesse caso o trim e um no-op pratico, mas garante duracao EXATA e
  // remove qualquer sobra do ultimo loop alem do necessario).
  stages.push(`[${currentLabel}]atrim=0:${targetDurationSeconds},asetpts=PTS-STARTPTS[music_trimmed]`);
  currentLabel = "music_trimmed";

  const fadeOutStart = Math.max(0, targetDurationSeconds - track.fadeOutSeconds);
  stages.push(
    `[${currentLabel}]volume=${track.volume},afade=t=in:st=0:d=${track.fadeInSeconds},afade=t=out:st=${fadeOutStart}:d=${track.fadeOutSeconds}[${outputLabel}]`,
  );

  return stages.join(";");
}
