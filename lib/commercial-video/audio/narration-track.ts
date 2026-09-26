// Radar Creative AI - Audio Pipeline / Narration Track
//
// NarrationProvider e a interface que um futuro adapter de TTS real
// (ex: envolvendo lib/ugc/audio.ts#generateElevenLabsAudio, ja usado hoje
// pelo pipeline de avatar UGC) implementaria. NENHUM provider pago e
// chamado nesta tarefa - so LocalNarrationProvider (audio ja gravado, so
// mede duracao real) e MockNarrationProvider (gera um tom sintetico via
// ffmpeg, nunca uma voz de verdade).
//
// O TEXTO da narracao nunca e inventado aqui - vem de um mapa explicito
// (sceneId -> texto) fornecido pelo chamador. Esta camada NAO gera copy;
// ela so decide como transformar um texto ja pronto em audio e verificar
// se cabe na janela da cena (ver resolveNarrationSegment).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";

import { configureCommercialFfmpegPaths, findFfmpegPath } from "@/lib/commercial-video/final-video-codec-policy";
import type { AudioAssetSource, NarrationSegment } from "@/lib/commercial-video/audio/types";

export type NarrationProviderRequest = {
  sceneId: string;
  text: string;
  maxDurationSeconds: number;
};

export type NarrationProviderResult = {
  status: "COMPLETED" | "FAILED";
  source: AudioAssetSource;
  audioPath: string | null;
  actualDurationSeconds: number | null;
  error: string | null;
};

export interface NarrationProvider {
  readonly name: string;
  synthesize(request: NarrationProviderRequest): Promise<NarrationProviderResult>;
}

export function probeAudioDurationSeconds(filePath: string): Promise<number> {
  configureCommercialFfmpegPaths(ffmpeg);
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      resolve(Number(data.format.duration ?? 0));
    });
  });
}

/**
 * Recebe um mapa JA PRONTO sceneId -> caminho de audio local (ex: narracao
 * gravada manualmente ou baixada de um provider real em uma sessao
 * anterior) - nunca inventa caminho, nunca gera audio. So mede a duracao
 * real do arquivo.
 */
export class LocalNarrationProvider implements NarrationProvider {
  readonly name = "LOCAL_ASSET" as const;

  constructor(private readonly audioPathsBySceneId: Record<string, string>) {}

  async synthesize(request: NarrationProviderRequest): Promise<NarrationProviderResult> {
    const audioPath = this.audioPathsBySceneId[request.sceneId];
    if (!audioPath || !fs.existsSync(audioPath)) {
      return {
        status: "FAILED",
        source: "LOCAL_ASSET",
        audioPath: null,
        actualDurationSeconds: null,
        error: `Nenhum audio local registrado para a cena ${request.sceneId} (esperado em ${audioPath ?? "(nao informado)"}).`,
      };
    }

    try {
      const duration = await probeAudioDurationSeconds(audioPath);
      return { status: "COMPLETED", source: "LOCAL_ASSET", audioPath, actualDurationSeconds: duration, error: null };
    } catch (error) {
      return {
        status: "FAILED",
        source: "LOCAL_ASSET",
        audioPath: null,
        actualDurationSeconds: null,
        error: error instanceof Error ? error.message : "Erro ao medir duracao do audio local.",
      };
    }
  }
}

// Heuristica GROSSEIRA e documentada (nunca apresentada como modelo real
// de fala) so pra dar ao MOCK uma duracao controlavel/proporcional ao
// tamanho do texto - usada exclusivamente pra permitir testes
// deterministicos (narracao curta cabe, narracao "grande" propositalmente
// estoura a janela, ver teste NARRATION_TOO_LONG).
const MOCK_CHARS_PER_SECOND = 15;
const MOCK_MIN_DURATION_SECONDS = 0.5;

export function estimateMockNarrationDurationSeconds(text: string): number {
  return Math.max(MOCK_MIN_DURATION_SECONDS, text.length / MOCK_CHARS_PER_SECOND);
}

/**
 * Gera um TOM SINTETICO (nunca uma voz) com duracao proporcional ao
 * tamanho do texto - existe so pra validar a arquitetura de sincronizacao/
 * timing sem depender de nenhuma API de TTS.
 */
export class MockNarrationProvider implements NarrationProvider {
  readonly name = "MOCK" as const;

  constructor(private readonly outputDir: string) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  async synthesize(request: NarrationProviderRequest): Promise<NarrationProviderResult> {
    const durationSeconds = estimateMockNarrationDurationSeconds(request.text);
    const outputPath = path.join(this.outputDir, `narration-mock-${request.sceneId}.wav`);
    const ffmpegPath = findFfmpegPath();

    try {
      execFileSync(ffmpegPath, [
        "-y",
        "-f", "lavfi",
        "-i", `sine=frequency=220:duration=${durationSeconds.toFixed(3)}:sample_rate=44100`,
        "-af", "volume=0.5",
        outputPath,
      ]);

      const actualDurationSeconds = await probeAudioDurationSeconds(outputPath);
      return { status: "COMPLETED", source: "MOCK", audioPath: outputPath, actualDurationSeconds, error: null };
    } catch (error) {
      return {
        status: "FAILED",
        source: "MOCK",
        audioPath: null,
        actualDurationSeconds: null,
        error: error instanceof Error ? error.message : "Erro ao gerar tom sintetico de narracao mock.",
      };
    }
  }
}

/**
 * Cena sem texto (`text === null`) e SEMPRE valida - nunca tratada como
 * erro (ver item 7, "silencio"). Quando ha texto, o provider sintetiza e o
 * resultado e comparado contra maxDurationSeconds: excedeu -> NARRATION_TOO_LONG
 * (audioPath ainda e preenchido, pra permitir inspecao/debug, mas o
 * status deixa explicito que esse segmento NAO deve entrar no mix final).
 * Nunca corta a fala silenciosamente pra caber.
 */
export async function resolveNarrationSegment(
  sceneId: string,
  text: string | null,
  startTime: number,
  maxDurationSeconds: number,
  provider: NarrationProvider,
): Promise<NarrationSegment> {
  if (text === null) {
    return {
      sceneId,
      text: null,
      startTime,
      maxDurationSeconds,
      source: null,
      audioPath: null,
      actualDurationSeconds: null,
      status: "SILENT",
      error: null,
    };
  }

  const result = await provider.synthesize({ sceneId, text, maxDurationSeconds });

  if (result.status === "FAILED" || !result.audioPath) {
    return {
      sceneId,
      text,
      startTime,
      maxDurationSeconds,
      source: null,
      audioPath: null,
      actualDurationSeconds: null,
      status: "MISSING_ASSET",
      error: result.error,
    };
  }

  if (result.actualDurationSeconds !== null && result.actualDurationSeconds > maxDurationSeconds) {
    return {
      sceneId,
      text,
      startTime,
      maxDurationSeconds,
      source: result.source,
      audioPath: result.audioPath,
      actualDurationSeconds: result.actualDurationSeconds,
      status: "NARRATION_TOO_LONG",
      error: `Narracao (${result.actualDurationSeconds.toFixed(2)}s) excede a janela da cena (${maxDurationSeconds.toFixed(2)}s) - nao cortada, bloqueada.`,
    };
  }

  return {
    sceneId,
    text,
    startTime,
    maxDurationSeconds,
    source: result.source,
    audioPath: result.audioPath,
    actualDurationSeconds: result.actualDurationSeconds,
    status: "READY",
    error: null,
  };
}
