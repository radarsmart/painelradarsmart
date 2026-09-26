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

global.fetch = async (input, init) => {
  throw new Error(`External fetch blocked during zero-cost final reassembly: ${String(input)} ${String(init?.method ?? "GET")}`);
};

const { buildCommercialTimeline } = require("../lib/commercial-video/timeline-builder.ts");
const { composeCommercialVideo } = require("../lib/commercial-video/commercial-video-composer.ts");
const { buildCommercialAudioTimeline } = require("../lib/commercial-video/audio/audio-timeline-builder.ts");
const {
  mixCommercialAudio,
  measurePeakLevelDb,
  measureIntegratedLoudnessLUFS,
} = require("../lib/commercial-video/audio/audio-mixer.ts");
const { muxFinalCommercial } = require("../lib/commercial-video/audio/final-mux.ts");
const {
  assessCommercialQuality,
  buildAudioQualityFromMeasuredFacts,
  buildManualAssessment,
} = require("../lib/commercial-video/quality/commercial-quality-gate.ts");
const { probeFinalVideoFile } = require("../lib/commercial-video/quality/final-video-quality-check.ts");

const campaignId = "5a0b6e06-d467-442e-bfdb-ba98a823eb80";
const originalJobId = "6b494376-9473-4ee4-94dd-c0f5b9cba473";
const resumeJobId = "79978fc2-2011-45e9-8130-ae32f9665c67";
const sourcePath = path.join(root, "temp", "first-full-execute-resume", "resume-execute-result.json");
const outputDir = path.join(root, "temp", "final-reassembly-prepublish-qa");
const framesDir = path.join(outputDir, "frames");

const sceneAssets = {
  "scene-1": {
    role: "repair WAN novo",
    provider: "wan-2-5-t2v",
    taskId: "77fa8abc-4947-47f7-913c-ed7e1617d4c4",
    path: path.join(root, "temp", "scene-1-repair-canary", "scene-1-repair-wan-output.mp4"),
  },
  "scene-2": {
    role: "repair Hybrid novo",
    provider: "wan-2-5-t2v + HYBRID_PRODUCT_COMPOSITE",
    taskId: "4bedc3aa-dc3d-4464-b35a-fb13c09b722f",
    path: path.join(root, "temp", "scene-2-repair-canary", "scene-2-repair-hybrid-final.mp4"),
  },
  "scene-3": {
    role: "HeyGen reutilizado",
    provider: "heygen-image-avatar",
    taskId: "5e904e014acc4dfa85ab09dba2745a07",
    path: path.join(root, "temp", "first-full-execute-resume", "asset-cache", "db37b4926e9dd95f735d4159.mp4"),
  },
};

function assertExists(label, filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`${label} nao encontrado: ${filePath}`);
}

function findBinary(name) {
  if (name === "ffmpeg" && process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  if (name === "ffprobe" && process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) return process.env.FFPROBE_PATH;
  try {
    return execFileSync(process.platform === "win32" ? "where" : "which", [name]).toString().split("\n")[0].trim();
  } catch {
    return name;
  }
}

function extractFrames(videoPath, durationSeconds) {
  const ffmpeg = findBinary("ffmpeg");
  fs.mkdirSync(framesDir, { recursive: true });
  const timestamps = [0, durationSeconds * 0.25, durationSeconds * 0.5, durationSeconds * 0.75, Math.max(0, durationSeconds - 0.15)];
  const framePaths = timestamps.map((time, index) => {
    const framePath = path.join(framesDir, `frame-${index + 1}.jpg`);
    execFileSync(ffmpeg, ["-y", "-ss", time.toFixed(3), "-i", videoPath, "-frames:v", "1", "-q:v", "2", framePath], { stdio: "ignore" });
    return framePath;
  });
  const contactSheet = path.join(framesDir, "contact-sheet.jpg");
  execFileSync(ffmpeg, ["-y", "-framerate", "1", "-i", path.join(framesDir, "frame-%d.jpg"), "-vf", "scale=240:-1,tile=5x1", "-frames:v", "1", contactSheet], { stdio: "ignore" });
  return { timestamps, framePaths, contactSheet };
}

function buildNarrationSegments(narrationPlan, narrationExecutionRecords) {
  let startTime = 0;
  return narrationPlan.scenes.map((scene) => {
    const record = narrationExecutionRecords.find((entry) => entry.sceneId === scene.sceneId);
    const segment = {
      sceneId: scene.sceneId,
      text: scene.text,
      startTime,
      maxDurationSeconds: scene.durationSeconds,
      source: record ? "TTS_RESULT" : null,
      audioPath: record?.audioPath ?? null,
      actualDurationSeconds: record?.actualDurationSeconds ?? null,
      status: record?.audioPath ? "READY" : "MISSING_ASSET",
      error: record?.error ?? null,
    };
    if (segment.actualDurationSeconds !== null && segment.actualDurationSeconds > scene.durationSeconds) {
      segment.status = "NARRATION_TOO_LONG";
      segment.error = `Audio ${segment.actualDurationSeconds}s > janela ${scene.durationSeconds}s.`;
    }
    startTime += scene.durationSeconds;
    return segment;
  });
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  for (const [sceneId, asset] of Object.entries(sceneAssets)) assertExists(sceneId, asset.path);
  const sourcePayload = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const baseResult = sourcePayload.result;

  const updatedScenes = baseResult.scenes.map((scene) => {
    const asset = sceneAssets[scene.sceneId];
    return {
      ...scene,
      selectedProvider: asset.provider.includes("+") ? "wan-2-5t2v-hybrid-local" : asset.provider,
      providerCapability: scene.sceneId === "scene-2" ? "TEXT_TO_VIDEO" : scene.providerCapability,
      productGenerationStrategy: scene.sceneId === "scene-2" ? "HYBRID_PRODUCT_COMPOSITE" : scene.productGenerationStrategy,
      requiresHybridPipeline: scene.sceneId === "scene-2",
      existingAsset: {
        source: "GENERATION_RESULT",
        inputVideoPath: asset.path,
        status: "READY",
        rejectionReason: null,
      },
    };
  });

  const promptPlan = {
    campaignId,
    commercialDirection: {},
    scenes: [
      { sceneId: "scene-1", sceneOrder: 1, purpose: "HOOK", durationSeconds: 3, overlayInstructions: { priceText: null, discountText: null, ctaText: null }, safeAreaDirection: "NONE", brandOverlayRequired: true },
      { sceneId: "scene-2", sceneOrder: 2, purpose: "OFFER", durationSeconds: 4, overlayInstructions: { priceText: null, discountText: null, ctaText: null }, safeAreaDirection: "RIGHT", brandOverlayRequired: true },
      { sceneId: "scene-3", sceneOrder: 3, purpose: "CTA", durationSeconds: 2, overlayInstructions: { priceText: null, discountText: null, ctaText: "Acesse o Radar Smart." }, safeAreaDirection: "BOTTOM", brandOverlayRequired: true },
    ],
  };

  const sceneVideoPaths = Object.fromEntries(Object.entries(sceneAssets).map(([sceneId, asset]) => [sceneId, asset.path]));
  const timeline = buildCommercialTimeline(promptPlan, { campaignId, aspectRatio: "9:16", sceneVideoPaths });
  const visualOutputPath = path.join(outputDir, `${campaignId}-visual-reassembled.mp4`);
  const renderResult = await composeCommercialVideo(timeline, {
    outputPath: visualOutputPath,
    sceneTraceability: {
      "scene-1": { source: "GENERATION_RESULT", inputVideoPath: sceneAssets["scene-1"].path, status: "READY", rejectionReason: null },
      "scene-2": { source: "GENERATION_RESULT", inputVideoPath: sceneAssets["scene-2"].path, status: "READY", rejectionReason: null },
      "scene-3": { source: "GENERATION_RESULT", inputVideoPath: sceneAssets["scene-3"].path, status: "READY", rejectionReason: null },
    },
  });
  if (renderResult.status !== "COMPLETED" || !renderResult.outputPath) {
    throw new Error(`Composicao visual falhou: ${renderResult.error ?? renderResult.status}`);
  }

  const narrationSegments = buildNarrationSegments(baseResult.narrationPlan, baseResult.narrationExecutionRecords);
  for (const segment of narrationSegments) {
    if (segment.audioPath) assertExists(`narration ${segment.sceneId}`, segment.audioPath);
  }
  const audioTimeline = buildCommercialAudioTimeline(timeline.totalDurationSeconds, narrationSegments, null, []);
  const mixedAudioPath = path.join(outputDir, `${campaignId}-audio-reassembled.wav`);
  const mixResult = await mixCommercialAudio(audioTimeline, mixedAudioPath);
  if (mixResult.status !== "COMPLETED" || !mixResult.outputPath) {
    throw new Error(`Mixagem falhou: ${mixResult.error ?? mixResult.status}`);
  }

  const finalOutputPath = path.join(outputDir, `${campaignId}-final-reassembled.mp4`);
  const muxResult = await muxFinalCommercial({ visualVideoPath: renderResult.outputPath, mixedAudioPath: mixResult.outputPath, outputPath: finalOutputPath });
  if (muxResult.status !== "COMPLETED" || !muxResult.outputPath) {
    throw new Error(`Mux final falhou: ${muxResult.error ?? muxResult.status}`);
  }

  const finalProbe = probeFinalVideoFile(muxResult.outputPath);
  const peakLevelDb = measurePeakLevelDb(muxResult.outputPath);
  const masterLoudnessLUFS = measureIntegratedLoudnessLUFS(muxResult.outputPath);
  const audioQuality = buildAudioQualityFromMeasuredFacts({
    videoDurationSeconds: finalProbe.durationSeconds ?? 0,
    audioDurationSeconds: finalProbe.durationSeconds,
    narrationSegments,
    peakLevelDb,
    audioStreamPresent: finalProbe.audioStreamCount > 0,
    masterLoudnessLUFS,
  });

  const runnerResult = {
    ...baseResult,
    status: "COMPLETED",
    scenes: updatedScenes,
    finalVideoPath: muxResult.outputPath,
    finalVideoUrl: null,
    narrationExecutionRecords: baseResult.narrationExecutionRecords,
    sceneExecutionRecords: [
      { sceneId: "scene-1", fingerprint: "scene-1-repair-77fa8abc", provider: "wan-2-5-t2v", generationId: sceneAssets["scene-1"].taskId, status: "COMPLETED", outputUrl: null, durationSeconds: 3, completedAt: null, error: null },
      { sceneId: "scene-2", fingerprint: "scene-2-repair-4bedc3aa", provider: "wan-2-5t2v-hybrid-local", generationId: sceneAssets["scene-2"].taskId, status: "COMPLETED", outputUrl: null, durationSeconds: 4, completedAt: null, error: null },
      { sceneId: "scene-3", fingerprint: "b485516990509d4588ccbcb5e5000cdcec5fe3fbd0c62fb7b00d6d6cb31c5432", provider: "heygen-image-avatar", generationId: sceneAssets["scene-3"].taskId, status: "REUSED", outputUrl: null, durationSeconds: 2, completedAt: null, error: null },
    ],
  };

  const manualSceneAssessments = [
    buildManualAssessment("scene-2", "REVIEW_REQUIRED", "NON_BLOCKING", "Scene-2 repair hibrido tem borda irregular conhecida no splash/agua da base; produto real preservado e sem alucinacao generativa."),
  ];

  const quality = assessCommercialQuality({
    runnerResult,
    offer: { price: 49.9, priceText: "R$ 49,90", originalPrice: null, discountPercent: null, discountText: null },
    visualClaims: [{ sceneId: "scene-2", source: "COMPOSITOR_OVERLAY", kind: "PRICE", value: "R$ 49,90" }],
    manualSceneAssessments,
    finalVideoProbe: finalProbe,
    audioQuality,
    allowLegacyEncoderObservation: false,
  });

  const frames = extractFrames(muxResult.outputPath, finalProbe.durationSeconds ?? timeline.totalDurationSeconds);
  const report = {
    generatedAt: new Date().toISOString(),
    campaignId,
    sourceJobs: { originalJobId, resumeJobId },
    paidCallsThisStep: { WAN: 0, Kling: 0, HeyGen: 0, ElevenLabs: 0 },
    providerApisCalled: [],
    storageAltered: false,
    databaseAltered: false,
    costThisStep: { WAN: 0, Kling: 0, HeyGen: 0, ElevenLabs: 0 },
    finalAssetsUsed: sceneAssets,
    rejectedAssetsExcluded: {
      "scene-1": path.join(root, "temp", "first-full-execute-resume", "asset-cache", "24dffe1a28a6d4cc9438bab1.mp4"),
      "scene-2": path.join(root, "temp", "first-full-execute-resume", "asset-cache", "5adc62bf43440ad0546b9ed0.mp4"),
    },
    narrationReuse: baseResult.narrationExecutionRecords.map((record) => ({
      sceneId: record.sceneId,
      status: record.status,
      audioPath: record.audioPath,
      actualDurationSeconds: record.actualDurationSeconds,
    })),
    visualRender: renderResult,
    audioMix: {
      ...mixResult,
      musicTrack: null,
      sfxEvents: [],
      duckingEnabled: true,
    },
    mux: muxResult,
    finalVideoPath: muxResult.outputPath,
    storageUrl: null,
    finalProbe,
    loudness: { integratedLUFS: masterLoudnessLUFS, peakLevelDb, clipping: audioQuality.clippingDetected },
    frames,
    quality,
    recommendation: quality.publishReady
      ? "Arquivo tecnicamente pronto para uma decisao humana de publicacao; nao publicado nesta etapa."
      : "Nao publicar automaticamente; revisar observacoes do gate antes de marcar publishReady.",
  };

  await fsp.writeFile(path.join(outputDir, "final-reassembly-prepublish-qa-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
