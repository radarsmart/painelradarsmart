// Radar Creative AI - COMMERCIAL V2 FULL CANARY - ANALISE POS-EXECUCAO
//
// 100% local/leitura - ZERO chamada a provider pago. Roda o Commercial
// Quality Gate real (assessCommercialQuality) sobre o resultado JA
// produzido pelo EXECUTE anterior, e extrai frames do V1 (comercial
// anterior da factory) para comparacao visual real.

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { execFileSync } = require("node:child_process");

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

global.fetch = async () => {
  throw new Error("External calls are forbidden in this analysis script.");
};

const { assessCommercialQuality } = require("../lib/commercial-video/quality/commercial-quality-gate.ts");
const { probeFinalVideoFile, assessFinalVideoTechnicalQuality } = require("../lib/commercial-video/quality/final-video-quality-check.ts");
const { assessAudioQuality } = require("../lib/commercial-video/audio/audio-quality-gate.ts");

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" });
}

function measurePeakDb(filePath) {
  const result = execFileSync("ffmpeg", ["-i", filePath, "-af", "astats=metadata=0", "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).toString();
  return result;
}

function spawnPeak(filePath) {
  const { spawnSync } = require("node:child_process");
  const result = spawnSync("ffmpeg", ["-i", filePath, "-af", "astats=metadata=0", "-f", "null", "-"]);
  const stderr = result.stderr ? result.stderr.toString() : "";
  const matches = [...stderr.matchAll(/Peak level dB:\s*(-?\d+(\.\d+)?)/g)];
  if (matches.length === 0) return null;
  return Math.max(...matches.map((m) => Number(m[1])));
}

async function main() {
  const finalVideoPath = path.join(root, "temp", "commercial-v2-full-canary-execute", "final", "660d53b5-d3dc-47a5-b031-4d035bfd97a3-final.mp4");
  const execReport = JSON.parse(fs.readFileSync(path.join(root, "temp", "commercial-v2-full-canary-execute", "full-canary-execute-report.json"), "utf8"));
  const runnerResult = execReport.runnerResult;

  const probe = probeFinalVideoFile(finalVideoPath);
  const peakDb = spawnPeak(finalVideoPath);

  const audioQuality = assessAudioQuality({
    videoDurationSeconds: probe.durationSeconds,
    audioDurationSeconds: probe.durationSeconds, // muxado junto - mesma faixa
    narrationSegments: [], // narrationSegments reais nao sao serializados no runnerResult (so os records) - ver nota abaixo
    peakLevelDb: peakDb,
    audioStreamPresent: probe.audioStreamCount > 0,
    masterLoudnessLUFS: null,
  });

  const visualClaims = [
    { sceneId: "scene-4", source: "COMPOSITOR_OVERLAY", kind: "PRICE", value: "R$ 13,16" },
  ];

  const offer = { price: 13.16, priceText: "R$ 13,16", originalPrice: null, discountPercent: 0, discountText: null };

  const quality = assessCommercialQuality({
    runnerResult,
    offer,
    visualClaims,
    manualSceneAssessments: [],
    finalVideoProbe: probe,
    audioQuality,
    allowLegacyEncoderObservation: false,
  });

  console.log("=== FINAL VIDEO PROBE ===");
  console.log(JSON.stringify(probe, null, 2));
  console.log("=== AUDIO QUALITY ===");
  console.log(JSON.stringify(audioQuality, null, 2));
  console.log("=== COMMERCIAL QUALITY RESULT ===");
  console.log(JSON.stringify({
    status: quality.status,
    publishReady: quality.publishReady,
    requiresHumanAcknowledgement: quality.requiresHumanAcknowledgement,
    blockingReasons: quality.blockingReasons,
    observations: quality.observations,
    finalVideoTechnicalQuality: quality.finalVideoTechnicalQuality,
    offerConsistency: quality.offerConsistency,
    sceneResultsSummary: quality.sceneResults.map((s) => ({ sceneId: s.sceneId, status: s.status, technicalStatus: s.technicalStatus, reuseDecision: s.reuseDecision })),
  }, null, 2));

  fs.writeFileSync(path.join(root, "temp", "commercial-v2-full-canary-execute", "commercial-quality-result.json"), JSON.stringify(quality, null, 2), "utf8");

  // --- V1 comparison frames -------------------------------------------
  const v1Path = path.join(root, "temp", "final-reassembly-prepublish-qa", "5a0b6e06-d467-442e-bfdb-ba98a823eb80-final-reassembled-websafe-audiofix.mp4");
  if (fs.existsSync(v1Path)) {
    const v1FramesDir = path.join(root, "temp", "commercial-v2-full-canary-execute", "v1-comparison-frames");
    if (!fs.existsSync(v1FramesDir)) fs.mkdirSync(v1FramesDir, { recursive: true });
    const v1Probe = run("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", v1Path]);
    const v1ProbeJson = JSON.parse(v1Probe);
    const v1Duration = Number(v1ProbeJson.format.duration);
    console.log("=== V1 PROBE ===", JSON.stringify({ duration: v1Duration, streams: v1ProbeJson.streams.map((s) => ({ type: s.codec_type, codec: s.codec_name, w: s.width, h: s.height })) }));
    [0, 0.25, 0.5, 0.75, 0.99].forEach((pct, i) => {
      const t = Math.min(v1Duration - 0.05, Math.max(0, v1Duration * pct));
      const framePath = path.join(v1FramesDir, `v1-frame-${i}-${Math.round(pct * 100)}pct.png`);
      run("ffmpeg", ["-y", "-ss", String(t), "-i", v1Path, "-frames:v", "1", framePath]);
      console.log(`V1 frame saved: ${path.relative(root, framePath)}`);
    });
  } else {
    console.log("V1 video nao encontrado localmente - pulando extracao de frames de comparacao.");
  }
}

main().catch((err) => {
  console.error(err.message, err.stack);
  process.exitCode = 1;
});
