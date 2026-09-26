// Radar Creative AI - Audio Pipeline / Audio Filter Graph
//
// PURO - monta o filter_complex COMPLETO da mixagem (musica com ducking +
// narracao posicionada + SFX posicionado -> master) e a ordem exata de
// inputs que o executor (audio-mixer.ts) precisa passar pro ffmpeg. Nenhum
// fs/child_process aqui - as duracoes reais (ex: da musica) sao medidas
// fora e passadas como numero.

import { buildDuckingVolumeExpression, computeDuckingWindows } from "@/lib/commercial-video/audio/audio-timeline-builder";
import { buildMusicFilterChain } from "@/lib/commercial-video/audio/music-track";
import type { DuckingConfig, MusicTrack, NarrationSegment, SfxEvent } from "@/lib/commercial-video/audio/types";

// Loudness alvo do MASTER (unico ponto de normalizacao/limitacao, nunca
// aplicado a cada source individual - ver item 12). EBU R128, single-pass
// (ver relatorio: nao e o loudnorm de 2 passadas, entao nao garantimos o
// alvo com a mesma precisao que uma medicao previa daria - documentado,
// nao prometido como "broadcast compliant").
export const MASTER_LOUDNESS_TARGET_LUFS = -14;
export const MASTER_TRUE_PEAK_DBTP = -1.5;
export const MASTER_LOUDNESS_RANGE_LU = 11;
// Ganho linear maximo do alimiter final (0.6 ~= -4.4dBFS). BUG REAL
// encontrado e corrigido durante o teste desta fase: o `alimiter` do
// FFmpeg tem `level` (auto-compensacao de ganho de saida) LIGADO por
// padrao - isso reintroduzia o sinal de volta pra perto de 0dBFS mesmo
// com um `limit` baixo, anulando a protecao. Corrigido com
// `level=disabled` (limite vira um teto rigido de verdade) e
// `attack=1` (reacao mais rapida a transientes no inicio do arquivo,
// como um SFX de IMPACT bem no frame 0, onde um limiter look-ahead
// padrao ainda nao tem historico suficiente pra reagir). A margem de
// -4.4dB (nao so -1dB) tambem absorve o overshoot real medido na
// codificacao AAC (inter-sample peak, fenomeno documentado de codecs
// com perda, nao um bug) - com essa margem o pico final pos-AAC ficou
// medido em torno de -2 a -3dBFS, sem clipping.
export const MASTER_LIMITER_LINEAR = 0.6;
export const MASTER_LIMITER_ATTACK_MS = 1;
export const MASTER_LIMITER_RELEASE_MS = 50;

export type AudioMixPlanInput = {
  durationSeconds: number;
  musicTrack: MusicTrack | null;
  musicDurationSeconds: number | null;
  narrationSegments: NarrationSegment[];
  sfxEvents: SfxEvent[];
  ducking: DuckingConfig;
};

export type AudioMixPlan = {
  inputPaths: string[];
  filterComplex: string;
  outputLabel: string;
};

export function buildAudioMixPlan(input: AudioMixPlanInput): AudioMixPlan {
  const inputPaths: string[] = [];
  const stages: string[] = [];
  const mixLabels: string[] = [];
  let nextIndex = 0;

  if (input.musicTrack && input.musicDurationSeconds !== null) {
    const idx = nextIndex++;
    inputPaths.push(input.musicTrack.inputPath);

    stages.push(
      buildMusicFilterChain(`${idx}:a`, input.musicDurationSeconds, input.durationSeconds, input.musicTrack, "music_base"),
    );

    const windows = computeDuckingWindows(input.narrationSegments);
    const volumeExpr = buildDuckingVolumeExpression(windows, input.ducking);
    stages.push(`[music_base]volume=volume='${volumeExpr}':eval=frame[music_ducked]`);
    stages.push(`[music_ducked]aformat=sample_rates=44100:channel_layouts=stereo[music_final]`);
    mixLabels.push("music_final");
  }

  const readyNarration = input.narrationSegments.filter(
    (segment): segment is NarrationSegment & { audioPath: string } => segment.status === "READY" && segment.audioPath !== null,
  );
  readyNarration.forEach((segment, i) => {
    const idx = nextIndex++;
    inputPaths.push(segment.audioPath);
    const delayMs = Math.max(0, Math.round(segment.startTime * 1000));
    const label = `narr_${i}`;
    stages.push(`[${idx}:a]adelay=${delayMs}:all=1,aformat=sample_rates=44100:channel_layouts=stereo[${label}]`);
    mixLabels.push(label);
  });

  input.sfxEvents.forEach((event, i) => {
    const idx = nextIndex++;
    inputPaths.push(event.inputPath);
    const delayMs = Math.max(0, Math.round(event.startTime * 1000));
    const label = `sfx_${i}`;
    stages.push(`[${idx}:a]volume=${event.volume},adelay=${delayMs}:all=1,aformat=sample_rates=44100:channel_layouts=stereo[${label}]`);
    mixLabels.push(label);
  });

  if (mixLabels.length === 0) {
    stages.push(`anullsrc=channel_layout=stereo:sample_rate=44100:d=${input.durationSeconds}[premaster]`);
  } else if (mixLabels.length === 1) {
    stages.push(`[${mixLabels[0]}]apad,atrim=0:${input.durationSeconds}[premaster]`);
  } else {
    const refs = mixLabels.map((label) => `[${label}]`).join("");
    stages.push(`${refs}amix=inputs=${mixLabels.length}:duration=longest:normalize=0[premixed]`);
    stages.push(`[premixed]apad,atrim=0:${input.durationSeconds}[premaster]`);
  }

  // loudnorm single-pass ("dynamic") NAO garante true-peak com precisao -
  // e so uma aproximacao (ver relatorio). Por isso um alimiter roda DEPOIS,
  // como rede de seguranca real contra clipping - unico lugar de toda a
  // cadeia onde um limiter e aplicado, e so no master (nunca em cada
  // source individual, ver item 12).
  stages.push(
    `[premaster]loudnorm=I=${MASTER_LOUDNESS_TARGET_LUFS}:TP=${MASTER_TRUE_PEAK_DBTP}:LRA=${MASTER_LOUDNESS_RANGE_LU}[loudnormed]`,
  );
  stages.push(
    `[loudnormed]alimiter=limit=${MASTER_LIMITER_LINEAR}:attack=${MASTER_LIMITER_ATTACK_MS}:release=${MASTER_LIMITER_RELEASE_MS}:level=disabled[master]`,
  );

  return { inputPaths, filterComplex: stages.join(";"), outputLabel: "master" };
}
