// Radar Creative AI - Audio Pipeline / Final Mux
//
// Ultimo passo: combina o MP4 visual (mudo, ja validado no Scene Assembly/
// Real Scene Asset Integration) com a faixa de audio mixada (.wav, ver
// audio-mixer.ts) num MP4 unico. Video sem reencode (-c:v copy) quando
// tecnicamente seguro (mesmo container/codec de origem); audio sempre
// codificado em AAC (compatibilidade MP4). Por padrao, qualquer audio
// ORIGINAL que porventura exista no MP4 visual (ex: um source WAN que
// tinha trilha propria) e IGNORADO - nunca vaza pro comercial final sem
// opt-in explicito (ver item 14).

import ffmpeg from "fluent-ffmpeg";

import { configureCommercialFfmpegPaths } from "@/lib/commercial-video/final-video-codec-policy";

export type FinalMuxOptions = {
  visualVideoPath: string;
  mixedAudioPath: string;
  outputPath: string;
  // Default false - audio original do clipe visual (se existir) nunca
  // entra no mux automaticamente. Ligar isso e uma decisao explicita
  // futura, fora do escopo desta V1.
  includeOriginalVideoAudio?: boolean;
};

export type FinalMuxResult = {
  status: "COMPLETED" | "FAILED";
  outputPath: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  audioCodec: string | null;
  audioStreamCount: number | null;
  error: string | null;
};

function probeFinal(outputPath: string): Promise<{
  duration: number;
  width: number;
  height: number;
  fps: number;
  audioCodec: string | null;
  audioStreamCount: number;
}> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(outputPath, (err, data) => {
      if (err) return reject(err);
      const videoStream = data.streams.find((s) => s.codec_type === "video");
      const audioStreams = data.streams.filter((s) => s.codec_type === "audio");
      if (!videoStream) return reject(new Error("Output final nao tem stream de video."));

      const fpsRaw = videoStream.r_frame_rate ?? "0/1";
      const [num, den] = fpsRaw.split("/").map(Number);

      resolve({
        duration: Number(data.format.duration ?? 0),
        width: Number(videoStream.width ?? 0),
        height: Number(videoStream.height ?? 0),
        fps: den ? num / den : 0,
        audioCodec: audioStreams[0]?.codec_name ?? null,
        audioStreamCount: audioStreams.length,
      });
    });
  });
}

export async function muxFinalCommercial(options: FinalMuxOptions): Promise<FinalMuxResult> {
  configureCommercialFfmpegPaths(ffmpeg);

  try {
    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg().input(options.visualVideoPath).input(options.mixedAudioPath);

      const outputOptions = options.includeOriginalVideoAudio
        ? ["-map", "0:v:0", "-map", "0:a?", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest"]
        : ["-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest"];

      command
        .outputOptions(outputOptions)
        .on("error", (error) => reject(error))
        .on("end", () => resolve())
        .save(options.outputPath);
    });

    const probed = await probeFinal(options.outputPath);
    return {
      status: "COMPLETED",
      outputPath: options.outputPath,
      duration: probed.duration,
      width: probed.width,
      height: probed.height,
      fps: probed.fps,
      audioCodec: probed.audioCodec,
      audioStreamCount: probed.audioStreamCount,
      error: null,
    };
  } catch (error) {
    return {
      status: "FAILED",
      outputPath: null,
      duration: null,
      width: null,
      height: null,
      fps: null,
      audioCodec: null,
      audioStreamCount: null,
      error: error instanceof Error ? error.message : "Erro desconhecido no Final Mux.",
    };
  }
}
