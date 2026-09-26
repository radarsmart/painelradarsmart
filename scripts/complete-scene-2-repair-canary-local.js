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
global.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input?.url;
  const method = String(init?.method ?? "GET").toUpperCase();
  if (method === "POST") {
    throw new Error(`POST bloqueado na fase local: ${url}`);
  }
  return originalFetch(input, init);
};

const {
  buildHybridCompositeRequestFromPlan,
  resolveProductGrounding,
  runHybridProductComposite,
} = require("../lib/compositor/hybrid-product-compositor.ts");
const {
  buildOfferDrawtextFilter,
  resolveDrawTextFont,
} = require("../lib/commercial-video/overlay-renderer.ts");

const sceneId = "scene-2";
const outputDir = path.join(root, "temp", "scene-2-repair-canary");
const hybridDir = path.join(outputDir, "hybrid-scene-2");
const framesDir = path.join(outputDir, "frames");
const resultPath = path.join(outputDir, "scene-2-repair-canary-result.json");
const backgroundPath = path.join(outputDir, "scene-2-wan-background.mp4");
const cutoutPath = path.join(hybridDir, "product-cutout.png");
const targetSceneDuration = 4;
const priceText = "R$ 49,90";
const discountText = null;

const prompt = [
  "Premium commercial advertising background for a vertical Brazilian short-form offer video.",
  "Clean neutral studio retail ambience, dark navy and warm gold lighting, polished reflective surface, soft depth of field.",
  "Composition leaves clear left foreground space and right safe area for post-production price overlay.",
  "Subtle ambient motion only, coherent lighting, stable high quality background.",
].join(" ");

const negativePrompt = [
  "product",
  "products",
  "package",
  "packages",
  "bottle",
  "bottles",
  "person",
  "people",
  "human",
  "face",
  "text",
  "typography",
  "letters",
  "logo",
  "logos",
  "brand",
  "brands",
  "price",
  "prices",
  "discount",
  "discounts",
  "watermark",
].join(", ");

function findBinary(name) {
  if (name === "ffmpeg" && process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  if (name === "ffprobe" && process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) return process.env.FFPROBE_PATH;
  try {
    return execFileSync(process.platform === "win32" ? "where" : "which", [name]).toString().split("\n")[0].trim();
  } catch {
    return name;
  }
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

function applyPriceOverlay(inputPath, outputPath) {
  const resolvedFont = resolveDrawTextFont();
  if (!resolvedFont) throw new Error("Nenhuma fonte drawtext encontrada para aplicar priceText.");
  const offerFilter = buildOfferDrawtextFilter(resolvedFont.fontPath, discountText, priceText, "RIGHT");
  if (!offerFilter) throw new Error("Offer overlay nao foi construido.");
  const ffmpeg = findBinary("ffmpeg");
  execFileSync(ffmpeg, [
    "-y",
    "-i",
    inputPath,
    "-vf",
    offerFilter,
    "-t",
    String(targetSceneDuration),
    "-an",
    "-c:v",
    "mpeg4",
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);
  return { fontUsed: resolvedFont.fontPath, safeAreaDirection: "RIGHT" };
}

function extractFrames(videoPath, durationSeconds) {
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
  const report = JSON.parse(await fsp.readFile(resultPath, "utf8"));
  if (report.submits !== 1 || report.wanResult?.taskId !== "4bedc3aa-dc3d-4464-b35a-fb13c09b722f") {
    throw new Error("Relatorio base nao corresponde ao unico POST autorizado.");
  }
  if (!fs.existsSync(backgroundPath)) throw new Error(`Background nao encontrado: ${backgroundPath}`);
  if (!fs.existsSync(cutoutPath)) throw new Error(`Cutout nao encontrado: ${cutoutPath}`);
  if (report.cutout?.qualityReport?.quality !== "PASS") {
    throw new Error(`cutoutQuality != PASS: ${JSON.stringify(report.cutout?.qualityReport)}`);
  }

  const compositePath = path.join(hybridDir, "scene-2-hybrid-grounded-no-price.mp4");
  const hybridPlan = {
    productReferenceUrl: report.productReference.url,
    backgroundGenerationPrompt: prompt,
    backgroundNegativePrompt: negativePrompt,
    productPlacement: "LEFT",
    cameraMotion: "subtle ambient background motion only",
    preserveProductPixels: true,
    overlayInstructions: { priceText, discountText, ctaText: null },
  };
  const compositeRequest = buildHybridCompositeRequestFromPlan(hybridPlan, {
    backgroundVideoPath: backgroundPath,
    productImagePath: cutoutPath,
    outputPath: compositePath,
    durationSeconds: targetSceneDuration,
    aspectRatio: "9:16",
    productMotion: "NONE",
    backgroundRemovalMode: "PREPROCESSED_ALPHA",
  });
  report.hybridComposite = await runHybridProductComposite({
    ...compositeRequest,
    productGrounding: resolveProductGrounding({ enabled: true }),
  });
  if (report.hybridComposite.status !== "COMPLETED" || !report.hybridComposite.outputPath) {
    await fsp.writeFile(resultPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const finalPath = path.join(outputDir, "scene-2-repair-hybrid-final.mp4");
  report.priceOverlay = applyPriceOverlay(report.hybridComposite.outputPath, finalPath);
  report.finalLocalPath = finalPath;
  report.probe = probeVideo(finalPath);
  report.frames = extractFrames(finalPath, report.probe.durationSeconds);
  report.localCompletion = {
    completedAt: new Date().toISOString(),
    additionalWanPosts: 0,
    additionalKlingCalls: 0,
    additionalHeyGenCalls: 0,
    additionalElevenLabsCalls: 0,
  };

  await fsp.writeFile(resultPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
