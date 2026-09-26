import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const FINAL_VIDEO_CODEC_POLICY = {
  videoCodec: "h264",
  codecTagString: "avc1",
  audioCodec: "aac",
  windowsEncoder: "h264_mf",
  forbiddenEncoders: ["libx264"],
  forbiddenFinalCodecs: ["mpeg4", "mp4v"],
} as const;

export type FinalVideoEncoderReadiness = {
  ready: boolean;
  ffmpegPath: string;
  ffprobePath: string;
  encoder: typeof FINAL_VIDEO_CODEC_POLICY.windowsEncoder;
  platform: NodeJS.Platform;
  reason: string | null;
};

export type FfmpegPathConfigurable = {
  setFfmpegPath(path: string): void;
  setFfprobePath?: (path: string) => void;
};

export function findFfmpegPath(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;

  const capcutAppsDir = path.join(process.env.LOCALAPPDATA ?? "", "CapCut", "Apps");
  if (capcutAppsDir && fs.existsSync(capcutAppsDir)) {
    const candidates = fs
      .readdirSync(capcutAppsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(capcutAppsDir, entry.name, "ffmpeg.exe"))
      .filter((candidate) => fs.existsSync(candidate))
      .sort()
      .reverse();
    if (candidates[0]) return candidates[0];
  }

  try {
    const command = process.platform === "win32" ? "where" : "which";
    const result = execFileSync(command, ["ffmpeg"], { encoding: "utf8" }).split("\n")[0]?.trim();
    if (result && fs.existsSync(result)) return result;
  } catch {
    // Fallback handled by callers; ffmpeg may still be on PATH.
  }
  return "ffmpeg";
}

export function findFfprobePath(): string {
  if (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) return process.env.FFPROBE_PATH;

  const ffmpegPath = findFfmpegPath();
  const siblingName = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
  const sibling = path.join(path.dirname(ffmpegPath), siblingName);
  if (fs.existsSync(sibling)) return sibling;

  const remotionDir = path.join(process.cwd(), "node_modules", "@remotion");
  if (fs.existsSync(remotionDir)) {
    const candidates = fs
      .readdirSync(remotionDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("compositor-"))
      .map((entry) => path.join(remotionDir, entry.name, siblingName))
      .filter((candidate) => fs.existsSync(candidate))
      .sort()
      .reverse();
    if (candidates[0]) return candidates[0];
  }

  try {
    const command = process.platform === "win32" ? "where" : "which";
    const result = execFileSync(command, ["ffprobe"], { encoding: "utf8" }).split("\n")[0]?.trim();
    if (result && fs.existsSync(result)) return result;
  } catch {
    // Fallback handled by callers; ffprobe may still be on PATH.
  }
  return "ffprobe";
}

export function assertFinalVideoEncoderReady(): FinalVideoEncoderReadiness {
  const ffmpegPath = findFfmpegPath();
  const ffprobePath = findFfprobePath();
  try {
    const encoders = execFileSync(ffmpegPath, ["-hide_banner", "-encoders"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const ready = new RegExp(`\\b${FINAL_VIDEO_CODEC_POLICY.windowsEncoder}\\b`).test(encoders);
    return {
      ready,
      ffmpegPath,
      ffprobePath,
      encoder: FINAL_VIDEO_CODEC_POLICY.windowsEncoder,
      platform: process.platform,
      reason: ready ? null : `${FINAL_VIDEO_CODEC_POLICY.windowsEncoder} nao listado em ffmpeg -encoders.`,
    };
  } catch (error) {
    return {
      ready: false,
      ffmpegPath,
      ffprobePath,
      encoder: FINAL_VIDEO_CODEC_POLICY.windowsEncoder,
      platform: process.platform,
      reason: error instanceof Error ? error.message : "Falha desconhecida ao verificar ffmpeg -encoders.",
    };
  }
}

export function configureCommercialFfmpegPaths(ffmpegFactory: FfmpegPathConfigurable): void {
  ffmpegFactory.setFfmpegPath(findFfmpegPath());
  ffmpegFactory.setFfprobePath?.(findFfprobePath());
}
