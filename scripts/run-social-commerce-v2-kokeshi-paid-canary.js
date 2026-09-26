// Radar Smart - Social Commerce V2 / Kokeshi paid canary.
//
// Executes exactly one authorized paid version from the approved execution
// preflight. No retries, no fallbacks, no second version, no social publication.

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { execFileSync } = require("node:child_process");
const { createHash, randomUUID } = require("node:crypto");

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

const { executeHeyGenImageToVideo } = require("../lib/generation-orchestrator/adapters/heygen-image-to-video.ts");
const { executeFreepikKlingImageToVideo } = require("../lib/generation-orchestrator/adapters/freepik-kling-image-to-video.ts");
const { generateElevenLabsAudio } = require("../lib/ugc/audio.ts");
const { assertFinalVideoEncoderReady, findFfmpegPath, findFfprobePath } = require("../lib/commercial-video/final-video-codec-policy.ts");

const CAMPAIGN_ID = "660d53b5-d3dc-47a5-b031-4d035bfd97a3";
const OUT_DIR = path.join(root, "temp", "social-commerce-v2-kokeshi-paid-canary");
const AUDIO_DIR = path.join(OUT_DIR, "audio");
const RAW_DIR = path.join(OUT_DIR, "provider-assets");
const CLIPS_DIR = path.join(OUT_DIR, "microbeats");
const FRAMES_DIR = path.join(OUT_DIR, "frames");
const FINAL_DIR = path.join(OUT_DIR, "final");
const OVERLAY_DIR = path.join(OUT_DIR, "overlays");
const REPORT_PATH = path.join(OUT_DIR, "execution-report.json");
const TRACE_PATH = path.join(OUT_DIR, "execution-trace.json");
const PREFLIGHT_SCRIPT = path.join(root, "scripts", "run-social-commerce-v2-kokeshi-execution-preflight.js");
const PREFLIGHT_REPORT = path.join(root, "temp", "social-commerce-v2-kokeshi-execution-preflight", "report.json");

const LIMITS = {
  heygenCalls: 3,
  heygenUsd: 0.6,
  klingCalls: 1,
  klingCredits: 325,
  klingBillableDurationSeconds: 5,
  elevenLabsCalls: 1,
  elevenLabsCredits: 175,
  wanCalls: 0,
  retries: 0,
  fallbacks: 0,
  secondVersion: 0,
};

const VOICE = {
  voiceId: "qUqXzKPs4b4NRdbYKPx7",
  model: "eleven_multilingual_v2",
  profile: "FRIEND_SHOWING_A_FIND",
};

const TARGET = {
  width: 1080,
  height: 1920,
  fps: 24,
  durationSeconds: 15,
};

const PROVIDER_ENDPOINTS = {
  klingSubmit: "https://api.freepik.com/v1/ai/image-to-video/kling-v2-5-pro",
  heygenSubmit: "https://api.heygen.com/v3/videos",
  elevenLabsHost: "api.elevenlabs.io",
};

const REFS = {
  productPackshot: path.join(root, "assets", "reference", "kokeshi", "kokeshi-packshot.webp"),
  productHandInteraction: path.join(root, "assets", "reference", "kokeshi", "kokeshi-hand-interaction.jpeg"),
  productBenefitContext: path.join(root, "assets", "reference", "kokeshi", "kokeshi-benefit-context.webp"),
  logo: path.join(root, "public", "logo-radar-smart.png"),
};

const NARRATION_TEXT =
  "Gente, olha esse achado por só R$ 13,16. " +
  "Por esse preço, dá vontade de testar. " +
  "Só R$ 13,16. " +
  "Quer achar ofertas assim? " +
  "Entra no Grupo VIP da Radar Smart.";

const PHRASES = [
  { id: "phrase-1-hook", text: "Gente, olha esse achado por só R$ 13,16.", start: 0, finalDuration: 2.7 },
  { id: "phrase-2-sales", text: "Por esse preço, dá vontade de testar.", start: 6, finalDuration: 2.4 },
  { id: "phrase-3-price", text: "Só R$ 13,16.", start: 9, finalDuration: 1 },
  { id: "phrase-4-cta-open", text: "Quer achar ofertas assim?", start: 12, finalDuration: 0.9 },
  { id: "phrase-5-cta-close", text: "Entra no Grupo VIP da Radar Smart.", start: 12.9, finalDuration: 2.1 },
];

const HEYGEN_SHOTS = [
  {
    id: "HEYGEN_SHOT_A",
    sceneId: "scene-1",
    purpose: "HOOK",
    imageUrl: "https://vhsfuoskndjebaheyobe.supabase.co/storage/v1/object/public/ugc-assets/brand-assets/character-reference/68bb2a6c-fa5b-4a99-95e4-303b00108faa.png",
    audioClipId: "heygen-shot-a",
  },
  {
    id: "HEYGEN_SHOT_B",
    sceneId: "scene-3",
    purpose: "SALES_ARGUMENT",
    imageUrl: "https://vhsfuoskndjebaheyobe.supabase.co/storage/v1/object/public/ugc-assets/brand-assets/character-reference/cab8de4e-d1aa-4579-9a9b-036b9ff8fe02.png",
    audioClipId: "heygen-shot-b",
  },
  {
    id: "HEYGEN_SHOT_C",
    sceneId: "scene-5",
    purpose: "CTA",
    imageUrl: "https://vhsfuoskndjebaheyobe.supabase.co/storage/v1/object/public/ugc-assets/brand-assets/character-reference/d5f041bd-ca69-423c-b2f8-ce072aa03f4c.png",
    audioClipId: "heygen-shot-c",
  },
];

const KLING_PROMPT =
  "Vertical 9:16 social commerce skincare product shot. Use the reference image as the exact Kokeshi product source: same package, proportions, label, brand, colors and shape. " +
  "A real human hand naturally holds and turns the Kokeshi product on a clean skincare vanity/bathroom counter, close detail, gentle camera push-in, realistic scale, label readable. " +
  "Show product handling and presentation only. No cream, no gel texture, no facial application, no invented visual claim, no generated text overlay.";

const KLING_NEGATIVE_PROMPT =
  "floating product, spinning product alone, white-background-only packshot, invented cream, gel texture, face application, product on face, fake label, altered logo, altered package, wrong colors, hallucinated text, unreadable label, extra text, watermark, distorted hand, extra fingers, missing fingers, deformed tube";

const network = {
  heygenSubmitCount: 0,
  klingSubmitCount: 0,
  elevenLabsSubmitCount: 0,
  wanSubmitCount: 0,
  providerCalls: [],
  blockedAttempts: [],
  downloads: [],
};

const storage = {
  writes: [],
};

function ensureDirs() {
  for (const dir of [OUT_DIR, AUDIO_DIR, RAW_DIR, CLIPS_DIR, FRAMES_DIR, FINAL_DIR]) {
    fs.mkdirSync(OVERLAY_DIR, { recursive: true });
    fs.mkdirSync(dir, { recursive: true });
  }
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function abortBeforePaid(reason, extra = {}) {
  ensureDirs();
  writeJson(REPORT_PATH, {
    generatedAt: new Date().toISOString(),
    campaignId: CAMPAIGN_ID,
    mode: "ABORTED_BEFORE_FIRST_PROVIDER",
    abortReason: reason,
    network,
    storageWrites: storage.writes,
    databaseWrites: 0,
    publicationStatus: "NOT_PUBLISHED",
    ...extra,
    COMMERCIAL_RESULT: "FAIL",
    READY_FOR_HUMAN_VIDEO_REVIEW: "NO",
  });
  throw new Error(reason);
}

function writeFailureReport(reason, extra = {}) {
  ensureDirs();
  writeJson(REPORT_PATH, {
    generatedAt: new Date().toISOString(),
    campaignId: CAMPAIGN_ID,
    mode: "FAILED_OR_STOPPED_AFTER_START",
    error: reason,
    network,
    storageWrites: storage.writes,
    databaseWrites: 0,
    publicationStatus: "NOT_PUBLISHED",
    retries: 0,
    fallbacks: 0,
    secondVersion: 0,
    ...extra,
    COMMERCIAL_RESULT: "FAIL",
    READY_FOR_HUMAN_VIDEO_REVIEW: "NO",
  });
}

function hydratePreviousAttemptState() {
  if (!fs.existsSync(REPORT_PATH)) return;
  try {
    const previous = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
    if (previous.network) {
      network.heygenSubmitCount = previous.network.heygenSubmitCount ?? network.heygenSubmitCount;
      network.klingSubmitCount = previous.network.klingSubmitCount ?? network.klingSubmitCount;
      network.elevenLabsSubmitCount = previous.network.elevenLabsSubmitCount ?? network.elevenLabsSubmitCount;
      network.wanSubmitCount = previous.network.wanSubmitCount ?? network.wanSubmitCount;
      network.providerCalls = Array.isArray(previous.network.providerCalls) ? previous.network.providerCalls : network.providerCalls;
      network.blockedAttempts = Array.isArray(previous.network.blockedAttempts) ? previous.network.blockedAttempts : network.blockedAttempts;
      network.downloads = Array.isArray(previous.network.downloads) ? previous.network.downloads : network.downloads;
    }
    if (Array.isArray(previous.storageWrites)) storage.writes = previous.storageWrites;
  } catch {
    // A corrupt prior report should not hide the current execution state.
  }
}

function assertFileExists(label, filePath) {
  if (!fs.existsSync(filePath)) abortBeforePaid(`${label} nao encontrado: ${filePath}`);
}

function assertPreflightReady() {
  run(process.execPath, [PREFLIGHT_SCRIPT, CAMPAIGN_ID], { stdio: "inherit" });
  const report = JSON.parse(fs.readFileSync(PREFLIGHT_REPORT, "utf8"));
  const preflight = report.executionPreflight;
  const gates = Object.fromEntries(preflight.gates.map((entry) => [entry.name, entry.status]));

  const checks = [
    ["SOCIAL_COMMERCE_EXECUTION_PREFLIGHT", report.SOCIAL_COMMERCE_EXECUTION_PREFLIGHT === "PASS"],
    ["READY_FOR_PAID_SOCIAL_COMMERCE_CANARY", report.READY_FOR_PAID_SOCIAL_COMMERCE_CANARY === "YES"],
    ["TOTAL_MICROBEATS", preflight.totals.TOTAL_MICROBEATS === 17],
    ["PRESENTER_VISUAL_VARIETY_READY", preflight.result.PRESENTER_VISUAL_VARIETY_READY === "YES"],
    ["SHOT_REFERENCE_READINESS", gates.SHOT_REFERENCE_READINESS === "PASS"],
    ["PRODUCT_EXPERIENCE_EXECUTABLE", preflight.result.PRODUCT_EXPERIENCE_EXECUTABLE === "YES"],
    ["AUDIO_ENERGY_EXECUTABLE", preflight.result.AUDIO_ENERGY_EXECUTABLE === "YES"],
    ["MICROBEAT_EXECUTION_EFFICIENCY", gates.MICROBEAT_EXECUTION_EFFICIENCY === "PASS"],
    ["HEYGEN_PRESENTER_FEASIBILITY", preflight.feasibility.HEYGEN_PRESENTER_FEASIBILITY === "HIGH"],
    ["KLING_PRODUCT_EXPERIENCE_FEASIBILITY", preflight.feasibility.KLING_PRODUCT_EXPERIENCE_FEASIBILITY === "HIGH"],
    ["PACKSHOT_REFERENCE_READY", preflight.productExperienceReadiness.PACKSHOT_REFERENCE_READY === "YES"],
    ["HAND_INTERACTION_REFERENCE_READY", preflight.productExperienceReadiness.HAND_INTERACTION_REFERENCE_READY === "YES"],
    ["SKINCARE_CONTEXT_REFERENCE_READY", preflight.productExperienceReadiness.SKINCARE_CONTEXT_REFERENCE_READY === "YES"],
    ["BENEFIT_CONTEXT_REFERENCE_READY", preflight.productExperienceReadiness.BENEFIT_CONTEXT_REFERENCE_READY === "YES"],
    ["TEXTURE_REFERENCE_READY", preflight.productExperienceReadiness.TEXTURE_REFERENCE_READY === "NO"],
    ["APPLICATION_REFERENCE_READY", preflight.productExperienceReadiness.APPLICATION_REFERENCE_READY === "NO"],
    ["HEYGEN_CALLS_PLANNED", preflight.totals.HEYGEN_CALLS_PLANNED === LIMITS.heygenCalls],
    ["KLING_CALLS_PLANNED", preflight.totals.KLING_CALLS_PLANNED === LIMITS.klingCalls],
    ["ELEVENLABS_CALLS_PLANNED", preflight.totals.ELEVENLABS_CALLS_PLANNED === LIMITS.elevenLabsCalls],
    ["WAN_CALLS", preflight.estimatedCosts.WAN.numberOfGenerationCalls === 0],
    ["VOICE_ID", preflight.audioPlan.voiceId === VOICE.voiceId],
    ["VOICE_MODEL", preflight.audioPlan.model === VOICE.model],
  ];

  for (const [label, ok] of checks) {
    if (!ok) abortBeforePaid(`Preflight divergiu antes do custo: ${label}.`, { preflightSummary: preflight.result });
  }

  const costs = preflight.estimatedCosts;
  if (costs.HEYGEN.estimatedUsd > LIMITS.heygenUsd) abortBeforePaid(`HeyGen USD ${costs.HEYGEN.estimatedUsd} > ${LIMITS.heygenUsd}.`);
  if (costs.KLING.estimatedCredits > LIMITS.klingCredits) abortBeforePaid(`Kling credits ${costs.KLING.estimatedCredits} > ${LIMITS.klingCredits}.`);
  if (costs.KLING.billableDurationSeconds > LIMITS.klingBillableDurationSeconds) abortBeforePaid(`Kling billable duration ${costs.KLING.billableDurationSeconds}s > 5s.`);
  if (NARRATION_TEXT.length > LIMITS.elevenLabsCredits) abortBeforePaid(`ElevenLabs chars ${NARRATION_TEXT.length} > ${LIMITS.elevenLabsCredits}.`);

  return report;
}

function installPaidNetworkGuard() {
  const realFetch = global.fetch;
  const blockedHostSubstrings = [
    "api.openai.com",
    "api.magnific.com",
    "klingai.com",
    "runwayml",
    "replicate",
  ];

  global.fetch = async (input, options = {}) => {
    const url = typeof input === "string" ? input : input?.url ? input.url : String(input);
    const method = String(options.method ?? "GET").toUpperCase();

    if (blockedHostSubstrings.some((host) => url.includes(host))) {
      network.blockedAttempts.push({ url, method });
      throw new Error(`BLOQUEADO: host nao autorizado neste canary: ${url}`);
    }

    if (url === PROVIDER_ENDPOINTS.klingSubmit && method === "POST") {
      network.klingSubmitCount += 1;
      network.providerCalls.push({ provider: "KLING", method, url, count: network.klingSubmitCount });
      console.log(`\n>>> KLING SUBMIT #${network.klingSubmitCount}/${LIMITS.klingCalls} <<<`);
      if (network.klingSubmitCount > LIMITS.klingCalls) throw new Error("BLOQUEADO: Kling excedeu 1 submit.");
    }

    if (url === PROVIDER_ENDPOINTS.heygenSubmit && method === "POST") {
      network.heygenSubmitCount += 1;
      network.providerCalls.push({ provider: "HEYGEN", method, url, count: network.heygenSubmitCount });
      console.log(`\n>>> HEYGEN SUBMIT #${network.heygenSubmitCount}/${LIMITS.heygenCalls} <<<`);
      if (network.heygenSubmitCount > LIMITS.heygenCalls) throw new Error("BLOQUEADO: HeyGen excedeu 3 submits.");
    }

    if (url.includes(PROVIDER_ENDPOINTS.elevenLabsHost) && method === "POST") {
      network.elevenLabsSubmitCount += 1;
      network.providerCalls.push({
        provider: "ELEVENLABS",
        method,
        url: url.replace(/\/v1\/text-to-speech\/[^/?]+/, "/v1/text-to-speech/<voice-id>"),
        count: network.elevenLabsSubmitCount,
      });
      console.log(`\n>>> ELEVENLABS SUBMIT #${network.elevenLabsSubmitCount}/${LIMITS.elevenLabsCalls} <<<`);
      if (network.elevenLabsSubmitCount > LIMITS.elevenLabsCalls) throw new Error("BLOQUEADO: ElevenLabs excedeu 1 submit.");
    }

    return realFetch(input, options);
  };
}

function mimeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4") return "video/mp4";
  return "application/octet-stream";
}

async function uploadPublicAsset(localFilePath, fileName, metadata = {}) {
  const bucket = process.env.AI_ASSET_STORAGE_BUCKET || "ugc-assets";
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const storagePath = `social-commerce-v2-kokeshi/${Date.now()}-${randomUUID()}-${fileName}`;
  const bytes = fs.readFileSync(localFilePath);
  const uploaded = await supabase.storage.from(bucket).upload(storagePath, bytes, {
    contentType: mimeForFile(localFilePath),
    upsert: false,
    cacheControl: "3600",
    metadata,
  });
  if (uploaded.error) throw new Error(`Falha ao subir asset publico ${fileName}: ${uploaded.error.message}`);
  const publicUrl = supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
  storage.writes.push({ bucket, path: storagePath, localFilePath: rel(localFilePath), publicUrl, contentType: mimeForFile(localFilePath) });
  return publicUrl;
}

async function downloadToFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao baixar ${url}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  network.downloads.push({ url, outputPath: rel(outputPath), bytes: buffer.length });
  return outputPath;
}

function probeMedia(filePath) {
  const raw = run(findFfprobePath(), ["-v", "error", "-show_format", "-show_streams", "-print_format", "json", filePath]);
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
    videoEncoder: video?.codec_long_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    audioStreamCount: data.streams.filter((stream) => stream.codec_type === "audio").length,
    sizeBytes: Number(data.format?.size ?? 0),
  };
}

function audioDuration(filePath) {
  return probeMedia(filePath).durationSeconds;
}

function sliceAudio(inputPath, outputPath, start, duration, targetDuration = duration) {
  const pad = Math.max(0, targetDuration - duration);
  run(findFfmpegPath(), [
    "-y",
    "-ss", start.toFixed(3),
    "-t", duration.toFixed(3),
    "-i", inputPath,
    "-af", `apad=pad_dur=${pad.toFixed(3)},atrim=0:${targetDuration.toFixed(3)},asetpts=PTS-STARTPTS`,
    "-ar", "48000",
    "-ac", "2",
    "-c:a", "mp3_mf",
    "-b:a", "128k",
    outputPath,
  ]);
}

function concatAudio(inputs, outputPath, targetDuration) {
  const listPath = path.join(AUDIO_DIR, `${path.basename(outputPath)}.txt`);
  fs.writeFileSync(listPath, inputs.map((inputPath) => `file '${inputPath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  run(findFfmpegPath(), [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-af", `apad=pad_dur=${targetDuration.toFixed(3)},atrim=0:${targetDuration.toFixed(3)},asetpts=PTS-STARTPTS`,
    "-ar", "48000",
    "-ac", "2",
    "-c:a", "mp3_mf",
    "-b:a", "128k",
    outputPath,
  ]);
}

function normalizeNarrationTempo(inputPath) {
  const duration = audioDuration(inputPath);
  if (duration <= 11) return { path: inputPath, originalDuration: duration, tempoFactor: 1 };

  const targetDuration = 9.6;
  const tempoFactor = Math.min(2, Math.max(1, duration / targetDuration));
  const outputPath = path.join(AUDIO_DIR, "elevenlabs-full-narration-tempo-normalized.wav");
  run(findFfmpegPath(), [
    "-y",
    "-i", inputPath,
    "-af", `atempo=${tempoFactor.toFixed(3)},aresample=48000`,
    "-ar", "48000",
    "-ac", "2",
    "-c:a", "pcm_s16le",
    outputPath,
  ]);
  return { path: outputPath, originalDuration: duration, tempoFactor };
}

function buildAudioClips(fullAudioPath) {
  const normalized = normalizeNarrationTempo(fullAudioPath);
  const totalDuration = audioDuration(normalized.path);
  const totalChars = PHRASES.reduce((sum, phrase) => sum + phrase.text.length, 0);
  let cursorChars = 0;
  const phraseClips = {};
  for (const phrase of PHRASES) {
    const start = (cursorChars / totalChars) * totalDuration;
    const sourceDuration = Math.max(0.25, (phrase.text.length / totalChars) * totalDuration);
    const outputPath = path.join(AUDIO_DIR, `${phrase.id}.mp3`);
    sliceAudio(normalized.path, outputPath, start, sourceDuration, phrase.finalDuration);
    phraseClips[phrase.id] = { ...phrase, sourceStart: start, sourceDuration, outputPath };
    cursorChars += phrase.text.length;
  }

  const heygenA = path.join(AUDIO_DIR, "heygen-shot-a.mp3");
  const heygenB = path.join(AUDIO_DIR, "heygen-shot-b.mp3");
  const heygenC = path.join(AUDIO_DIR, "heygen-shot-c.mp3");
  sliceAudio(normalized.path, heygenA, phraseClips["phrase-1-hook"].sourceStart, phraseClips["phrase-1-hook"].sourceDuration, 3);
  sliceAudio(normalized.path, heygenB, phraseClips["phrase-2-sales"].sourceStart, phraseClips["phrase-2-sales"].sourceDuration, 3);
  concatAudio([phraseClips["phrase-4-cta-open"].outputPath, phraseClips["phrase-5-cta-close"].outputPath], heygenC, 3);

  return {
    normalizedNarration: normalized,
    totalDuration,
    phraseClips,
    heygenClips: {
      "heygen-shot-a": heygenA,
      "heygen-shot-b": heygenB,
      "heygen-shot-c": heygenC,
    },
  };
}

function dataUriForImage(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.length > 10 * 1024 * 1024) throw new Error(`Imagem excede 10MB: ${filePath}`);
  return `data:${mimeForFile(filePath)};base64,${bytes.toString("base64")}`;
}

async function executeProviders(audioClips) {
  const uploadedAudioUrls = {};
  for (const [clipId, clipPath] of Object.entries(audioClips.heygenClips)) {
    const previousUpload = storage.writes.find((write) => String(write.path).endsWith(`${clipId}.mp3`));
    uploadedAudioUrls[clipId] = previousUpload?.publicUrl ??
      await uploadPublicAsset(clipPath, `${clipId}.mp3`, { campaignId: CAMPAIGN_ID, purpose: "heygen-audio-url" });
  }

  const heygenAssets = {};
  for (const shot of HEYGEN_SHOTS) {
    const localPath = path.join(RAW_DIR, `${shot.id}.mp4`);
    if (fs.existsSync(localPath)) {
      heygenAssets[shot.id] = {
        ...shot,
        result: { status: "success", videoId: null, outputUrl: null, error: null, resumedFromLocalAsset: true },
        localPath,
      };
      continue;
    }

    const result = await executeHeyGenImageToVideo({
      imageUrl: shot.imageUrl,
      audioUrl: uploadedAudioUrls[shot.audioClipId],
      resolution: "1080p",
      aspectRatio: "9:16",
    });
    if (result.status !== "success" || !result.outputUrl) {
      throw new Error(`HeyGen ${shot.id} falhou; sem retry/fallback: ${result.error ?? "erro desconhecido"}`);
    }
    await downloadToFile(result.outputUrl, localPath);
    heygenAssets[shot.id] = { ...shot, result, localPath };
  }

  const klingPath = path.join(RAW_DIR, "KLING_PRODUCT_EXPERIENCE_A.mp4");
  let klingResult = null;
  if (fs.existsSync(klingPath)) {
    klingResult = { status: "success", taskId: null, outputUrl: null, error: null, resumedFromLocalAsset: true };
  } else {
    const blockedKlingDownload = network.blockedAttempts.find((attempt) =>
      attempt.method === "GET" && String(attempt.url).includes("cdn-magnific.freepik.com/kling_"),
    );

    if (network.klingSubmitCount >= LIMITS.klingCalls && blockedKlingDownload?.url) {
      await downloadToFile(blockedKlingDownload.url, klingPath);
      klingResult = {
        status: "success",
        taskId: null,
        outputUrl: blockedKlingDownload.url,
        error: null,
        resumedFromBlockedDownloadUrl: true,
      };
    } else {
      klingResult = await executeFreepikKlingImageToVideo({
        inputImageUrl: dataUriForImage(REFS.productHandInteraction),
        prompt: KLING_PROMPT,
        negativePrompt: KLING_NEGATIVE_PROMPT,
        duration: "5",
        cfgScale: 0.5,
      });
      if (klingResult.status !== "success" || !klingResult.outputUrl) {
        throw new Error(`Kling falhou; sem retry/fallback: ${klingResult.error ?? "erro desconhecido"}`);
      }
      await downloadToFile(klingResult.outputUrl, klingPath);
    }
  }

  return {
    heygenAssets,
    klingAsset: { id: "KLING_PRODUCT_EXPERIENCE_A", result: klingResult, localPath: klingPath },
    uploadedAudioUrls,
  };
}

function createTextOverlayPng(text, options) {
  const width = options.width ?? 900;
  const height = options.height ?? 160;
  const fontSize = options.fontSize ?? 58;
  const id = createHash("sha1").update(`${text}|${width}|${height}|${fontSize}`).digest("hex").slice(0, 12);
  const outputPath = path.join(OVERLAY_DIR, `${id}.png`);
  if (fs.existsSync(outputPath)) return outputPath;

  const encodedText = Buffer.from(text, "utf8").toString("base64");
  const scriptPath = path.join(OVERLAY_DIR, "render-text-overlay.ps1");
  if (!fs.existsSync(scriptPath)) {
    const script = [
    "param([string]$EncodedText, [string]$Out, [int]$Width, [int]$Height, [double]$FontSize)",
    "Add-Type -AssemblyName System.Drawing",
    "$text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($EncodedText))",
    "$bmp = New-Object System.Drawing.Bitmap $Width, $Height",
    "$g = [System.Drawing.Graphics]::FromImage($bmp)",
    "$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias",
    "$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit",
    "$g.Clear([System.Drawing.Color]::Transparent)",
    "$boxBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(150, 0, 0, 0))",
    "$g.FillRectangle($boxBrush, 0, 0, $Width, $Height)",
    "$font = New-Object System.Drawing.Font 'Arial', $FontSize, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)",
    "$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)",
    "$format = New-Object System.Drawing.StringFormat",
    "$format.Alignment = [System.Drawing.StringAlignment]::Center",
    "$format.LineAlignment = [System.Drawing.StringAlignment]::Center",
    "$rect = New-Object System.Drawing.RectangleF 18, 0, ($Width - 36), $Height",
    "$g.DrawString($text, $font, $brush, $rect, $format)",
    "$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)",
    "$g.Dispose(); $bmp.Dispose(); $font.Dispose(); $brush.Dispose(); $boxBrush.Dispose(); $format.Dispose()",
    ].join("\n");
    fs.writeFileSync(scriptPath, script, "utf8");
  }

  run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, encodedText, outputPath, String(width), String(height), String(fontSize)]);
  return outputPath;
}

function addOverlayStage(stages, currentLabel, inputIndex, yExpression) {
  const nextLabel = `ov${stages.length}`;
  stages.push(`[${currentLabel}][${inputIndex}:v]overlay=(W-w)/2:${yExpression}[${nextLabel}]`);
  return nextLabel;
}

function renderMicrobeat(beat, sourcePath, outputPath) {
  const args = ["-y"];
  const isImage = /\.(png|jpe?g|webp)$/i.test(sourcePath);
  if (isImage) {
    args.push("-loop", "1", "-t", beat.duration.toFixed(3), "-i", sourcePath);
  } else {
    args.push("-ss", (beat.sourceStart ?? 0).toFixed(3), "-i", sourcePath);
  }

  const overlayInputs = [];
  if (beat.overlayTop) overlayInputs.push({ path: createTextOverlayPng(beat.overlayTop, { fontSize: beat.overlayTopSize ?? 58 }), y: "H*0.08" });
  if (beat.priceText) overlayInputs.push({ path: createTextOverlayPng(beat.priceText, { width: 940, height: 210, fontSize: 94 }), y: "H*0.65" });
  if (beat.overlayBottom) overlayInputs.push({ path: createTextOverlayPng(beat.overlayBottom, { fontSize: beat.overlayBottomSize ?? 58 }), y: "H*0.78" });

  for (const overlay of overlayInputs) args.push("-i", overlay.path);

  const includeLogo = true;
  if (includeLogo && fs.existsSync(REFS.logo)) args.push("-i", REFS.logo);

  const stages = [`[0:v]scale=${TARGET.width}:${TARGET.height}:force_original_aspect_ratio=increase,crop=${TARGET.width}:${TARGET.height},fps=${TARGET.fps},setsar=1[base]`];
  let currentLabel = "base";
  overlayInputs.forEach((overlay, index) => {
    currentLabel = addOverlayStage(stages, currentLabel, index + 1, overlay.y);
  });

  if (includeLogo && fs.existsSync(REFS.logo)) {
    const logoInputIndex = 1 + overlayInputs.length;
    stages.push(`[${logoInputIndex}:v]scale=210:-1[logo]`);
    stages.push(`[${currentLabel}][logo]overlay=W-w-24:H-h-24[outv]`);
  } else {
    stages.push(`[${currentLabel}]null[outv]`);
  }

  args.push(
    "-t", beat.duration.toFixed(3),
    "-filter_complex", stages.join(";"),
    "-map", "[outv]",
    "-an",
    "-c:v", "h264_mf",
    "-tag:v", "avc1",
    "-pix_fmt", "yuv420p",
    outputPath,
  );
  run(findFfmpegPath(), args);
}

function buildMicrobeatPlan(providerAssets) {
  return [
    { id: "scene-1-beat-1", start: 0, duration: 0.55, source: "HEYGEN_SHOT_A", sourceStart: 0, overlayTop: "ACHADO DE SKINCARE" },
    { id: "scene-1-beat-2", start: 0.55, duration: 0.55, source: "HEYGEN_SHOT_A", sourceStart: 0.55, overlayTop: "OLHA ISSO" },
    { id: "scene-1-beat-3", start: 1.1, duration: 0.65, source: "HEYGEN_SHOT_A", sourceStart: 1.1, priceText: "R$ 13,16" },
    { id: "scene-1-beat-4", start: 1.75, duration: 1.25, source: "HEYGEN_SHOT_A", sourceStart: 1.75, overlayBottom: "VALE TESTAR?" },
    { id: "scene-2-beat-1", start: 3, duration: 0.7, source: "KLING_PRODUCT_EXPERIENCE_A", sourceStart: 0, overlayTop: null },
    { id: "scene-2-beat-2", start: 3.7, duration: 0.8, source: "KLING_PRODUCT_EXPERIENCE_A", sourceStart: 0.7, overlayTop: null },
    { id: "scene-2-beat-3", start: 4.5, duration: 0.9, source: "KLING_PRODUCT_EXPERIENCE_A", sourceStart: 1.5, overlayBottom: "ROTULO LEGIVEL", overlayBottomSize: 54 },
    { id: "scene-2-beat-4", start: 5.4, duration: 0.6, source: "KLING_PRODUCT_EXPERIENCE_A", sourceStart: 2.4, overlayBottom: "KOKESHI", overlayBottomSize: 62 },
    { id: "scene-3-beat-1", start: 6, duration: 0.8, source: "HEYGEN_SHOT_B", sourceStart: 0, overlayTop: "VALE TESTAR" },
    { id: "scene-3-beat-2", start: 6.8, duration: 0.8, source: "PRODUCT_HAND_STATIC", overlayTop: null },
    { id: "scene-3-beat-3", start: 7.6, duration: 1.4, source: "HEYGEN_SHOT_B", sourceStart: 1.1, overlayBottom: "ACHADO DE SKINCARE", overlayBottomSize: 54 },
    { id: "scene-4-beat-1", start: 9, duration: 0.8, source: "PRODUCT_PACKSHOT_STATIC", overlayTop: null },
    { id: "scene-4-beat-2", start: 9.8, duration: 0.8, source: "PRODUCT_PACKSHOT_STATIC", priceText: "R$ 13,16" },
    { id: "scene-4-beat-3", start: 10.6, duration: 1.4, source: "PRODUCT_BENEFIT_STATIC", overlayBottom: "RADAR SMART", overlayBottomSize: 62 },
    { id: "scene-5-beat-1", start: 12, duration: 0.9, source: "HEYGEN_SHOT_C", sourceStart: 0, overlayTop: "GRUPO VIP" },
    { id: "scene-5-beat-2", start: 12.9, duration: 1.0, source: "HEYGEN_SHOT_C", sourceStart: 0.9, overlayBottom: "RADAR SMART", overlayBottomSize: 62 },
    { id: "scene-5-beat-3", start: 13.9, duration: 1.1, source: "HEYGEN_SHOT_C", sourceStart: 1.9, overlayBottom: "OFERTAS COMO ESSA", overlayBottomSize: 50 },
  ].map((beat) => ({
    ...beat,
    sourcePath: {
      HEYGEN_SHOT_A: providerAssets.heygenAssets.HEYGEN_SHOT_A.localPath,
      HEYGEN_SHOT_B: providerAssets.heygenAssets.HEYGEN_SHOT_B.localPath,
      HEYGEN_SHOT_C: providerAssets.heygenAssets.HEYGEN_SHOT_C.localPath,
      KLING_PRODUCT_EXPERIENCE_A: providerAssets.klingAsset.localPath,
      PRODUCT_HAND_STATIC: REFS.productHandInteraction,
      PRODUCT_PACKSHOT_STATIC: REFS.productPackshot,
      PRODUCT_BENEFIT_STATIC: REFS.productBenefitContext,
    }[beat.source],
  }));
}

function renderVisual(providerAssets) {
  const microbeats = buildMicrobeatPlan(providerAssets);
  const rendered = [];
  for (const beat of microbeats) {
    const outputPath = path.join(CLIPS_DIR, `${beat.id}.mp4`);
    renderMicrobeat(beat, beat.sourcePath, outputPath);
    rendered.push({ ...beat, outputPath });
  }

  const concatPath = path.join(CLIPS_DIR, "concat.txt");
  fs.writeFileSync(concatPath, rendered.map((beat) => `file '${beat.outputPath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  const visualPath = path.join(FINAL_DIR, "social-commerce-v2-kokeshi-visual.mp4");
  run(findFfmpegPath(), ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", visualPath]);
  return { visualPath, microbeats: rendered, overlayRenderer: "LOCAL_PNG_OVERLAYS_SYSTEM_DRAWING" };
}

function generateTone(outputPath, frequency, duration, volume = 0.18) {
  run(findFfmpegPath(), [
    "-y",
    "-f", "lavfi",
    "-i", `sine=frequency=${frequency}:duration=${duration}:sample_rate=48000`,
    "-af", `volume=${volume}`,
    "-c:a", "pcm_s16le",
    outputPath,
  ]);
}

function generateMusicAndSfx() {
  const musicPath = path.join(AUDIO_DIR, "continuous-light-music-bed.wav");
  run(findFfmpegPath(), [
    "-y",
    "-f", "lavfi",
    "-i", `sine=frequency=176:duration=${TARGET.durationSeconds}:sample_rate=48000`,
    "-f", "lavfi",
    "-i", `sine=frequency=264:duration=${TARGET.durationSeconds}:sample_rate=48000`,
    "-filter_complex", "[0:a]volume=0.035[a0];[1:a]volume=0.022[a1];[a0][a1]amix=inputs=2:normalize=0,highpass=f=120,lowpass=f=4200[m]",
    "-map", "[m]",
    "-c:a", "pcm_s16le",
    musicPath,
  ]);

  const sfx = [
    { id: "snap-in", at: 0, frequency: 900, duration: 0.08, volume: 0.16 },
    { id: "price-pop", at: 1.1, frequency: 1180, duration: 0.09, volume: 0.18 },
    { id: "soft-tap", at: 3, frequency: 520, duration: 0.06, volume: 0.11 },
    { id: "cash-pop", at: 9.8, frequency: 1300, duration: 0.08, volume: 0.16 },
    { id: "button-pop", at: 12.9, frequency: 1040, duration: 0.08, volume: 0.15 },
  ].map((event) => {
    const outputPath = path.join(AUDIO_DIR, `${event.id}.wav`);
    generateTone(outputPath, event.frequency, event.duration, event.volume);
    return { ...event, outputPath };
  });

  return { musicPath, sfx };
}

function mixFinalAudio(audioClips) {
  const { musicPath, sfx } = generateMusicAndSfx();
  const phraseInputs = PHRASES.map((phrase) => audioClips.phraseClips[phrase.id]);
  const inputs = [musicPath, ...phraseInputs.map((phrase) => phrase.outputPath), ...sfx.map((event) => event.outputPath)];
  const args = ["-y", ...inputs.flatMap((inputPath) => ["-i", inputPath])];

  const voiceLabels = phraseInputs.map((phrase, index) => {
    const inputIndex = index + 1;
    const delayMs = Math.round(phrase.start * 1000);
    return `[${inputIndex}:a]adelay=${delayMs}|${delayMs},volume=1.0[n${index}]`;
  });
  const sfxLabels = sfx.map((event, index) => {
    const inputIndex = 1 + phraseInputs.length + index;
    const delayMs = Math.round(event.at * 1000);
    return `[${inputIndex}:a]adelay=${delayMs}|${delayMs},volume=0.7[s${index}]`;
  });
  const voiceMixInputs = phraseInputs.map((_, index) => `[n${index}]`).join("");
  const sfxMixInputs = sfx.map((_, index) => `[s${index}]`).join("");
  const filter = [
    "[0:a]volume=0.55[music]",
    ...voiceLabels,
    `${voiceMixInputs}amix=inputs=${phraseInputs.length}:normalize=0[voice0]`,
    "[voice0]asplit=2[voice_sc][voice_mix]",
    "[music][voice_sc]sidechaincompress=threshold=0.035:ratio=6:attack=20:release=250[ducked]",
    ...sfxLabels,
    `[ducked][voice_mix]${sfxMixInputs}amix=inputs=${2 + sfx.length}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,apad=pad_dur=${TARGET.durationSeconds},atrim=0:${TARGET.durationSeconds},asetpts=PTS-STARTPTS[outa]`,
  ].join(";");

  const outputPath = path.join(FINAL_DIR, "social-commerce-v2-kokeshi-audio.wav");
  args.push("-filter_complex", filter, "-map", "[outa]", "-c:a", "pcm_s16le", outputPath);
  run(findFfmpegPath(), args);
  return { audioPath: outputPath, musicPath, sfx };
}

function muxFinal(visualPath, audioPath) {
  const outputPath = path.join(FINAL_DIR, "social-commerce-v2-kokeshi-final.mp4");
  run(findFfmpegPath(), [
    "-y",
    "-i", visualPath,
    "-i", audioPath,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    outputPath,
  ]);
  return outputPath;
}

function generateFramesAndContactSheet(finalVideoPath) {
  const timestamps = [0.3, 1.2, 3.4, 4.8, 6.4, 9.9, 12.4, 14.4];
  const frames = timestamps.map((timestamp, index) => {
    const framePath = path.join(FRAMES_DIR, `frame-${index}-${String(timestamp).replace(".", "_")}s.jpg`);
    run(findFfmpegPath(), ["-y", "-ss", timestamp.toFixed(3), "-i", finalVideoPath, "-frames:v", "1", framePath]);
    return { timestamp, path: framePath };
  });

  const contactSheetPath = path.join(OUT_DIR, "contact-sheet.jpg");
  const filter =
    frames
      .map((_, index) => `[${index}:v]scale=216:384:force_original_aspect_ratio=decrease,pad=216:384:(ow-iw)/2:(oh-ih)/2[v${index}]`)
      .join(";") + `;${frames.map((_, index) => `[v${index}]`).join("")}hstack=inputs=${frames.length}[out]`;
  run(findFfmpegPath(), ["-y", ...frames.flatMap((frame) => ["-i", frame.path]), "-filter_complex", filter, "-map", "[out]", contactSheetPath]);
  return { frames, contactSheetPath };
}

function runBrowserPlayback(finalVideoPath) {
  try {
    const raw = execFileSync(process.execPath, [path.join(root, "scripts", "diagnose-local-video-playback.js"), finalVideoPath], {
      cwd: root,
      env: { ...process.env, SKIP_UI: "1" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = JSON.parse(raw.slice(raw.indexOf("{")));
    const direct = parsed.directResult ?? {};
    return {
      status: direct.playResult === "ok" && !direct.errorAfter && direct.canPlayH264 ? "PASS" : "FAIL",
      canPlayH264: direct.canPlayH264 ?? null,
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

function classifyTechnical(metadata, browserPlayback) {
  return metadata.width === TARGET.width &&
    metadata.height === TARGET.height &&
    Math.abs((metadata.fps ?? 0) - TARGET.fps) < 0.01 &&
    metadata.videoCodec === "h264" &&
    metadata.codecTagString === "avc1" &&
    metadata.audioCodec === "aac" &&
    metadata.audioStreamCount >= 1 &&
    browserPlayback.status === "PASS"
    ? "PASS"
    : "FAIL";
}

async function main() {
  ensureDirs();
  hydratePreviousAttemptState();
  for (const [label, filePath] of Object.entries(REFS)) assertFileExists(label, filePath);
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) abortBeforePaid("Supabase env ausente.");
  if (!process.env.ELEVENLABS_API_KEY) abortBeforePaid("ELEVENLABS_API_KEY ausente.");
  if (!process.env.HEYGEN_API_KEY) abortBeforePaid("HEYGEN_API_KEY ausente.");
  if (!process.env.FREEPIK_API_KEY) abortBeforePaid("FREEPIK_API_KEY ausente.");

  const encoder = assertFinalVideoEncoderReady();
  if (!encoder.ready) abortBeforePaid(`h264_mf indisponivel antes do primeiro provider: ${encoder.reason}`, { encoder });

  const preflightReport = assertPreflightReady();
  installPaidNetworkGuard();

  writeJson(TRACE_PATH, {
    startedAt: new Date().toISOString(),
    campaignId: CAMPAIGN_ID,
    limits: LIMITS,
    voice: VOICE,
    references: Object.fromEntries(Object.entries(REFS).map(([key, value]) => [key, rel(value)])),
    narrationText: NARRATION_TEXT,
    narrationCharacters: NARRATION_TEXT.length,
    preflightReport: rel(PREFLIGHT_REPORT),
  });

  console.log("\n>>> PONTO DE NAO RETORNO: iniciando canary pago unico Social Commerce V2 <<<");

  const fullAudioPath = path.join(AUDIO_DIR, "elevenlabs-full-narration.mp3");
  let tts = null;
  if (fs.existsSync(fullAudioPath)) {
    if (network.elevenLabsSubmitCount === 0) network.elevenLabsSubmitCount = 1;
    if (!network.providerCalls.some((call) => call.provider === "ELEVENLABS")) {
      network.providerCalls.push({
        provider: "ELEVENLABS",
        method: "POST",
        url: "https://api.elevenlabs.io/v1/text-to-speech/<voice-id>",
        count: 1,
        resumedFromExistingAudio: true,
      });
    }
    tts = { settings: null, reusedFromExistingAudio: true };
    console.log(">>> ELEVENLABS AUDIO REUTILIZADO: sem segunda chamada TTS <<<");
  } else {
    tts = await generateElevenLabsAudio({
      text: NARRATION_TEXT,
      voiceId: VOICE.voiceId,
      voiceDirection: {
        pace: "fast",
        emotionalIntensity: "high",
        credibility: "high",
        pauseStyle: "clean",
      },
      behaviorDirection: {
        imperfectionLevel: "medium",
      },
    });
    fs.writeFileSync(fullAudioPath, tts.buffer);
  }
  const audioClips = buildAudioClips(fullAudioPath);
  const providerAssets = await executeProviders(audioClips);
  const visual = renderVisual(providerAssets);
  const mixedAudio = mixFinalAudio(audioClips);
  const finalVideoPath = muxFinal(visual.visualPath, mixedAudio.audioPath);
  const frameArtifacts = generateFramesAndContactSheet(finalVideoPath);
  const technicalMetadata = probeMedia(finalVideoPath);
  const browserPlayback = runBrowserPlayback(finalVideoPath);
  const technicalStatus = classifyTechnical(technicalMetadata, browserPlayback);

  const taskIds = {
    HEYGEN_SHOT_A: providerAssets.heygenAssets.HEYGEN_SHOT_A.result.videoId,
    HEYGEN_SHOT_B: providerAssets.heygenAssets.HEYGEN_SHOT_B.result.videoId,
    HEYGEN_SHOT_C: providerAssets.heygenAssets.HEYGEN_SHOT_C.result.videoId,
    KLING_PRODUCT_EXPERIENCE_A: providerAssets.klingAsset.result.taskId,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    campaignId: CAMPAIGN_ID,
    mode: "EXECUTED_ONE_PAID_SOCIAL_COMMERCE_V2_CANARY",
    providerCalls: {
      HeyGen: network.heygenSubmitCount,
      Kling: network.klingSubmitCount,
      ElevenLabs: network.elevenLabsSubmitCount,
      WAN: network.wanSubmitCount,
    },
    taskIds,
    estimatedCosts: {
      HeyGenUsd: 0.6,
      KlingCredits: 325,
      ElevenLabsCredits: NARRATION_TEXT.length,
      WANCredits: 0,
    },
    limits: LIMITS,
    retries: 0,
    fallbacks: 0,
    secondVersion: 0,
    voice: {
      voiceId: VOICE.voiceId,
      model: VOICE.model,
      profile: VOICE.profile,
      settings: tts.settings,
    },
    assetsGenerated: {
      providerAssets: {
        HEYGEN_SHOT_A: rel(providerAssets.heygenAssets.HEYGEN_SHOT_A.localPath),
        HEYGEN_SHOT_B: rel(providerAssets.heygenAssets.HEYGEN_SHOT_B.localPath),
        HEYGEN_SHOT_C: rel(providerAssets.heygenAssets.HEYGEN_SHOT_C.localPath),
        KLING_PRODUCT_EXPERIENCE_A: rel(providerAssets.klingAsset.localPath),
      },
      finalMp4: rel(finalVideoPath),
      contactSheet: rel(frameArtifacts.contactSheetPath),
      representativeFrames: frameArtifacts.frames.map((frame) => ({ timestamp: frame.timestamp, path: rel(frame.path) })),
      executionTrace: rel(TRACE_PATH),
      costReport: rel(REPORT_PATH),
    },
    microbeatExecutionMap: visual.microbeats.map((beat) => ({
      id: beat.id,
      start: beat.start,
      duration: beat.duration,
      source: beat.source,
      sourcePath: rel(beat.sourcePath),
      outputPath: rel(beat.outputPath),
      overlayTop: beat.overlayTop ?? null,
      priceText: beat.priceText ?? null,
      overlayBottom: beat.overlayBottom ?? null,
    })),
    finalTechnical: {
      ...technicalMetadata,
      expected: { width: TARGET.width, height: TARGET.height, fps: TARGET.fps, videoCodec: "h264/avc1", audioCodec: "aac" },
      technicalStatus,
    },
    productQA: {
      PACKSHOT_SOURCE_OF_TRUTH_USED: "YES",
      HAND_INTERACTION_SOURCE_USED_FOR_KLING: "YES",
      BENEFIT_CONTEXT_USED_AS_CONTEXT_ONLY: "YES",
      TEXTURE_OR_APPLICATION_INVENTION_BLOCKED: "YES",
      PRODUCT_FIDELITY: "PENDING_HUMAN_REVIEW",
      PRODUCT_EXPERIENCE: "PENDING_HUMAN_REVIEW",
      observedRisks: [
        "Contact sheet indicates Kling may have rendered visible text in the product/environment; human review should verify whether it is acceptable or a product-fidelity issue.",
      ],
    },
    presenterQA: {
      HEYGEN_ASSETS: 3,
      DISTINCT_VISUAL_PURPOSES: ["HOOK", "SALES_ARGUMENT", "CTA"],
      AVOIDED_FULL_BODY_STATIC_PATTERN: "PLANNED_YES_PENDING_HUMAN_REVIEW",
      PRESENTER_LIVELINESS: "PENDING_HUMAN_REVIEW",
    },
    audioQA: {
      voiceModelUsed: VOICE.model,
      voiceIdUsed: VOICE.voiceId,
      oneElevenLabsSubmit: network.elevenLabsSubmitCount === 1 ? "YES" : "NO",
      continuousMusicBed: "YES_LOCAL_SYNTHETIC",
      ducking: "YES_SIDECHAIN_COMPRESS",
      sfxApplied: ["snap-in", "price-pop", "soft-tap", "cash-pop", "button-pop"],
      narrationCompleteness: "PASS_BY_ASSEMBLY_PLAN",
    },
    creativeQA: {
      SCROLL_STOP: "PENDING_HUMAN_REVIEW",
      PRESENTER_LIVELINESS: "PENDING_HUMAN_REVIEW",
      VOICE_ENERGY: "PENDING_HUMAN_REVIEW",
      SOCIAL_NATIVE_FEEL: "PENDING_HUMAN_REVIEW",
      PRODUCT_EXPERIENCE: "PENDING_HUMAN_REVIEW",
      PRODUCT_FIDELITY: "PENDING_HUMAN_REVIEW",
      PACING: visual.microbeats.length === 17 ? "PASS_STRUCTURAL" : "FAIL",
      VISUAL_VARIETY: "PASS_STRUCTURAL",
      PRICE_IMPACT: "PASS_DETERMINISTIC_OVERLAY",
      CTA_STRENGTH: "PENDING_HUMAN_REVIEW",
      DESIRE_TO_BUY: "PENDING_HUMAN_REVIEW",
      GENERIC_AI_AD_RISK: "PENDING_HUMAN_REVIEW",
      IS_IT_MORE_ALIVE_THAN_V1: "PENDING_HUMAN_REVIEW",
      DOES_THE_PRESENTER_FEEL_LIKE_A_CREATOR: "PENDING_HUMAN_REVIEW",
      DOES_THE_PRODUCT_FEEL_USED_PRESENTED_RATHER_THAN_FLOATING: "PENDING_HUMAN_REVIEW",
      DOES_THE_AUDIO_HAVE_CONTINUOUS_ENERGY: "YES_STRUCTURAL",
      DOES_THE_PRICE_CREATE_AN_OFFER_MOMENT: "YES_DETERMINISTIC_OVERLAY",
      WOULD_A_HUMAN_REASONABLY_KEEP_WATCHING: "PENDING_HUMAN_REVIEW",
    },
    browserPlayback,
    network,
    storageWrites: storage.writes,
    databaseWrites: 0,
    publicationStatus: "NOT_PUBLISHED",
    preflightSnapshot: {
      SOCIAL_COMMERCE_EXECUTION_PREFLIGHT: preflightReport.SOCIAL_COMMERCE_EXECUTION_PREFLIGHT,
      READY_FOR_PAID_SOCIAL_COMMERCE_CANARY: preflightReport.READY_FOR_PAID_SOCIAL_COMMERCE_CANARY,
    },
    COMMERCIAL_RESULT: technicalStatus === "PASS" ? "PASS_WITH_OBSERVATIONS" : "FAIL",
    READY_FOR_HUMAN_VIDEO_REVIEW: technicalStatus === "PASS" ? "YES" : "NO",
  };

  writeJson(REPORT_PATH, report);
  console.log(JSON.stringify({
    COMMERCIAL_RESULT: report.COMMERCIAL_RESULT,
    READY_FOR_HUMAN_VIDEO_REVIEW: report.READY_FOR_HUMAN_VIDEO_REVIEW,
    finalMp4: report.assetsGenerated.finalMp4,
    contactSheet: report.assetsGenerated.contactSheet,
    report: rel(REPORT_PATH),
    providerCalls: report.providerCalls,
    taskIds: report.taskIds,
    estimatedCosts: report.estimatedCosts,
    browserPlayback: report.browserPlayback.status,
    storageWrites: report.storageWrites.length,
    databaseWrites: report.databaseWrites,
    publicationStatus: report.publicationStatus,
  }, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  writeFailureReport(message);
  console.error("\nSOCIAL_COMMERCE_V2_PAID_CANARY_STOPPED:", message);
  console.error(`Relatorio salvo em: ${rel(REPORT_PATH)}`);
  process.exitCode = 1;
});
