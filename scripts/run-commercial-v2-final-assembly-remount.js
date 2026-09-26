// Radar Creative AI - COMMERCIAL V2 FINAL ASSEMBLY FIX V1 - REMONTAGEM
//
// ZERO chamada a provider pago - reusa EXCLUSIVAMENTE os assets ja pagos
// no CREATIVE V2 HOOK FIDELITY CANARY (scene-1) e no COMMERCIAL V2 FULL
// CANARY real (scene-2/3/4/5 + narracoes ElevenLabs), agora com os dois
// fixes de montagem aplicados (FREEZE_LAST_FRAME + responsive CTA overlay).
// Mesmo padrao ja usado em scripts/run-final-reassembly-prepublish-qa.js
// (remontagem local do V1) - so leitura de arquivos locais + FFmpeg local.

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(root, ".env.local") });

const { createClient } = require("@supabase/supabase-js");

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

// Bloqueio TOTAL de rede - esta tarefa e 100% local, nenhuma excecao (nem
// Supabase real precisa ser chamado para leitura aqui, ja que o promptPlan
// e reconstruido a partir de dados JA persistidos e ja lidos por scripts
// anteriores - mas mantemos leitura ao Supabase permitida so pra buscar o
// creative_brief real, mais seguro que reusar um JSON copiado; qualquer
// host de provider pago continua bloqueado).
const BLOCKED_PROVIDER_HOST_SUBSTRINGS = [
  "api.magnific.com",
  "api.freepik.com",
  "cdn-magnific.freepik.com",
  "api.heygen.com",
  "api.elevenlabs.io",
  "api.openai.com",
  "klingai.com",
  "runwayml",
  "replicate",
];
const realFetch = global.fetch;
let blockedAttempts = 0;
global.fetch = async (url, options) => {
  const urlString = String(url);
  if (BLOCKED_PROVIDER_HOST_SUBSTRINGS.some((host) => urlString.includes(host))) {
    blockedAttempts += 1;
    throw new Error(`BLOQUEADO (guardrail de rede): tentativa de chamar host de provider pago "${urlString}".`);
  }
  return realFetch(url, options);
};

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { buildCommercialDirection } = require("../lib/commercial-director/director.ts");
const { buildCreativeDirectionV2DecisionEngine } = require("../lib/creative-director-v2/decision-engine/decision-engine.ts");
const { buildCampaignPromptPlan } = require("../lib/prompt-builder/prompt-builder.ts");
const { buildCommercialTimeline } = require("../lib/commercial-video/timeline-builder.ts");
const { composeCommercialVideo } = require("../lib/commercial-video/commercial-video-composer.ts");
const { buildCommercialAudioTimeline } = require("../lib/commercial-video/audio/audio-timeline-builder.ts");
const { mixCommercialAudio, measurePeakLevelDb, measureIntegratedLoudnessLUFS } = require("../lib/commercial-video/audio/audio-mixer.ts");
const { muxFinalCommercial } = require("../lib/commercial-video/audio/final-mux.ts");
const { assessCommercialQuality, buildAudioQualityFromMeasuredFacts } = require("../lib/commercial-video/quality/commercial-quality-gate.ts");
const { probeFinalVideoFile } = require("../lib/commercial-video/quality/final-video-quality-check.ts");

const CAMPAIGN_ID = "660d53b5-d3dc-47a5-b031-4d035bfd97a3";
const EXECUTE_DIR = path.join(root, "temp", "commercial-v2-full-canary-execute");
const OUT_DIR = path.join(root, "temp", "commercial-v2-final-assembly-remount");

// --- Assets JA PAGOS existentes - nenhum novo, nenhuma regeneracao -------
const SCENE_ASSETS = {
  "scene-1": {
    provider: "freepik-kling-i2v",
    taskId: "17ab385c-bf07-4a0b-a86d-a47f7cfa9844",
    path: path.join(root, "temp", "creative-v2-hook-fidelity-canary", "kling-original-5s.mp4"),
  },
  "scene-2": {
    provider: "freepik-kling-i2v",
    taskId: "ceac7576-f526-4c41-8acf-25c928046795",
    path: path.join(EXECUTE_DIR, "cache", "be35d14af7e76d82ee4695c9.mp4"),
  },
  "scene-3": {
    provider: "freepik-kling-i2v",
    taskId: "79f97ad1-b2fc-407f-b183-eb67ae356cc2",
    path: path.join(EXECUTE_DIR, "cache", "98c13d8d29f08db80dcfaa7b.mp4"),
  },
  "scene-4": {
    provider: "freepik-kling-i2v",
    taskId: "4b2d3ae8-3d0a-41ce-9808-a1e24abb5b37",
    path: path.join(EXECUTE_DIR, "cache", "f20ed5d51fa12ef7a30da837.mp4"),
  },
  "scene-5": {
    provider: "heygen-image-avatar",
    taskId: "b29d98ab5e5945289c79c36810b48cff",
    path: path.join(EXECUTE_DIR, "cache", "934902d3c2d2076a6e3493c1.mp4"),
  },
};

const NARRATION_ASSETS = {
  "scene-1": { audioPath: path.join(EXECUTE_DIR, "narration", "narration-elevenlabs-scene-1.mp3"), actualDurationSeconds: 1.068118 },
  "scene-2": { audioPath: path.join(EXECUTE_DIR, "narration", "narration-elevenlabs-scene-2.mp3"), actualDurationSeconds: 1.486077 },
  "scene-3": { audioPath: path.join(EXECUTE_DIR, "narration", "narration-elevenlabs-scene-3.mp3"), actualDurationSeconds: 3.436553 },
  "scene-4": { audioPath: path.join(EXECUTE_DIR, "narration", "narration-elevenlabs-scene-4.mp3"), actualDurationSeconds: 1.857596 },
  "scene-5": { audioPath: path.join(EXECUTE_DIR, "narration", "narration-elevenlabs-scene-5.mp3"), actualDurationSeconds: 1.625397 },
};

function resolvePlatform(value) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("reels") || normalized.includes("instagram")) return "INSTAGRAM_REELS";
  if (normalized.includes("meta") || normalized.includes("ads")) return "META_ADS";
  return "TIKTOK";
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" });
}

function assertExists(label, filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`ABORTADO: ${label} nao encontrado em disco: ${filePath}`);
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // ======================================================================
  // 1. CONFIRMAR EXISTENCIA/INTEGRIDADE DE TODOS OS ASSETS - abortar antes
  // de qualquer composicao se algo estiver faltando (item 1 do pedido).
  // ======================================================================
  const assetChecks = [];
  for (const [sceneId, asset] of Object.entries(SCENE_ASSETS)) {
    const exists = fs.existsSync(asset.path);
    assetChecks.push({ sceneId, path: asset.path, exists, kind: "scene-video" });
    if (!exists) assertExists(`video da ${sceneId}`, asset.path);
  }
  for (const [sceneId, asset] of Object.entries(NARRATION_ASSETS)) {
    const exists = fs.existsSync(asset.audioPath);
    assetChecks.push({ sceneId, path: asset.audioPath, exists, kind: "narration-audio" });
    if (!exists) assertExists(`narracao da ${sceneId}`, asset.audioPath);
  }
  console.log(`PRE-FLIGHT: ${assetChecks.length}/${assetChecks.length} assets existentes confirmados. Nenhuma regeneracao.`);

  // ======================================================================
  // Reconstroi o promptPlan (deterministico, ja computado antes - zero
  // custo, zero chamada a provider) para overlayInstructions/safeArea/
  // duracoes/narrationPlan reais.
  // ======================================================================
  const { data: fullCampaign } = await supabaseAdmin
    .from("creative_campaigns")
    .select("id,offer_id,aspect_ratio,platform,creative_brief")
    .eq("id", CAMPAIGN_ID)
    .maybeSingle();
  const { data: offerRow } = await supabaseAdmin.from("offers").select("title,price,original_price,discount_pct").eq("id", fullCampaign.offer_id).maybeSingle();
  const { data: piRow } = await supabaseAdmin
    .from("product_intelligence")
    .select("category")
    .eq("offer_id", fullCampaign.offer_id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingBrief = fullCampaign.creative_brief || {};
  const v2 = existingBrief.commercialDirectionV2;
  if (!v2) throw new Error("ABORTADO: commercialDirectionV2 nao encontrado - esta tarefa nunca recalcula Creative Director V2.");

  const aspectRatio = fullCampaign.aspect_ratio || "9:16";
  const platform = resolvePlatform(fullCampaign.platform);
  const ctx = { productTitle: offerRow.title, category: piRow?.category ?? "geral", platform, aspectRatio, defaultLogoAssetId: null };

  const promptPlan = buildCampaignPromptPlan(CAMPAIGN_ID, v2.underlyingDirection, ctx, {
    sceneBlueprints: v2.sceneBlueprints,
    ctaDirection: v2.ctaDirection,
  });

  // ======================================================================
  // 8. REMONTAGEM - so assets existentes, sceneProviders alimenta a
  // policy de padding (scene-duration-padding.ts).
  // ======================================================================
  const sceneVideoPaths = {};
  const sceneProviders = {};
  for (const [sceneId, asset] of Object.entries(SCENE_ASSETS)) {
    sceneVideoPaths[sceneId] = asset.path;
    sceneProviders[sceneId] = asset.provider;
  }

  const timeline = buildCommercialTimeline(promptPlan, { campaignId: CAMPAIGN_ID, aspectRatio, sceneVideoPaths, sceneProviders });
  console.log(`plannedTimelineDurationSeconds = ${timeline.totalDurationSeconds}`);

  const visualOutputPath = path.join(OUT_DIR, `${CAMPAIGN_ID}-visual.mp4`);
  const renderResult = await composeCommercialVideo(timeline, { outputPath: visualOutputPath });

  console.log("renderResult.status:", renderResult.status);
  console.log("durationAdjustments:", JSON.stringify(renderResult.durationAdjustments, null, 2));

  if (renderResult.status !== "COMPLETED" || !renderResult.outputPath) {
    throw new Error(`Composicao visual nao concluida: ${renderResult.error ?? renderResult.status}`);
  }

  // ======================================================================
  // 9. AUDIO - narracoes reais ja sintetizadas, sem nova sintese.
  // ======================================================================
  let cursor = 0;
  const narrationSegments = promptPlan.scenes
    .sort((a, b) => a.sceneOrder - b.sceneOrder)
    .map((scene) => {
      const asset = NARRATION_ASSETS[scene.sceneId];
      const startTime = cursor;
      cursor += scene.durationSeconds;
      return {
        sceneId: scene.sceneId,
        text: null,
        startTime,
        maxDurationSeconds: scene.durationSeconds,
        source: "TTS_RESULT",
        audioPath: asset.audioPath,
        actualDurationSeconds: asset.actualDurationSeconds,
        status: "READY",
        error: null,
      };
    });

  const audioTimeline = buildCommercialAudioTimeline(timeline.totalDurationSeconds, narrationSegments, null, []);
  const mixedAudioPath = path.join(OUT_DIR, `${CAMPAIGN_ID}-audio.wav`);
  const mixResult = await mixCommercialAudio(audioTimeline, mixedAudioPath);
  if (mixResult.status !== "COMPLETED" || !mixResult.outputPath) {
    throw new Error(`Mixagem de audio falhou: ${mixResult.error ?? mixResult.status}`);
  }

  const finalOutputPath = path.join(OUT_DIR, `${CAMPAIGN_ID}-final.mp4`);
  const muxResult = await muxFinalCommercial({ visualVideoPath: renderResult.outputPath, mixedAudioPath: mixResult.outputPath, outputPath: finalOutputPath });
  if (muxResult.status !== "COMPLETED" || !muxResult.outputPath) {
    throw new Error(`Mux final falhou: ${muxResult.error ?? muxResult.status}`);
  }

  // ======================================================================
  // QA tecnico real
  // ======================================================================
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

  const offerScene = promptPlan.scenes.find((s) => s.purpose === "OFFER");
  const visualClaims = [];
  if (offerScene?.overlayInstructions.priceText) {
    visualClaims.push({ sceneId: offerScene.sceneId, source: "COMPOSITOR_OVERLAY", kind: "PRICE", value: offerScene.overlayInstructions.priceText });
  }

  const runnerResultLike = {
    campaignId: CAMPAIGN_ID,
    mode: "EXECUTE",
    status: "COMPLETED",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 0,
    transitions: [],
    scenes: promptPlan.scenes.map((s) => ({
      sceneId: s.sceneId,
      sceneOrder: s.sceneOrder,
      purpose: s.purpose,
      providerCapability: s.mediaType,
      selectedProvider: SCENE_ASSETS[s.sceneId].provider,
      providerStatus: "ACTIVE",
      productGenerationStrategy: null,
      requiresHybridPipeline: false,
      eligibility: "ELIGIBLE",
      eligibilityReason: null,
      estimatedCost: { provider: SCENE_ASSETS[s.sceneId].provider, estimatedCredits: null, estimatedCurrencyCostCents: null, estimatedUsdCostCents: null, actualCredits: null, actualCurrencyCostCents: null },
      persistedStatus: "READY",
      persistedStatusReason: null,
      existingAsset: { source: "GENERATION_RESULT", inputVideoPath: SCENE_ASSETS[s.sceneId].path, status: "READY", rejectionReason: null },
    })),
    narrationPlan: { campaignId: CAMPAIGN_ID, language: "pt-BR", scenes: [], totalCharacters: 0, estimatedCredits: 0, status: "READY" },
    narrationQualityResult: { status: "PASS", reasons: [] },
    costPreview: { videoCreditsKnown: 0, videoCurrencyCostCentsKnown: null, videoUsdCostCentsKnown: 0, ttsCredits: 0, ttsCurrencyCostCents: null, unknownCurrencyComponents: [] },
    videoCostGuard: { status: "OK", reason: null },
    usdCostGuard: { status: "OK", reason: null },
    ttsCostGuard: { status: "OK", reason: null },
    quality: { sceneEligibility: "PASS", assetResolution: "PASS", narrationQuality: "PASS", audioQuality: "NOT_EVALUATED", finalVideoQuality: "NOT_EVALUATED", finalStatus: "PASS" },
    traceability: [],
    finalVideoPath: muxResult.outputPath,
    finalVideoUrl: null,
    executionGuard: { status: "OK", reason: null },
    executionReadiness: { status: "READY", canProduceFinalCommercial: true, scenes: [], reasons: [] },
    sceneExecutionRecords: Object.entries(SCENE_ASSETS).map(([sceneId, asset]) => ({
      sceneId, fingerprint: "reused-from-full-canary", provider: asset.provider, generationId: asset.taskId, status: "COMPLETED", outputUrl: null, durationSeconds: null, completedAt: null, error: null,
    })),
    narrationExecutionRecords: Object.entries(NARRATION_ASSETS).map(([sceneId, asset]) => ({
      sceneId, fingerprint: "reused-from-full-canary", status: "COMPLETED", audioPath: asset.audioPath, actualDurationSeconds: asset.actualDurationSeconds, completedAt: null, error: null,
    })),
    errors: [],
  };

  const quality = assessCommercialQuality({
    runnerResult: runnerResultLike,
    offer: { price: offerRow.price, priceText: offerScene?.overlayInstructions.priceText ?? null, originalPrice: offerRow.original_price, discountPercent: offerRow.discount_pct, discountText: offerScene?.overlayInstructions.discountText ?? null },
    visualClaims,
    manualSceneAssessments: [],
    finalVideoProbe: finalProbe,
    audioQuality,
    allowLegacyEncoderObservation: false,
    plannedTimelineDurationSeconds: timeline.totalDurationSeconds,
  });

  // ======================================================================
  // Frames + contact sheet
  // ======================================================================
  const framesDir = path.join(OUT_DIR, "frames");
  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });
  const duration = finalProbe.durationSeconds ?? timeline.totalDurationSeconds;
  const framePercents = [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.99];
  const framePaths = framePercents.map((pct, i) => {
    const t = Math.min(duration - 0.05, Math.max(0, duration * pct));
    const framePath = path.join(framesDir, `frame-${i}-${Math.round(pct * 100)}pct.png`);
    run("ffmpeg", ["-y", "-ss", String(t), "-i", muxResult.outputPath, "-frames:v", "1", framePath]);
    return framePath;
  });
  const contactSheetPath = path.join(OUT_DIR, "contact-sheet.png");
  run("ffmpeg", ["-y", ...framePaths.flatMap((p) => ["-i", p]), "-filter_complex", `[0][1][2][3][4][5][6][7]hstack=inputs=8`, contactSheetPath]);

  // Frames especificos da scene-5 (freeze-frame) - inicio/meio/fim do slot
  const scene5 = timeline.scenes.find((s) => s.sceneId === "scene-5");
  const scene5FramesDir = path.join(OUT_DIR, "scene5-frames");
  if (!fs.existsSync(scene5FramesDir)) fs.mkdirSync(scene5FramesDir, { recursive: true });
  const scene5FramePaths = [0.02, 0.5, 0.98].map((frac, i) => {
    const t = scene5.startTime + Math.max(0.05, Math.min(scene5.durationSeconds - 0.05, scene5.durationSeconds * frac));
    const framePath = path.join(scene5FramesDir, `scene5-${i}-${Math.round(frac * 100)}pct.png`);
    run("ffmpeg", ["-y", "-ss", String(t), "-i", muxResult.outputPath, "-frames:v", "1", framePath]);
    return framePath;
  });

  const report = {
    generatedAt: new Date().toISOString(),
    campaignId: CAMPAIGN_ID,
    paidCallsThisStep: { WAN: 0, Kling: 0, HeyGen: 0, ElevenLabs: 0 },
    networkGuardrail: { blockedAttempts },
    assetChecks,
    sceneAssetsUsed: SCENE_ASSETS,
    narrationAssetsUsed: NARRATION_ASSETS,
    plannedTimelineDurationSeconds: timeline.totalDurationSeconds,
    renderResult: { status: renderResult.status, error: renderResult.error, durationAdjustments: renderResult.durationAdjustments },
    mixResult,
    muxResult,
    finalVideoPath: muxResult.outputPath,
    finalProbe,
    loudness: { integratedLUFS: masterLoudnessLUFS, peakLevelDb, clipping: audioQuality.clippingDetected },
    audioQuality,
    quality,
    artifacts: {
      contactSheet: path.relative(root, contactSheetPath),
      frames: framePaths.map((p) => path.relative(root, p)),
      scene5Frames: scene5FramePaths.map((p) => path.relative(root, p)),
    },
  };

  await fsp.writeFile(path.join(OUT_DIR, "final-assembly-remount-report.json"), JSON.stringify(report, null, 2));
  console.log(`\nRelatorio salvo: ${path.relative(root, path.join(OUT_DIR, "final-assembly-remount-report.json"))}`);
  console.log(`durationDifference = ${Math.abs((finalProbe.durationSeconds ?? 0) - timeline.totalDurationSeconds).toFixed(3)}s`);
  console.log(`Commercial Quality Gate: status=${quality.status} publishReady=${quality.publishReady} requiresHumanAcknowledgement=${quality.requiresHumanAcknowledgement}`);
  console.log(`blockingReasons: ${JSON.stringify(quality.blockingReasons)}`);
  console.log("Banco alterado: NAO. Storage alterado: NAO (tudo local).");
}

main().catch((err) => {
  console.error("Remontagem falhou/abortada:", err.message, err.stack);
  process.exitCode = 1;
});
