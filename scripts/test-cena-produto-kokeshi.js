// Radar Smart - teste isolado de cena de produto Kokeshi via Kling.
//
// Escopo deliberado: 1 POST real ao Freepik Kling image-to-video, sem
// storyboard, sem Persuasion Gate, sem HeyGen, sem ElevenLabs e sem
// publicacao. O output e processado localmente para MP4 vertical 1080x1920.

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { execFileSync } = require("node:child_process");

require("dotenv").config({ path: ".env.local" });

const root = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(root, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function loadTs(mod, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
};

const { executeFreepikKlingImageToVideo } = require("../lib/generation-orchestrator/adapters/freepik-kling-image-to-video.ts");
const { estimateSceneCost } = require("../lib/generation-orchestrator/cost-estimator.ts");
const { getProviderProfile } = require("../lib/generation-orchestrator/provider-capabilities.ts");
const {
  assertFinalVideoEncoderReady,
  findFfmpegPath,
  findFfprobePath,
} = require("../lib/commercial-video/final-video-codec-policy.ts");

const PROVIDER = "freepik-kling-i2v";
const KLING_ENDPOINT = "https://api.freepik.com/v1/ai/image-to-video/kling-v2-5-pro";
const TARGET_DURATION_SECONDS = 4;
const KLING_BILLABLE_DURATION = "5";
const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;
const CFG_SCALE = 0.5;
const MAX_KLING_SUBMITS = 1;
const PREFLIGHT_ONLY = process.argv.includes("--preflight-only");
const OUT_DIR = path.join(root, "temp", "isolated-kokeshi-product-scene");
const FRAMES_DIR = path.join(OUT_DIR, "frames");
const REPORT_PATH = path.join(OUT_DIR, "test-cena-produto-log.json");

// URL exata registrada no CANARY Kling aprovado:
// temp/creative-v2-hook-fidelity-canary/hook-fidelity-canary-report.json
const DEFAULT_KOKESHI_REFERENCE_IMAGE =
  "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/3993903939104ab08d755208e50a99f9~tplv-aphluv4xwc-resize-png:630:630.png?dr=15580&t=555f072d&ps=933b5bde&shp=7745054a&shcp=9b759fb9&idc=my2&from=2001012042";

const PROMPT =
  'A hand holding and gently opening a skincare cream tube labeled "Kokeshi", ' +
  "resting on a clean bathroom counter with soft natural light. Camera slowly " +
  "pushes in. Hand dispenses a small amount of cream onto fingertip, showing " +
  "realistic cream texture and topical skincare application. Product label stays " +
  "sharp, legible, and identical to the reference image - do not alter the " +
  "product design, packaging, label, typography, logo, colors or proportions. " +
  "The product is physically held by the hand, never floating. Shallow depth of " +
  "field, no other people, no text overlays, vertical 9:16 format.";

const NEGATIVE_PROMPT =
  "floating product, product spinning alone, empty background, no hand, no bathroom counter, " +
  "no product interaction, altered product packaging, altered brand, fake label, fake logo, " +
  "illegible label, extra text overlays, watermark, distorted hands, extra fingers, missing fingers, " +
  "fused fingers, deformed tube, wrong product color, wrong product model, duplicate tubes";

const network = {
  klingSubmitCount: 0,
  blockedProviderAttempts: [],
  downloads: [],
};

function ensureDirs() {
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
}

function writeReport(report) {
  ensureDirs();
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
}

function abortBeforePaid(reason, extra = {}) {
  writeReport({
    generatedAt: new Date().toISOString(),
    mode: "ISOLATED_KOKESHI_PRODUCT_SCENE_ABORTED_BEFORE_PAID_PROVIDER",
    reason,
    network,
    databaseAltered: false,
    storageAltered: false,
    publicationPerformed: false,
    ...extra,
  });
  throw new Error(reason);
}

function installNetworkGuard() {
  const realFetch = global.fetch;
  const blockedHostSubstrings = [
    "api.magnific.com",
    "api.heygen.com",
    "api.elevenlabs.io",
    "api.openai.com",
    "klingai.com",
    "runwayml",
    "replicate",
  ];

  global.fetch = async (input, options = {}) => {
    const url = typeof input === "string" ? input : input?.url ? input.url : String(input);
    const method = String(options.method ?? "GET").toUpperCase();

    if (blockedHostSubstrings.some((host) => url.includes(host))) {
      network.blockedProviderAttempts.push({ url, method });
      throw new Error(`BLOQUEADO: provider externo nao autorizado neste teste isolado: ${url}`);
    }

    if (url === KLING_ENDPOINT && method === "POST") {
      network.klingSubmitCount += 1;
      console.log(`\n>>> KLING SUBMIT #${network.klingSubmitCount}/${MAX_KLING_SUBMITS} <<<\n`);
      if (network.klingSubmitCount > MAX_KLING_SUBMITS) {
        throw new Error("BLOQUEADO: este teste permite exatamente 1 POST ao Kling.");
      }
    }

    return realFetch(input, options);
  };
}

function resolveReferenceImageInput() {
  const value = String(process.env.KOKESHI_REFERENCE_IMAGE || DEFAULT_KOKESHI_REFERENCE_IMAGE).trim();
  if (!value) abortBeforePaid("KOKESHI_REFERENCE_IMAGE vazio e referencia default ausente.");

  if (/^https:\/\//i.test(value)) {
    return { providerInput: value, sourceKind: "https-url", originalValue: value, localCopyPath: null };
  }

  const absolutePath = path.isAbsolute(value) ? value : path.join(root, value);
  if (!fs.existsSync(absolutePath)) {
    abortBeforePaid(`Imagem de referencia local nao encontrada: ${absolutePath}`);
  }

  const ext = path.extname(absolutePath).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" :
    ext === ".webp" ? "image/webp" :
    ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
    null;
  if (!mime) abortBeforePaid(`Formato de imagem local nao suportado: ${ext}`);

  const bytes = fs.readFileSync(absolutePath);
  if (bytes.length > 10 * 1024 * 1024) {
    abortBeforePaid(`Imagem de referencia excede 10MB: ${absolutePath}`);
  }

  return {
    providerInput: `data:${mime};base64,${bytes.toString("base64")}`,
    sourceKind: "local-file-data-uri",
    originalValue: absolutePath,
    localCopyPath: absolutePath,
  };
}

async function downloadToFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao baixar ${url}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  network.downloads.push({ url, outputPath: path.relative(root, outputPath), bytes: buffer.length });
  return buffer.length;
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function transcodeVertical(inputPath, outputPath) {
  const ffmpegPath = findFfmpegPath();
  run(ffmpegPath, [
    "-y",
    "-i", inputPath,
    "-f", "lavfi",
    "-t", String(TARGET_DURATION_SECONDS),
    "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-t", String(TARGET_DURATION_SECONDS),
    "-filter_complex",
    `[0:v]scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT},fps=24,setsar=1[v]`,
    "-map", "[v]",
    "-map", "1:a",
    "-c:v", "h264_mf",
    "-b:v", "8M",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    outputPath,
  ]);
}

function probeMp4(filePath) {
  const ffprobePath = findFfprobePath();
  const raw = run(ffprobePath, ["-v", "error", "-show_format", "-show_streams", "-print_format", "json", filePath]);
  const data = JSON.parse(raw);
  const video = data.streams.find((stream) => stream.codec_type === "video");
  const audio = data.streams.find((stream) => stream.codec_type === "audio");
  const [fpsNum, fpsDen] = String(video?.r_frame_rate ?? "0/1").split("/").map(Number);
  return {
    durationSeconds: Number(data.format?.duration ?? 0),
    width: video?.width ?? null,
    height: video?.height ?? null,
    fps: fpsDen ? Number((fpsNum / fpsDen).toFixed(3)) : null,
    videoCodec: video?.codec_name ?? null,
    codecTagString: video?.codec_tag_string ?? null,
    audioCodec: audio?.codec_name ?? null,
    audioStreamCount: data.streams.filter((stream) => stream.codec_type === "audio").length,
    sizeBytes: Number(data.format?.size ?? 0),
  };
}

function generateFramesAndContactSheet(finalVideoPath) {
  const ffmpegPath = findFfmpegPath();
  const timestamps = [0, 1, 2, 3, 3.85];
  const framePaths = timestamps.map((timestamp, index) => {
    const framePath = path.join(FRAMES_DIR, `frame-${index}-${String(timestamp).replace(".", "_")}s.jpg`);
    run(ffmpegPath, ["-y", "-ss", String(timestamp), "-i", finalVideoPath, "-frames:v", "1", framePath]);
    return framePath;
  });

  const contactSheetPath = path.join(OUT_DIR, "contact-sheet.jpg");
  const filter =
    framePaths
      .map((_, index) => `[${index}:v]scale=216:384:force_original_aspect_ratio=decrease,pad=216:384:(ow-iw)/2:(oh-ih)/2[v${index}]`)
      .join(";") + `;${framePaths.map((_, index) => `[v${index}]`).join("")}hstack=inputs=${framePaths.length}[out]`;

  run(ffmpegPath, ["-y", ...framePaths.flatMap((framePath) => ["-i", framePath]), "-filter_complex", filter, "-map", "[out]", contactSheetPath]);

  return {
    frames: framePaths.map((framePath) => path.relative(root, framePath)),
    contactSheet: path.relative(root, contactSheetPath),
  };
}

async function main() {
  ensureDirs();

  const encoder = assertFinalVideoEncoderReady();
  if (!encoder.ready) {
    abortBeforePaid(`h264_mf indisponivel antes de chamar provider pago: ${encoder.reason}`, { encoder });
  }

  if (!process.env.FREEPIK_API_KEY) {
    abortBeforePaid("FREEPIK_API_KEY nao configurada em .env.local.");
  }

  const providerProfile = getProviderProfile(PROVIDER);
  if (providerProfile?.status !== "ACTIVE" || providerProfile.productionEligible !== true) {
    abortBeforePaid(`Provider ${PROVIDER} nao esta ACTIVE/productionEligible.`);
  }

  const reference = resolveReferenceImageInput();
  const estimatedCost = estimateSceneCost(PROVIDER, TARGET_DURATION_SECONDS);
  if ((estimatedCost.estimatedCredits ?? Infinity) > 325) {
    abortBeforePaid(`Custo estimado inesperado: ${estimatedCost.estimatedCredits} creditos.`);
  }

  installNetworkGuard();

  const preflight = {
    provider: PROVIDER,
    model: "kling-v2-5-pro",
    referenceImage: {
      sourceKind: reference.sourceKind,
      valueForAudit: reference.originalValue,
      providerInputRedacted: reference.sourceKind === "local-file-data-uri" ? "[local image sent as data URI]" : reference.providerInput,
    },
    prompt: PROMPT,
    negativePrompt: NEGATIVE_PROMPT,
    targetDurationSeconds: TARGET_DURATION_SECONDS,
    klingBillableDuration: KLING_BILLABLE_DURATION,
    aspectRatio: "9:16",
    cfgScale: CFG_SCALE,
    estimatedCost,
    encoder,
    limits: {
      maxKlingSubmits: MAX_KLING_SUBMITS,
      retries: 0,
      fallback: 0,
      heyGenCalls: 0,
      elevenLabsCalls: 0,
      wanCalls: 0,
    },
  };

  writeReport({
    generatedAt: new Date().toISOString(),
    mode: PREFLIGHT_ONLY ? "ISOLATED_KOKESHI_PRODUCT_SCENE_PREFLIGHT_ONLY" : "ISOLATED_KOKESHI_PRODUCT_SCENE_STARTED",
    preflight,
    network,
    databaseAltered: false,
    storageAltered: false,
    publicationPerformed: false,
  });

  if (PREFLIGHT_ONLY) {
    console.log("[TEST] Preflight OK; nenhuma chamada paga executada.");
    console.log("[TEST] Custo estimado:", estimatedCost.estimatedCredits, "creditos");
    console.log("[TEST] Log:", path.relative(root, REPORT_PATH));
    return;
  }

  console.log("[TEST] Iniciando teste isolado de cena de produto Kokeshi via Kling...");
  console.log("[TEST] Custo estimado:", estimatedCost.estimatedCredits, "creditos");

  const klingResult = await executeFreepikKlingImageToVideo({
    inputImageUrl: reference.providerInput,
    prompt: PROMPT,
    negativePrompt: NEGATIVE_PROMPT,
    duration: KLING_BILLABLE_DURATION,
    cfgScale: CFG_SCALE,
  });

  const rawOutputPath = path.join(OUT_DIR, "kokeshi-product-scene-kling-raw.mp4");
  const finalOutputPath = path.join(OUT_DIR, "kokeshi-product-scene-1080x1920-h264-aac.mp4");

  if (klingResult.status !== "success" || !klingResult.outputUrl) {
    writeReport({
      generatedAt: new Date().toISOString(),
      mode: "ISOLATED_KOKESHI_PRODUCT_SCENE_FAILED",
      preflight,
      klingResult,
      network,
      databaseAltered: false,
      storageAltered: false,
      publicationPerformed: false,
    });
    throw new Error(klingResult.error || "Kling retornou falha sem detalhe.");
  }

  await downloadToFile(klingResult.outputUrl, rawOutputPath);
  transcodeVertical(rawOutputPath, finalOutputPath);
  const technicalMetadata = probeMp4(finalOutputPath);
  const frameArtifacts = generateFramesAndContactSheet(finalOutputPath);

  const technicalPass =
    technicalMetadata.width === TARGET_WIDTH &&
    technicalMetadata.height === TARGET_HEIGHT &&
    technicalMetadata.videoCodec === "h264" &&
    technicalMetadata.codecTagString === "avc1" &&
    technicalMetadata.audioCodec === "aac";

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "ISOLATED_KOKESHI_PRODUCT_SCENE_COMPLETED",
    preflight,
    klingResult: {
      ...klingResult,
      outputUrl: klingResult.outputUrl,
    },
    artifacts: {
      rawOutputPath: path.relative(root, rawOutputPath),
      finalOutputPath: path.relative(root, finalOutputPath),
      contactSheet: frameArtifacts.contactSheet,
      frames: frameArtifacts.frames,
      reportPath: path.relative(root, REPORT_PATH),
    },
    technicalMetadata,
    technicalPass,
    humanAcceptanceChecklist: {
      labelLegibleAndFaithful: "PENDING_HUMAN_REVIEW",
      handVisibleInteractingWithProduct: "PENDING_HUMAN_REVIEW",
      realisticTextureApplication: "PENDING_HUMAN_REVIEW",
      cameraMovementPresent: "PENDING_HUMAN_REVIEW",
      environmentContextPresent: "PENDING_HUMAN_REVIEW",
    },
    costLog: {
      estimatedCredits: estimatedCost.estimatedCredits,
      estimatedCurrencyCostCents: estimatedCost.estimatedCurrencyCostCents,
      actualCredits: null,
      note: "Freepik/Magnific nao retorna creditos reais na resposta; custo real fica registrado como null.",
    },
    network,
    retries: 0,
    fallback: 0,
    databaseAltered: false,
    storageAltered: false,
    publicationPerformed: false,
  };

  writeReport(report);
  console.log("[TEST] Video final:", path.relative(root, finalOutputPath));
  console.log("[TEST] Contact sheet:", frameArtifacts.contactSheet);
  console.log("[TEST] Log:", path.relative(root, REPORT_PATH));
  console.log("[TEST] Technical pass:", technicalPass ? "YES" : "NO");
}

main().catch((error) => {
  console.error("[TEST] Falhou:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
