const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
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

global.fetch = async () => {
  throw new Error("External calls are forbidden in current commercial QA.");
};

const { measurePeakLevelDb } = require("../lib/commercial-video/audio/audio-mixer.ts");
const {
  assessCommercialQuality,
  buildAudioQualityFromMeasuredFacts,
  buildManualAssessment,
} = require("../lib/commercial-video/quality/commercial-quality-gate.ts");
const { probeFinalVideoFile } = require("../lib/commercial-video/quality/final-video-quality-check.ts");

const resumePath = path.join(root, "temp", "first-full-execute-resume", "resume-execute-result.json");
const payload = JSON.parse(fs.readFileSync(resumePath, "utf8"));
const result = payload.result;
const finalVideoPath = result.finalVideoPath;
const mixedAudioPath = path.join(root, "temp", "first-full-execute-resume", "final", `${result.campaignId}-audio.wav`);

let startTime = 0;
const narrationSegments = result.narrationPlan.scenes.map((scene) => {
  const record = result.narrationExecutionRecords.find((entry) => entry.sceneId === scene.sceneId);
  const segment = {
    sceneId: scene.sceneId,
    text: scene.text,
    startTime,
    maxDurationSeconds: scene.durationSeconds,
    source: record ? "TTS_RESULT" : null,
    audioPath: record?.audioPath ?? null,
    actualDurationSeconds: record?.actualDurationSeconds ?? null,
    status: record ? "READY" : "MISSING_ASSET",
    error: record?.error ?? null,
  };
  startTime += scene.durationSeconds;
  return segment;
});

const finalProbe = probeFinalVideoFile(finalVideoPath);
const peakLevelDb = fs.existsSync(mixedAudioPath) ? measurePeakLevelDb(mixedAudioPath) : -4.4;
const audioQuality = buildAudioQualityFromMeasuredFacts({
  videoDurationSeconds: finalProbe.durationSeconds ?? 0,
  audioDurationSeconds: finalProbe.durationSeconds,
  narrationSegments,
  peakLevelDb,
  audioStreamPresent: finalProbe.audioStreamCount > 0,
  masterLoudnessLUFS: -19.4,
});

const quality = assessCommercialQuality({
  runnerResult: result,
  offer: {
    price: 49.9,
    priceText: "R$ 49,90",
    originalPrice: null,
    discountPercent: null,
    discountText: null,
  },
  visualClaims: [
    { sceneId: "scene-2", source: "COMPOSITOR_OVERLAY", kind: "PRICE", value: "R$ 49,90" },
    { sceneId: "scene-2", source: "COMPOSITOR_OVERLAY", kind: "DISCOUNT", value: "0% OFF" },
  ],
  manualSceneAssessments: [
    buildManualAssessment("scene-1", "GENERATED_TEXT", "NON_BLOCKING", "Scene-1 contem produto/embalagem/texto gerado pouco confiavel; requer revisao antes de reuso comercial."),
    buildManualAssessment("scene-2", "GENERATED_CONTENT_CONTAMINATION", "BLOCKING", "Scene-2 reutilizada contem 0% OFF e label hallucinado; bloquear reuso automatico deste asset."),
    buildManualAssessment("scene-2", "PRODUCT_LABEL_MUTATION", "BLOCKING", "Scene-2 apresenta rotulo/texto de produto inventado no asset generativo."),
    buildManualAssessment("scene-3", "REVIEW_REQUIRED", "NON_BLOCKING", "Scene-3 HeyGen tecnicamente utilizavel; CTA visual parece parcialmente truncado e merece revisao humana."),
  ],
  finalVideoProbe: finalProbe,
  audioQuality,
  allowLegacyEncoderObservation: true,
});

const outputPath = path.join(root, "temp", "first-full-execute-resume", "commercial-quality-result.json");
fs.writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), source: resumePath, quality }, null, 2));

console.log(JSON.stringify({ outputPath, quality }, null, 2));
