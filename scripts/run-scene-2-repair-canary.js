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
let magnificPostCount = 0;
global.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input?.url;
  const method = String(init?.method ?? "GET").toUpperCase();
  if (method === "POST" && String(url).startsWith("https://api.magnific.com/")) {
    magnificPostCount += 1;
  }
  if (magnificPostCount > 1) {
    throw new Error(`WAN POST limit exceeded: ${magnificPostCount}`);
  }
  return originalFetch(input, init);
};

const {
  executeWanTextToVideo,
  describeWanTextToVideoRequest,
  validateWanTextToVideoRequest,
} = require("../lib/generation-orchestrator/adapters/wan-2-5-text-to-video.ts");
const { estimateSceneCost } = require("../lib/generation-orchestrator/cost-estimator.ts");
const { downloadProductImage } = require("../lib/commercial-video/runner/execute/hybrid-scene-executor.ts");
const { runProductCutout } = require("../lib/product-cutout/product-cutout.ts");
const {
  buildHybridCompositeRequestFromPlan,
  resolveProductGrounding,
  runHybridProductComposite,
} = require("../lib/compositor/hybrid-product-compositor.ts");
const {
  buildOfferDrawtextFilter,
  resolveDrawTextFont,
} = require("../lib/commercial-video/overlay-renderer.ts");

const campaignId = "5a0b6e06-d467-442e-bfdb-ba98a823eb80";
const sceneId = "scene-2";
const provider = "wan-2-5-t2v";
const model = "wan-2-5-t2v-1080p";
const generationDuration = "5";
const targetSceneDuration = 4;
const maxCredits = 1500;
const productReferenceUrl = "https://cf.shopee.com.br/file/br-11134207-820lh-mpv9i1u0ledefb";
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

async function downloadBinary(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} while downloading ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) throw new Error(`Downloaded file is empty: ${outputPath}`);
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
  const outputDir = path.join(root, "temp", "scene-2-repair-canary");
  const hybridDir = path.join(outputDir, "hybrid-scene-2");
  const framesDir = path.join(outputDir, "frames");
  fs.mkdirSync(hybridDir, { recursive: true });

  const request = { prompt, negativePrompt, duration: generationDuration };
  const validation = validateWanTextToVideoRequest(request);
  const estimate = estimateSceneCost(provider, targetSceneDuration);
  const preflight = {
    campaignId,
    sceneId,
    purpose: "OFFER",
    strategy: "HYBRID_PRODUCT_COMPOSITE",
    provider,
    model,
    generationDuration,
    targetSceneDuration,
    estimatedCredits: estimate.estimatedCredits,
    maxCredits,
    submitsAllowed: 1,
    retries: 0,
    fallback: 0,
    productReferenceUrl,
    preserveProductPixels: true,
    priceText,
    discountText,
    request: describeWanTextToVideoRequest(request),
    validation,
  };

  await fsp.writeFile(path.join(outputDir, "preflight.json"), JSON.stringify(preflight, null, 2));
  if (!validation.ok) throw new Error(validation.reason);
  if (estimate.estimatedCredits !== 1500 || estimate.estimatedCredits > maxCredits) {
    throw new Error(`Cost guard blocked: estimatedCredits=${estimate.estimatedCredits}, maxCredits=${maxCredits}`);
  }

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
    submits: magnificPostCount,
    retries: 0,
    fallback: 0,
    startedAt,
    completedAt,
    wanResult,
    backgroundLocalPath: null,
    productReference: { url: productReferenceUrl, localPath: null },
    cutout: null,
    hybridComposite: null,
    priceOverlay: null,
    finalLocalPath: null,
    probe: null,
    frames: null,
    storageAltered: false,
    databaseAltered: false,
  };

  if (wanResult.status !== "success" || !wanResult.outputUrl) {
    await fsp.writeFile(path.join(outputDir, "scene-2-repair-canary-result.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const backgroundPath = path.join(outputDir, "scene-2-wan-background.mp4");
  await downloadBinary(wanResult.outputUrl, backgroundPath);
  report.backgroundLocalPath = backgroundPath;

  const productDownload = await downloadProductImage(productReferenceUrl, hybridDir);
  if (!productDownload.ok) {
    report.productReference.error = productDownload.error;
    await fsp.writeFile(path.join(outputDir, "scene-2-repair-canary-result.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  report.productReference.localPath = productDownload.localPath;

  const cutoutPath = path.join(hybridDir, "product-cutout.png");
  const cutout = runProductCutout({ inputImagePath: productDownload.localPath, outputImagePath: cutoutPath });
  report.cutout = cutout;
  if (cutout.status !== "COMPLETED" || !cutout.outputImagePath || cutout.qualityReport?.status !== "PASS") {
    await fsp.writeFile(path.join(outputDir, "scene-2-repair-canary-result.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const compositePath = path.join(hybridDir, "scene-2-hybrid-grounded-no-price.mp4");
  const hybridPlan = {
    productReferenceUrl,
    backgroundGenerationPrompt: prompt,
    backgroundNegativePrompt: negativePrompt,
    productPlacement: "LEFT",
    cameraMotion: "subtle ambient background motion only",
    preserveProductPixels: true,
    overlayInstructions: { priceText, discountText, ctaText: null },
  };
  const compositeRequest = buildHybridCompositeRequestFromPlan(hybridPlan, {
    backgroundVideoPath: backgroundPath,
    productImagePath: cutout.outputImagePath,
    outputPath: compositePath,
    durationSeconds: targetSceneDuration,
    aspectRatio: "9:16",
    productMotion: "NONE",
    backgroundRemovalMode: "PREPROCESSED_ALPHA",
  });
  const hybridComposite = await runHybridProductComposite({
    ...compositeRequest,
    productGrounding: resolveProductGrounding({ enabled: true }),
  });
  report.hybridComposite = hybridComposite;
  if (hybridComposite.status !== "COMPLETED" || !hybridComposite.outputPath) {
    await fsp.writeFile(path.join(outputDir, "scene-2-repair-canary-result.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const finalPath = path.join(outputDir, "scene-2-repair-hybrid-final.mp4");
  report.priceOverlay = applyPriceOverlay(hybridComposite.outputPath, finalPath);
  report.finalLocalPath = finalPath;
  report.probe = probeVideo(finalPath);
  report.frames = extractFrames(finalPath, framesDir, report.probe.durationSeconds);

  await fsp.writeFile(path.join(outputDir, "scene-2-repair-canary-result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
