// Radar Smart - First user-approved HYBRID_SALES commercial execute.
//
// Executes exactly one paid version of the approved Kokeshi storyboard.
// No retry, no fallback, no second version, no social publication.

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { execFileSync } = require("node:child_process");

require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");

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

const CAMPAIGN_ID = "660d53b5-d3dc-47a5-b031-4d035bfd97a3";
const APPROVED_STORYBOARD_FINGERPRINT = "ccm-v1-c461fd15";

const LIMITS = {
  klingCreditsMax: 650,
  heygenUsdMax: 0.6,
  elevenLabsCreditsMax: 136,
  wanCreditsMax: 0,
  maxKlingSubmits: 2,
  maxHeyGenSubmits: 3,
  maxElevenLabsSubmits: 5,
};

const OUT_DIR = path.join(root, "temp", "first-user-approved-commercial-canary-execute");
const CACHE_DIR = path.join(OUT_DIR, "asset-cache");
const NARRATION_DIR = path.join(OUT_DIR, "narration");
const FINAL_DIR = path.join(OUT_DIR, "final");
const FRAMES_DIR = path.join(OUT_DIR, "frames");
const PREFLIGHT_SCRIPT = path.join(root, "scripts", "run-first-user-approved-commercial-canary-preflight.js");
const PREFLIGHT_REPORT = path.join(root, "temp", "first-user-approved-commercial-canary-preflight", "kokeshi-final-cost-preflight-report.json");
const REPORT_PATH = path.join(OUT_DIR, "first-user-approved-commercial-execute-report.json");

const KLING_SUBMIT_ENDPOINT = "https://api.freepik.com/v1/ai/image-to-video/kling-v2-5-pro";
const HEYGEN_SUBMIT_ENDPOINT = "https://api.heygen.com/v3/videos";
const ELEVENLABS_HOST = "api.elevenlabs.io";
const BLOCKED_HOST_SUBSTRINGS = ["api.magnific.com", "api.openai.com", "klingai.com", "runwayml", "replicate"];

const EXPECTED_PROVIDER_BY_SCENE = {
  "scene-1": "heygen-image-avatar",
  "scene-2": "freepik-kling-i2v",
  "scene-3": "heygen-image-avatar",
  "scene-4": "freepik-kling-i2v",
  "scene-5": "heygen-image-avatar",
};

const EXPECTED_NARRATION = {
  "scene-1": "Olha esse achado por so R$ 13,16.",
  "scene-2": "Esse e o Creme Gel Kokeshi.",
  "scene-3": "Por esse preco, vale conhecer.",
  "scene-4": "So R$ 13,16.",
  "scene-5": "Entre no Grupo VIP da Radar Smart.",
};

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { resolveCampaignSceneReferences } = require("../lib/generation-orchestrator/reference-resolver.ts");
const { buildCampaignExecutionPlan } = require("../lib/generation-orchestrator/orchestrator.ts");
const { getProviderProfile } = require("../lib/generation-orchestrator/provider-capabilities.ts");
const { estimateSpeechSeconds, computeMaxCharacters } = require("../lib/commercial-video/narration/narration-duration-budget.ts");
const { assessNarrationQuality } = require("../lib/commercial-video/narration/narration-quality-gate.ts");
const { computeNarrationFingerprint, computeSceneFingerprint } = require("../lib/commercial-video/runner/execute/scene-fingerprint.ts");
const { executeNarrationPlan } = require("../lib/commercial-video/runner/execute/narration-executor.ts");
const { executeStandardScene } = require("../lib/commercial-video/runner/execute/scene-executor.ts");
const { composeAndFinalizeCommercial } = require("../lib/commercial-video/runner/execute/final-composer.ts");
const { createGarotaRadarNarrationProvider, GAROTA_RADAR_VOICE_PROFILE } = require("../lib/commercial-video/audio/garota-radar-voice-profile.ts");
const { publishVideoToSupabase } = require("../lib/ai/publish.ts");
const { findFfmpegPath, findFfprobePath } = require("../lib/commercial-video/final-video-codec-policy.ts");

const network = {
  klingSubmitCount: 0,
  heygenSubmitCount: 0,
  elevenLabsSubmitCount: 0,
  blockedAttempts: [],
  storageUploads: 0,
  providerCalls: [],
};

function ensureDirs() {
  for (const dir of [OUT_DIR, CACHE_DIR, NARRATION_DIR, FINAL_DIR, FRAMES_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function normalize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function abortBeforePaid(reason, extra = {}) {
  const report = {
    generatedAt: new Date().toISOString(),
    campaignId: CAMPAIGN_ID,
    mode: "EXECUTE_ABORTED_BEFORE_PAID_PROVIDER",
    abortReason: reason,
    network,
    ...extra,
    COMMERCIAL_RESULT: "FAIL",
    READY_FOR_HUMAN_VIDEO_REVIEW: "NO",
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  throw new Error(reason);
}

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: options.stdio ?? ["ignore", "pipe", "pipe"], ...options });
}

function installPaidProviderFetchGuard() {
  const realFetch = global.fetch;
  global.fetch = async (input, options = {}) => {
    const url = typeof input === "string" ? input : input?.url ? input.url : String(input);
    const method = String(options.method ?? "GET").toUpperCase();

    if (BLOCKED_HOST_SUBSTRINGS.some((host) => url.includes(host))) {
      network.blockedAttempts.push({ url, method });
      throw new Error(`BLOQUEADO: host nao autorizado nesta execucao: ${url}`);
    }

    if (url === KLING_SUBMIT_ENDPOINT && method === "POST") {
      network.klingSubmitCount += 1;
      network.providerCalls.push({ provider: "Kling", method, url, count: network.klingSubmitCount });
      console.log(`\n>>> KLING SUBMIT #${network.klingSubmitCount}/${LIMITS.maxKlingSubmits} <<<`);
      if (network.klingSubmitCount > LIMITS.maxKlingSubmits) {
        throw new Error(`BLOQUEADO: Kling submit excedeu o teto ${LIMITS.maxKlingSubmits}.`);
      }
    }

    if (url === HEYGEN_SUBMIT_ENDPOINT && method === "POST") {
      network.heygenSubmitCount += 1;
      network.providerCalls.push({ provider: "HeyGen", method, url, count: network.heygenSubmitCount });
      console.log(`\n>>> HEYGEN SUBMIT #${network.heygenSubmitCount}/${LIMITS.maxHeyGenSubmits} <<<`);
      if (network.heygenSubmitCount > LIMITS.maxHeyGenSubmits) {
        throw new Error(`BLOQUEADO: HeyGen submit excedeu o teto ${LIMITS.maxHeyGenSubmits}.`);
      }
    }

    if (url.includes(ELEVENLABS_HOST) && method === "POST") {
      network.elevenLabsSubmitCount += 1;
      network.providerCalls.push({ provider: "ElevenLabs", method, url: url.replace(/\/v1\/text-to-speech\/[^/?]+/, "/v1/text-to-speech/<voice-id>"), count: network.elevenLabsSubmitCount });
      console.log(`\n>>> ELEVENLABS SUBMIT #${network.elevenLabsSubmitCount}/${LIMITS.maxElevenLabsSubmits} <<<`);
      if (network.elevenLabsSubmitCount > LIMITS.maxElevenLabsSubmits) {
        throw new Error(`BLOQUEADO: ElevenLabs submit excedeu o teto ${LIMITS.maxElevenLabsSubmits}.`);
      }
    }

    return realFetch(input, options);
  };
}

async function publishAndCount(input) {
  const result = await publishVideoToSupabase(input);
  if (result.status === "success") network.storageUploads += 1;
  return result;
}

function assertPreflightReady() {
  console.log("\n>>> PREFLIGHT READ-ONLY FINAL <<<\n");
  run(process.execPath, [PREFLIGHT_SCRIPT, CAMPAIGN_ID], { stdio: "inherit" });

  const report = JSON.parse(fs.readFileSync(PREFLIGHT_REPORT, "utf8"));
  const approval = report.items?.["1_approval"] ?? {};
  const promptMatch = report.items?.["2_creative_immutability"]?.promptPlanMatchesStoryboard ?? {};
  const costs = report.items?.["8_cost_separated_units"] ?? {};
  const generationPlan = report.items?.["3_scene_generation_plan"] ?? [];
  const blockingReasons = report.items?.["22_blocking_reasons"] ?? [];

  const checks = [
    ["approvalFingerprintValid", approval.approvalFingerprintValid === true],
    ["currentStoryboardFingerprint", approval.currentStoryboardFingerprint === APPROVED_STORYBOARD_FINGERPRINT],
    ["approvedStoryboardFingerprint", approval.approvedStoryboardFingerprint === APPROVED_STORYBOARD_FINGERPRINT],
    ["promptPlanMatchesStoryboard.ok", promptMatch.ok === true],
    ["NARRATION_TIMING_VALID", report.NARRATION_TIMING_VALID === "YES"],
    ["FINAL_VIDEO_ENCODER_READY", report.FINAL_VIDEO_ENCODER_READY === "YES"],
    ["Execution Readiness", report.items?.["11_execution_readiness"]?.status === "READY"],
    ["blockingReasons", Array.isArray(blockingReasons) && blockingReasons.length === 0],
    ["READY_FOR_USER_APPROVED_PAID_EXECUTION", report.READY_FOR_USER_APPROVED_PAID_EXECUTION === "YES"],
    ["KLING_CREDITS_MAX", costs.KLING_CREDITS <= LIMITS.klingCreditsMax],
    ["HEYGEN_USD_MAX", costs.HEYGEN_USD <= LIMITS.heygenUsdMax],
    ["ELEVENLABS_CREDITS_MAX", costs.ELEVENLABS_CREDITS <= LIMITS.elevenLabsCreditsMax],
    ["WAN_CREDITS_MAX", costs.WAN_CREDITS === LIMITS.wanCreditsMax],
  ];

  for (const [label, ok] of checks) {
    if (!ok) abortBeforePaid(`Preflight divergiu: ${label}.`, { preflight: { approval, promptMatch, costs, blockingReasons } });
  }

  const providerCounts = generationPlan.reduce((acc, scene) => {
    acc[scene.provider] = (acc[scene.provider] ?? 0) + 1;
    if (scene.provider !== EXPECTED_PROVIDER_BY_SCENE[scene.sceneId]) {
      abortBeforePaid(`Provider da ${scene.sceneId} divergiu: esperado ${EXPECTED_PROVIDER_BY_SCENE[scene.sceneId]}, obtido ${scene.provider}.`);
    }
    return acc;
  }, {});

  if ((providerCounts["freepik-kling-i2v"] ?? 0) !== LIMITS.maxKlingSubmits) {
    abortBeforePaid(`Quantidade de cenas Kling divergiu: ${providerCounts["freepik-kling-i2v"] ?? 0}.`);
  }
  if ((providerCounts["heygen-image-avatar"] ?? 0) !== LIMITS.maxHeyGenSubmits) {
    abortBeforePaid(`Quantidade de cenas HeyGen divergiu: ${providerCounts["heygen-image-avatar"] ?? 0}.`);
  }

  return report;
}

function buildExactNarrationPlan(campaignId, storyboard) {
  const scenes = [...storyboard.scenes]
    .sort((a, b) => a.sceneNumber - b.sceneNumber)
    .map((scene) => {
      const text = scene.spokenNarration;
      const expected = EXPECTED_NARRATION[scene.sceneId];
      if (normalize(text) !== normalize(expected)) {
        throw new Error(`Narracao da ${scene.sceneId} divergiu do texto aprovado.`);
      }
      const characters = [...text].length;
      const estimatedSpeechSeconds = estimateSpeechSeconds(characters);
      return {
        sceneId: scene.sceneId,
        sceneOrder: scene.sceneNumber,
        purpose: scene.purpose,
        durationSeconds: scene.durationSeconds,
        maxCharacters: computeMaxCharacters(scene.durationSeconds),
        text,
        estimatedSpeechSeconds,
        status: estimatedSpeechSeconds <= scene.durationSeconds ? "READY" : "TOO_LONG",
        reason: estimatedSpeechSeconds <= scene.durationSeconds ? null : "Narracao excede a duracao da cena.",
        candidatesConsidered: 1,
      };
    });

  return {
    campaignId,
    language: "pt-BR",
    scenes,
    totalCharacters: scenes.reduce((sum, scene) => sum + scene.text.length, 0),
    estimatedCredits: scenes.reduce((sum, scene) => sum + scene.text.length, 0),
    status: scenes.every((scene) => scene.status === "READY") ? "READY" : "BLOCKED",
  };
}

function buildRunnerScene(scenePlan, promptScene) {
  const providerProfile = getProviderProfile(scenePlan.selectedProvider);
  return {
    sceneId: scenePlan.sceneId,
    sceneOrder: scenePlan.sceneOrder,
    purpose: promptScene?.purpose ?? "PRODUCT",
    providerCapability: scenePlan.providerCapability,
    selectedProvider: scenePlan.selectedProvider,
    providerStatus: providerProfile?.status ?? null,
    productGenerationStrategy: scenePlan.productGenerationStrategy,
    requiresHybridPipeline: scenePlan.productGenerationStrategy === "HYBRID_PRODUCT_COMPOSITE",
    eligibility: "ELIGIBLE",
    eligibilityReason: null,
    estimatedCost: scenePlan.estimatedCost,
    persistedStatus: scenePlan.status,
    persistedStatusReason: scenePlan.statusReason,
    existingAsset: null,
  };
}

function assertFinalCostEnvelope(executionPlan, narrationPlan) {
  const klingCredits = executionPlan.scenes
    .filter((scene) => scene.selectedProvider === "freepik-kling-i2v")
    .reduce((sum, scene) => sum + (scene.estimatedCost.estimatedCredits ?? 0), 0);
  const heygenUsd = executionPlan.scenes
    .filter((scene) => scene.selectedProvider === "heygen-image-avatar")
    .reduce((sum, scene) => sum + (scene.estimatedCost.estimatedUsdCostCents ?? 0), 0) / 100;
  const wanCredits = executionPlan.scenes
    .filter((scene) => scene.selectedProvider === "wan-2-5-t2v")
    .reduce((sum, scene) => sum + (scene.estimatedCost.estimatedCredits ?? 0), 0);
  const elevenLabsCredits = narrationPlan.totalCharacters;

  if (klingCredits > LIMITS.klingCreditsMax) abortBeforePaid(`Kling previsto ${klingCredits} > ${LIMITS.klingCreditsMax}.`);
  if (heygenUsd > LIMITS.heygenUsdMax) abortBeforePaid(`HeyGen previsto ${heygenUsd} > ${LIMITS.heygenUsdMax}.`);
  if (elevenLabsCredits > LIMITS.elevenLabsCreditsMax) abortBeforePaid(`ElevenLabs previsto ${elevenLabsCredits} > ${LIMITS.elevenLabsCreditsMax}.`);
  if (wanCredits !== LIMITS.wanCreditsMax) abortBeforePaid(`WAN previsto ${wanCredits}; esperado 0.`);

  return { klingCredits, heygenUsd, elevenLabsCredits, wanCredits };
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

function generateFramesAndContactSheet(finalVideoPath, storyboard) {
  const ffmpegPath = findFfmpegPath();
  const frames = [];
  let cursor = 0;
  for (const scene of [...storyboard.scenes].sort((a, b) => a.sceneNumber - b.sceneNumber)) {
    const timestamp = cursor + scene.durationSeconds / 2;
    const framePath = path.join(FRAMES_DIR, `${scene.sceneId}.png`);
    run(ffmpegPath, ["-y", "-ss", timestamp.toFixed(3), "-i", finalVideoPath, "-frames:v", "1", framePath]);
    frames.push({ sceneId: scene.sceneId, path: framePath, timestamp });
    cursor += scene.durationSeconds;
  }

  const contactSheetPath = path.join(OUT_DIR, "contact-sheet.png");
  const filter = frames
    .map((_, index) => `[${index}:v]scale=216:384:force_original_aspect_ratio=decrease,pad=216:384:(ow-iw)/2:(oh-ih)/2[v${index}]`)
    .join(";") + `;${frames.map((_, index) => `[v${index}]`).join("")}hstack=inputs=${frames.length}[out]`;
  run(ffmpegPath, ["-y", ...frames.flatMap((frame) => ["-i", frame.path]), "-filter_complex", filter, "-map", "[out]", contactSheetPath]);

  return {
    frames: frames.map((frame) => ({ sceneId: frame.sceneId, timestamp: frame.timestamp, path: path.relative(root, frame.path) })),
    contactSheet: path.relative(root, contactSheetPath),
  };
}

function runBrowserPlayback(finalVideoPath) {
  try {
    const env = { ...process.env, SKIP_UI: "1" };
    const raw = execFileSync(process.execPath, [path.join(root, "scripts", "diagnose-local-video-playback.js"), finalVideoPath], {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const jsonStart = raw.indexOf("{");
    const parsed = JSON.parse(raw.slice(jsonStart));
    const direct = parsed.directResult ?? {};
    return {
      status: direct.playResult === "ok" && !direct.errorAfter && direct.canPlayH264 ? "PASS" : "FAIL",
      canPlayH264: direct.canPlayH264 ?? null,
      canPlayMpeg4: direct.canPlayMpeg4 ?? null,
      playResult: direct.playResult ?? null,
      duration: direct.durationAfterMetadata ?? null,
      width: direct.videoWidthAfterMetadata ?? null,
      height: direct.videoHeightAfterMetadata ?? null,
      frameSamplesNonBlack: (direct.seeks ?? []).map((seek) => seek.nonBlackSamples ?? null),
      error: direct.errorAfter ?? direct.errorAfterMetadata ?? null,
    };
  } catch (error) {
    return { status: "FAIL", error: error instanceof Error ? error.message : String(error) };
  }
}

function classifyTechnicalResult(metadata, playback) {
  const ok =
    metadata.width === 1080 &&
    metadata.height === 1920 &&
    Math.abs((metadata.fps ?? 0) - 24) < 0.01 &&
    metadata.videoCodec === "h264" &&
    metadata.codecTagString === "avc1" &&
    metadata.audioCodec === "aac" &&
    metadata.audioStreamCount >= 1 &&
    playback.status === "PASS";
  return ok ? "PASS" : "FAIL";
}

async function main() {
  ensureDirs();
  const preflight = assertPreflightReady();

  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from("creative_campaigns")
    .select("id,name,offer_id,product_intelligence_id,aspect_ratio,platform,creative_brief")
    .eq("id", CAMPAIGN_ID)
    .maybeSingle();
  if (campaignError) abortBeforePaid(campaignError.message);
  if (!campaign) abortBeforePaid(`Campaign not found: ${CAMPAIGN_ID}`);

  const storyboard = campaign.creative_brief?.commercialCreationStoryboard;
  const promptPlan = storyboard?.promptPlan ?? campaign.creative_brief?.promptPlan;
  if (!storyboard || !Array.isArray(storyboard.scenes)) abortBeforePaid("Storyboard aprovado ausente.");
  if (!promptPlan || !Array.isArray(promptPlan.scenes)) abortBeforePaid("Prompt Plan aprovado ausente.");
  if (storyboard.storyboardFingerprint !== APPROVED_STORYBOARD_FINGERPRINT) abortBeforePaid("Fingerprint do storyboard divergiu antes da execucao.");

  const { data: productIntelligence } = await supabaseAdmin
    .from("product_intelligence")
    .select("id,category,key_benefits")
    .eq("id", campaign.product_intelligence_id)
    .maybeSingle();

  const category = productIntelligence?.category ?? "geral";
  const resolvedRefs = await resolveCampaignSceneReferences(promptPlan, campaign.offer_id, category);
  const executionPlan = buildCampaignExecutionPlan(CAMPAIGN_ID, "MOCK", promptPlan, resolvedRefs);
  const narrationPlan = buildExactNarrationPlan(CAMPAIGN_ID, storyboard);
  const narrationQuality = assessNarrationQuality(narrationPlan);
  if (narrationPlan.status !== "READY" || narrationQuality.status !== "PASS") {
    abortBeforePaid("Narration plan exato nao esta READY/PASS.", { narrationPlan, narrationQuality });
  }

  const costEnvelope = assertFinalCostEnvelope(executionPlan, narrationPlan);
  const scenes = executionPlan.scenes.map((scenePlan) =>
    buildRunnerScene(scenePlan, promptPlan.scenes.find((scene) => scene.sceneId === scenePlan.sceneId)),
  );

  installPaidProviderFetchGuard();

  console.log("\n>>> PONTO DE NAO RETORNO: iniciando geracao paga unica aprovada <<<\n");
  const narrationProvider = createGarotaRadarNarrationProvider(NARRATION_DIR);
  const narrationOutcome = await executeNarrationPlan(narrationPlan, promptPlan, [], {
    narrationProvider,
    voiceId: GAROTA_RADAR_VOICE_PROFILE.voiceId,
    model: GAROTA_RADAR_VOICE_PROFILE.model,
  });

  const failedNarration = narrationOutcome.records.filter((record) => record.status !== "COMPLETED");
  if (failedNarration.length > 0) {
    throw new Error(`Narracao falhou; parando sem gerar video: ${failedNarration.map((record) => `${record.sceneId}:${record.error}`).join(" | ")}`);
  }

  const characterAudioUrlsBySceneId = {};
  for (const record of narrationOutcome.records) {
    if (!["scene-1", "scene-3", "scene-5"].includes(record.sceneId)) continue;
    const uploaded = await publishAndCount({
      localFilePath: record.audioPath,
      fileName: `kokeshi-approved-${record.sceneId}-audio.mp3`,
      bucket: process.env.AI_ASSET_STORAGE_BUCKET || "ugc-assets",
      contentType: "audio/mpeg",
      metadata: { campaignId: CAMPAIGN_ID, sceneId: record.sceneId, provider: "elevenlabs", purpose: "heygen-audio-url" },
    });
    if (uploaded.status !== "success" || !uploaded.publicUrl) {
      throw new Error(`Falha ao publicar audio ${record.sceneId} para HeyGen: ${uploaded.error ?? "erro desconhecido"}`);
    }
    characterAudioUrlsBySceneId[record.sceneId] = uploaded.publicUrl;
    record.audioUrl = uploaded.publicUrl;
  }

  const sceneExecutionRecords = [];
  const taskIds = {};
  for (const scenePlan of executionPlan.scenes.sort((a, b) => a.sceneOrder - b.sceneOrder)) {
    const fingerprint = computeSceneFingerprint(scenePlan);
    const sceneDeps = {
      cacheDir: CACHE_DIR,
      characterAudioUrlsBySceneId,
      uploadFinalAsset: publishAndCount,
    };
    const outcome = await executeStandardScene(scenePlan, fingerprint, sceneDeps);
    sceneExecutionRecords.push(outcome.record);
    taskIds[scenePlan.sceneId] = outcome.record.generationId;
    if (outcome.record.status !== "COMPLETED" || !outcome.localVideoPath) {
      throw new Error(`Geracao da ${scenePlan.sceneId} falhou; sem retry/fallback: ${outcome.record.error ?? "erro desconhecido"}`);
    }
    const scene = scenes.find((entry) => entry.sceneId === scenePlan.sceneId);
    scene.existingAsset = {
      source: "GENERATION_RESULT",
      inputVideoPath: outcome.localVideoPath,
      status: "READY",
      rejectionReason: null,
    };
  }

  const composition = await composeAndFinalizeCommercial(
    CAMPAIGN_ID,
    promptPlan,
    campaign.aspect_ratio || "9:16",
    scenes,
    narrationOutcome.segments,
    narrationOutcome.records,
    { outputDir: FINAL_DIR, uploadFinalAsset: publishAndCount },
  );

  if (composition.status !== "COMPLETED" || !composition.finalVideoPath) {
    throw new Error(`Composicao final falhou: ${composition.reasons.join(" | ")}`);
  }

  const technicalMetadata = probeMp4(composition.finalVideoPath);
  const frameArtifacts = generateFramesAndContactSheet(composition.finalVideoPath, storyboard);
  const browserPlayback = runBrowserPlayback(composition.finalVideoPath);
  const technicalStatus = classifyTechnicalResult(technicalMetadata, browserPlayback);

  const finalSceneTable = scenes.map((scene) => {
    const narration = narrationOutcome.records.find((record) => record.sceneId === scene.sceneId);
    const exec = sceneExecutionRecords.find((record) => record.sceneId === scene.sceneId);
    const story = storyboard.scenes.find((entry) => entry.sceneId === scene.sceneId);
    return {
      sceneId: scene.sceneId,
      provider: scene.selectedProvider,
      taskId: exec?.generationId ?? null,
      narration: story?.spokenNarration ?? null,
      timelineDuration: story?.durationSeconds ?? null,
      generatedDurationForBilling: scene.selectedProvider === "freepik-kling-i2v" ? 5 : story?.durationSeconds ?? null,
      localVideoPath: scene.existingAsset?.inputVideoPath ? path.relative(root, scene.existingAsset.inputVideoPath) : null,
      outputUrl: exec?.outputUrl ?? null,
      audioPath: narration?.audioPath ? path.relative(root, narration.audioPath) : null,
      audioUrlPresent: Boolean(narration?.audioUrl),
      actualNarrationDurationSeconds: narration?.actualDurationSeconds ?? null,
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    campaignId: CAMPAIGN_ID,
    executedStoryboardFingerprint: APPROVED_STORYBOARD_FINGERPRINT,
    mode: "EXECUTE_ONE_APPROVED_VERSION",
    preflightSummary: {
      APPROVAL_FINGERPRINT_VALID: preflight.APPROVAL_FINGERPRINT_VALID,
      NARRATION_TIMING_VALID: preflight.NARRATION_TIMING_VALID,
      FINAL_VIDEO_ENCODER_READY: preflight.FINAL_VIDEO_ENCODER_READY,
      READY_FOR_USER_APPROVED_PAID_EXECUTION: preflight.READY_FOR_USER_APPROVED_PAID_EXECUTION,
      blockingReasons: preflight.items?.["22_blocking_reasons"] ?? [],
    },
    limits: LIMITS,
    costs: costEnvelope,
    taskIds,
    providersCalled: network.providerCalls,
    submitCounts: {
      Kling: network.klingSubmitCount,
      HeyGen: network.heygenSubmitCount,
      ElevenLabs: network.elevenLabsSubmitCount,
      WAN: 0,
    },
    retries: 0,
    fallback: 0,
    secondVersion: 0,
    assetsGenerated: finalSceneTable,
    finalSceneTable,
    durations: {
      scenes: finalSceneTable.map((scene) => ({ sceneId: scene.sceneId, timelineDuration: scene.timelineDuration, actualNarrationDurationSeconds: scene.actualNarrationDurationSeconds })),
      final: technicalMetadata.durationSeconds,
    },
    artifacts: {
      finalVideoPath: path.relative(root, composition.finalVideoPath),
      finalVideoUrl: composition.finalVideoUrl,
      contactSheet: frameArtifacts.contactSheet,
      frames: frameArtifacts.frames,
      reportPath: path.relative(root, REPORT_PATH),
    },
    qa: {
      product: {
        PRODUCT_FIDELITY: "REQUIRES_HUMAN_REVIEW",
        PRODUCT_EXPERIENCE: "REQUIRES_HUMAN_REVIEW",
        notes: "Validacao visual subjetiva deve ser feita no MP4/contact sheet; o pipeline preservou productReferenceUrl e overlay deterministico.",
      },
      garotaRadar: {
        PRESENTER_CONTINUITY: "REQUIRES_HUMAN_REVIEW",
        notes: "Scenes 1/3/5 usaram a mesma identityReferenceUrl e audio_url externo da voz oficial.",
      },
      audio: {
        narrationCompleteness: narrationOutcome.records.every((record) => record.status === "COMPLETED") ? "PASS" : "FAIL",
        clipping: "PASS_BY_FINAL_COMPOSER_GATE",
        voice: GAROTA_RADAR_VOICE_PROFILE.voiceName,
      },
      technical: {
        status: technicalStatus,
        metadata: technicalMetadata,
      },
      advertising: {
        COMMERCIAL_COHERENCE: "REQUIRES_HUMAN_REVIEW",
        DESIRE_TO_BUY: "REQUIRES_HUMAN_REVIEW",
        SCROLL_STOP: "REQUIRES_HUMAN_REVIEW",
        OFFER_STRENGTH: "REQUIRES_HUMAN_REVIEW",
        CTA_STRENGTH: "REQUIRES_HUMAN_REVIEW",
        GENERIC_AI_AD_RISK: "REQUIRES_HUMAN_REVIEW",
      },
    },
    browserPlayback,
    storageAltered: network.storageUploads > 0,
    storageUploads: network.storageUploads,
    databaseAltered: false,
    publicationPerformed: false,
    network,
    COMMERCIAL_RESULT: technicalStatus === "PASS" ? "PASS_WITH_OBSERVATIONS" : "FAIL",
    READY_FOR_HUMAN_VIDEO_REVIEW: technicalStatus === "PASS" ? "YES" : "NO",
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    COMMERCIAL_RESULT: report.COMMERCIAL_RESULT,
    READY_FOR_HUMAN_VIDEO_REVIEW: report.READY_FOR_HUMAN_VIDEO_REVIEW,
    finalVideoPath: report.artifacts.finalVideoPath,
    finalVideoUrl: report.artifacts.finalVideoUrl,
    contactSheet: report.artifacts.contactSheet,
    taskIds: report.taskIds,
    submitCounts: report.submitCounts,
    costs: report.costs,
    browserPlayback: report.browserPlayback.status,
    reportPath: report.artifacts.reportPath,
  }, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const report = {
    generatedAt: new Date().toISOString(),
    campaignId: CAMPAIGN_ID,
    mode: "EXECUTE_FAILED_OR_STOPPED",
    error: message,
    network,
    storageAltered: network.storageUploads > 0,
    storageUploads: network.storageUploads,
    databaseAltered: false,
    publicationPerformed: false,
    COMMERCIAL_RESULT: "FAIL",
    READY_FOR_HUMAN_VIDEO_REVIEW: "NO",
  };
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  } catch {
    // Nothing else to do; the console error below is the fallback report.
  }
  console.error("\nEXECUTE interrompido:", message);
  console.error(`Relatorio salvo em: ${path.relative(root, REPORT_PATH)}`);
  process.exitCode = 1;
});
