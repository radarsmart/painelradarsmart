// Radar Creative AI - Audio Pipeline / Audio Mixer
//
// UNICA parte impura da mixagem: mede a duracao real da musica (ffprobe),
// monta o plano de mixagem (audio-filter-graph.ts, puro) e roda UM ffmpeg
// com todos os inputs (musica + narracoes READY + SFX validos) pra
// produzir uma faixa .wav (intermediaria, sem perda - a codificacao AAC
// final acontece so no mux com o video, ver final-mux.ts).

import { spawnSync } from "node:child_process";
import ffmpeg from "fluent-ffmpeg";

import { buildAudioMixPlan } from "@/lib/commercial-video/audio/audio-filter-graph";
import { probeAudioDurationSeconds } from "@/lib/commercial-video/audio/narration-track";
import { filterValidSfxEvents } from "@/lib/commercial-video/audio/sfx-track";
import type { CommercialAudioTimeline } from "@/lib/commercial-video/audio/types";
import { configureCommercialFfmpegPaths, findFfmpegPath } from "@/lib/commercial-video/final-video-codec-policy";

export type MixCommercialAudioResult = {
  status: "COMPLETED" | "FAILED";
  outputPath: string | null;
  durationSeconds: number | null;
  error: string | null;
};

export async function mixCommercialAudio(
  timeline: CommercialAudioTimeline,
  outputPath: string,
): Promise<MixCommercialAudioResult> {
  configureCommercialFfmpegPaths(ffmpeg);

  try {
    const musicDurationSeconds = timeline.musicTrack ? await probeAudioDurationSeconds(timeline.musicTrack.inputPath) : null;
    const validSfxEvents = filterValidSfxEvents(timeline.sfxEvents, timeline.durationSeconds);

    const plan = buildAudioMixPlan({
      durationSeconds: timeline.durationSeconds,
      musicTrack: timeline.musicTrack,
      musicDurationSeconds,
      narrationSegments: timeline.narrationSegments,
      sfxEvents: validSfxEvents,
      ducking: timeline.ducking,
    });

    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg();
      for (const inputPath of plan.inputPaths) {
        command = command.input(inputPath);
      }
      command
        .complexFilter(plan.filterComplex, plan.outputLabel)
        .outputOptions(["-c:a", "pcm_s16le"])
        .on("error", (error) => reject(error))
        .on("end", () => resolve())
        .save(outputPath);
    });

    const durationSeconds = await probeAudioDurationSeconds(outputPath);
    return { status: "COMPLETED", outputPath, durationSeconds, error: null };
  } catch (error) {
    return {
      status: "FAILED",
      outputPath: null,
      durationSeconds: null,
      error: error instanceof Error ? error.message : "Erro desconhecido no Audio Mixer.",
    };
  }
}

/**
 * Mede o pico real (dBFS) do arquivo de audio via o filtro `astats` -
 * clippingDetected e uma inferencia HONESTA a partir dessa medicao (pico
 * >= -0.1dBFS), nunca uma garantia formal de ausencia de clipping em cada
 * amostra.
 *
 * IMPORTANTE (bug real encontrado e corrigido durante o teste desta
 * fase): `reset=1` faz o astats reiniciar as estatisticas a cada "frame"
 * interno do filtro - o tamanho desse frame varia conforme o pipeline de
 * decodificacao (para AAC decodificado, chegaram so 3 frames em 18s de
 * audio), entao o "Peak level dB" de cada frame individual pode nunca
 * coincidir com o pico real do arquivo inteiro. SEM reset, o astats
 * imprime o pico CUMULATIVO (monotonico - so cresce conforme mais amostras
 * sao vistas), entao o maior valor entre todas as linhas impressas sempre
 * converge pro pico real do arquivo completo - e isso que usamos aqui.
 */
export function measurePeakLevelDb(filePath: string): number | null {
  const ffmpegPath = findFfmpegPath();
  // spawnSync (nao execFileSync) porque precisamos do STDERR mesmo quando
  // o processo sai com codigo 0 - e onde o ffmpeg imprime as metricas do
  // filtro astats (a saida real do arquivo vai pro muxer "null", descartada
  // de proposito).
  const result = spawnSync(ffmpegPath, ["-i", filePath, "-af", "astats=metadata=0", "-f", "null", "-"]);
  const stderr = result.stderr ? result.stderr.toString() : "";
  return parsePeakLevelFromAstats(stderr);
}

/**
 * Mede a loudness integrada REAL (LUFS) do arquivo final via uma segunda
 * passada do proprio filtro `loudnorm` em modo `print_format=json` -
 * so LEITURA/analise (o audio de saida vai pro muxer "null", nunca
 * sobrescreve o arquivo). Isso e diferente do loudnorm ja aplicado durante
 * a mixagem (esse so normaliza); aqui e so pra reportar a metrica real
 * medida no MixQualityResult, nunca inferida.
 */
export function measureIntegratedLoudnessLUFS(filePath: string): number | null {
  const ffmpegPath = findFfmpegPath();
  const result = spawnSync(ffmpegPath, [
    "-i", filePath,
    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json",
    "-f", "null", "-",
  ]);
  const stderr = result.stderr ? result.stderr.toString() : "";
  const match = stderr.match(/"input_i"\s*:\s*"(-?\d+(\.\d+)?)"/);
  return match ? Number(match[1]) : null;
}

export function parsePeakLevelFromAstats(astatsOutput: string): number | null {
  const matches = [...astatsOutput.matchAll(/Peak level dB:\s*(-?\d+(\.\d+)?)/g)];
  if (matches.length === 0) return null;
  const values = matches.map((match) => Number(match[1]));
  return Math.max(...values);
}
