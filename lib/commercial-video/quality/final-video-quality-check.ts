import { spawnSync } from "node:child_process";
import fs from "node:fs";

import { findFfprobePath } from "@/lib/commercial-video/final-video-codec-policy";
import type {
  CommercialQualityIssue,
  CommercialQualityStatus,
  FinalVideoProbe,
  FinalVideoTechnicalQualityResult,
} from "@/lib/commercial-video/quality/types";

function parseFps(raw: string | undefined): number | null {
  if (!raw) return null;
  const [num, den] = raw.split("/").map(Number);
  if (!Number.isFinite(num)) return null;
  if (!den) return num;
  return num / den;
}

export function probeFinalVideoFile(filePath: string): FinalVideoProbe {
  if (!fs.existsSync(filePath)) {
    return {
      valid: false,
      durationSeconds: null,
      width: null,
      height: null,
      fps: null,
      videoCodec: null,
      videoEncoder: null,
      audioCodec: null,
      audioStreamCount: 0,
      error: `Arquivo nao encontrado: ${filePath}`,
    };
  }

  const result = spawnSync(findFfprobePath(), ["-v", "error", "-show_format", "-show_streams", "-print_format", "json", filePath]);
  if (result.status !== 0) {
    return {
      valid: false,
      durationSeconds: null,
      width: null,
      height: null,
      fps: null,
      videoCodec: null,
      videoEncoder: null,
      audioCodec: null,
      audioStreamCount: 0,
      error: result.stderr?.toString() || "ffprobe falhou.",
    };
  }

  const data = JSON.parse(result.stdout.toString()) as {
    format?: { duration?: string; tags?: Record<string, string> };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      tags?: Record<string, string>;
    }>;
  };
  const videoStream = data.streams?.find((stream) => stream.codec_type === "video");
  const audioStreams = data.streams?.filter((stream) => stream.codec_type === "audio") ?? [];

  return {
    valid: Boolean(videoStream),
    durationSeconds: data.format?.duration ? Number(data.format.duration) : null,
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null,
    fps: parseFps(videoStream?.r_frame_rate),
    videoCodec: videoStream?.codec_name ?? null,
    videoEncoder: videoStream?.tags?.encoder ?? data.format?.tags?.encoder ?? null,
    audioCodec: audioStreams[0]?.codec_name ?? null,
    audioStreamCount: audioStreams.length,
    error: videoStream ? null : "Nenhum stream de video encontrado.",
  };
}

export function assessFinalVideoTechnicalQuality(input: {
  probe: FinalVideoProbe;
  expectedWidth?: number;
  expectedHeight?: number;
  expectedFps?: number;
  expectedVideoCodec?: string;
  allowLegacyEncoderObservation?: boolean;
}): FinalVideoTechnicalQualityResult {
  const expectedWidth = input.expectedWidth ?? 1080;
  const expectedHeight = input.expectedHeight ?? 1920;
  const expectedFps = input.expectedFps ?? 24;
  const issues: CommercialQualityIssue[] = [];
  const probe = input.probe;

  if (!probe.valid) {
    issues.push({ category: "INVALID_MP4", severity: "CRITICAL", message: probe.error ?? "MP4 invalido." });
  }
  if (probe.width !== expectedWidth || probe.height !== expectedHeight) {
    issues.push({
      category: "INVALID_VIDEO_DIMENSIONS",
      severity: "CRITICAL",
      message: `Dimensoes finais ${probe.width}x${probe.height}; esperado ${expectedWidth}x${expectedHeight}.`,
    });
  }
  if (probe.fps === null || Math.abs(probe.fps - expectedFps) > 0.01) {
    issues.push({ category: "INVALID_VIDEO_FPS", severity: "CRITICAL", message: `FPS final ${probe.fps}; esperado ${expectedFps}.` });
  }
  if (probe.audioStreamCount < 1) {
    issues.push({ category: "MISSING_AUDIO_STREAM", severity: "CRITICAL", message: "MP4 final sem stream de audio." });
  }
  if (input.expectedVideoCodec && probe.videoCodec !== input.expectedVideoCodec) {
    issues.push({
      category: "INVALID_VIDEO_CODEC",
      severity: input.allowLegacyEncoderObservation ? "NON_BLOCKING" : "CRITICAL",
      message: `Codec de video final "${probe.videoCodec}"; esperado "${input.expectedVideoCodec}" para novos renders.`,
    });
  }

  const blocking = issues.some((issue) => issue.severity === "BLOCKING" || issue.severity === "CRITICAL");
  const status: CommercialQualityStatus = blocking ? "FAIL" : issues.length > 0 ? "PASS_WITH_OBSERVATIONS" : "PASS";
  return { status, issues, probe };
}
