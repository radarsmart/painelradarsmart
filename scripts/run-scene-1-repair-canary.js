const fs = require("node:fs");
const fsp = require("node:fs/promises");
const Module = require("node:module");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");
const dotenv = require("dotenv");

const root = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(root, ".env.local") });
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(root, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function loadTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const originalFetch = global.fetch;
let postCount = 0;

global.fetch = async (input, init) => {
  const method = String(init?.method ?? "GET").toUpperCase();
  if (method === "POST") postCount += 1;
  if (postCount > 1) {
    throw new Error(`POST limit exceeded: ${postCount}`);
  }
  return originalFetch(input, init);
};

const { executeWanTextToVideo, describeWanTextToVideoRequest, validateWanTextToVideoRequest } = require("../lib/generation-orchestrator/adapters/wan-2-5-text-to-video.ts");
const { estimateSceneCost } = require("../lib/generation-orchestrator/cost-estimator.ts");

const campaignId = "5a0b6e06-d467-442e-bfdb-ba98a823eb80";
const sceneId = "scene-1";
const provider = "wan-2-5-t2v";
const model = "wan-2-5-t2v-1080p";
const generationDuration = "5";
const targetSceneDuration = 3;
const maxCredits = 1500;

const prompt = [
  "Premium abstract commercial background for a vertical Brazilian social media deal video hook.",
  "Clean cinematic retail ambience, polished dark navy and warm gold lighting, soft depth of field, subtle motion, elegant light sweeps.",
  "Empty hero background only, no foreground object, no product, no person, no readable content.",
  "Professional 9:16 advertising background, commercially usable, stable, modern, high quality.",
].join(" ");

const negativePrompt = [
  "product",
  "products",
  "product packaging",
  "package",
  "packages",
  "bottle",
  "bottles",
  "people",
  "person",
  "human",
  "face",
  "text",
  "typography",
  "letters",
  "words",
  "logo",
  "logos",
  "brand",
  "brands",
  "price",
  "prices",
  "discount",
  "discounts",
  "discount label",
  "watermark",
].join(", ");

function findBinary(name) {
  if (name === "ffmpeg" && process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  try {
    return execFileSync(process.platform === "win32" ? "where" : "which", [name]).toString().split("\n")[0].trim();
  } catch {
    return name;
  }
}

async function downloadVideo(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} while downloading output video`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) throw new Error("Downloaded video is empty");
  await fsp.writeFile(outputPath, buffer);
}

function probeVideo(videoPath) {
  const ffprobe = findBinary("ffprobe");
  const raw = execFileSync(ffprobe, ["-v", "error", "-show_format", "-show_streams", "-print_format", "json", videoPath]).toString();
  const data = JSON.parse(raw);
  const video = data.streams.find((stream) => stream.codec_type === "video");
  const audioStreams = data.streams.filter((stream) => stream.codec_type === "audio");
  const [num, den] = String(video?.r_frame_rate ?? "0/1").split("/").map(Number);
  return {
    durationSeconds: Number(data.format?.duration ?? 0),
    width: Number(video?.width ?? 0),
    height: Number(video?.height ?? 0),
    fps: den ? num / den : num,
    videoCodec: video?.codec_name ?? null,
    videoEncoder: video?.tags?.encoder ?? data.format?.tags?.encoder ?? null,
    audioStreamCount: audioStreams.length,
  };
}

function extractFrames(videoPath, framesDir, durationSeconds) {
  const ffmpeg = findBinary("ffmpeg");
  fs.mkdirSync(framesDir, { recursive: true });
  const timestamps = [
    0,
    durationSeconds * 0.25,
    durationSeconds * 0.5,
    durationSeconds * 0.75,
    Math.max(0, durationSeconds - 0.15),
  ];
  const framePaths = timestamps.map((time, index) => {
    const framePath = path.join(framesDir, `frame-${index + 1}.jpg`);
    execFileSync(ffmpeg, ["-y", "-ss", time.toFixed(3), "-i", videoPath, "-frames:v", "1", "-q:v", "2", framePath], { stdio: "ignore" });
    return framePath;
  });
  const contactSheet = path.join(framesDir, "contact-sheet.jpg");
  execFileSync(ffmpeg, ["-y", "-framerate", "1", "-i", path.join(framesDir, "frame-%d.jpg"), "-vf", "scale=360:-1,tile=5x1", "-frames:v", "1", contactSheet], { stdio: "ignore" });
  return { timestamps, framePaths, contactSheet };
}

async function main() {
  const request = { prompt, negativePrompt, duration: generationDuration };
  const validation = validateWanTextToVideoRequest(request);
  const estimate = estimateSceneCost(provider, targetSceneDuration);
  const preflight = {
    campaignId,
    sceneId,
    purpose: "HOOK",
    strategy: "STRICT_BACKGROUND_REGENERATION",
    provider,
    model,
    generationDuration,
    targetSceneDuration,
    estimatedCredits: estimate.estimatedCredits,
    maxCredits,
    submitsAllowed: 1,
    retries: 0,
    fallback: 0,
    request: describeWanTextToVideoRequest(request),
    validation,
  };

  if (!validation.ok) throw new Error(validation.reason);
  if (estimate.estimatedCredits !== 1500 || estimate.estimatedCredits > maxCredits) {
    throw new Error(`Cost guard blocked: estimatedCredits=${estimate.estimatedCredits}, maxCredits=${maxCredits}`);
  }

  const outputDir = path.join(root, "temp", "scene-1-repair-canary");
  const framesDir = path.join(outputDir, "frames");
  fs.mkdirSync(outputDir, { recursive: true });
  await fsp.writeFile(path.join(outputDir, "preflight.json"), JSON.stringify(preflight, null, 2));

  const startedAt = new Date().toISOString();
  const wanResult = await executeWanTextToVideo(request);
  const completedAt = new Date().toISOString();

  const report = {
    campaignId,
    sceneId,
    provider,
    model,
    generationDuration,
    targetSceneDuration,
    estimatedCredits: estimate.estimatedCredits,
    maxCredits,
    submits: postCount,
    retries: 0,
    fallback: 0,
    startedAt,
    completedAt,
    wanResult,
    localVideoPath: null,
    frames: null,
    probe: null,
    storageAltered: false,
    databaseAltered: false,
  };

  if (wanResult.status !== "success" || !wanResult.outputUrl) {
    await fsp.writeFile(path.join(outputDir, "scene-1-repair-canary-result.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const localVideoPath = path.join(outputDir, "scene-1-repair-wan-output.mp4");
  await downloadVideo(wanResult.outputUrl, localVideoPath);
  const probe = probeVideo(localVideoPath);
  const frames = extractFrames(localVideoPath, framesDir, probe.durationSeconds);

  report.localVideoPath = localVideoPath;
  report.frames = frames;
  report.probe = probe;

  await fsp.writeFile(path.join(outputDir, "scene-1-repair-canary-result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
