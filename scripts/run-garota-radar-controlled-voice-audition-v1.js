// Radar Smart - Garota Radar Controlled Voice Audition V1.
//
// Generates exactly one TTS sample per finalist using the same text, model,
// format and voice settings. No video providers, no retries, no fallbacks,
// no official voice update.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

require("dotenv").config({ path: ".env.local" });

const root = path.resolve(__dirname, "..");
const INPUT_REPORT = path.join(root, "temp", "voice-casting-finalists-v2", "garota-radar-voice-finalists-v2-report.json");
const OUT_DIR = path.join(root, "temp", "controlled-voice-audition-v1");
const REPORT_JSON = path.join(OUT_DIR, "garota-radar-controlled-voice-audition-v1-report.json");
const REPORT_MD = path.join(OUT_DIR, "garota-radar-controlled-voice-audition-v1-report.md");

const MODEL_ID = "eleven_multilingual_v2";
const OUTPUT_FORMAT = "mp3_44100_128";
const AUDITION_TEXT = "Gente, olha o pre\u00e7o desse achado! S\u00f3 treze reais e dezesseis centavos.";
const ELEVENLABS_CREDITS_MAX = 210;
const MAX_TTS_CALLS = 3;

const VOICE_SETTINGS = Object.freeze({
  stability: 0.45,
  similarity_boost: 0.85,
  style: 0.65,
  use_speaker_boost: true,
});

const network = {
  elevenLabsReadCalls: 0,
  elevenLabsTtsCalls: 0,
  generationAttempts: [],
  blockedAttempts: [],
  klingCalls: 0,
  heyGenCalls: 0,
  wanCalls: 0,
};

function installProviderGuard() {
  const realFetch = global.fetch;
  global.fetch = async (input, options = {}) => {
    const url = typeof input === "string" ? input : input?.url ? input.url : String(input);
    const method = String(options.method ?? "GET").toUpperCase();
    const parsed = new URL(url);
    const isElevenLabs = parsed.hostname === "api.elevenlabs.io";
    const isElevenLabsTts = isElevenLabs && method === "POST" && parsed.pathname.includes("/text-to-speech/");
    const isKnownVideoProvider =
      url.includes("api.freepik.com") ||
      url.includes("api.heygen.com") ||
      url.includes("klingai.com") ||
      url.includes("runwayml") ||
      url.includes("replicate") ||
      url.includes("api.magnific.com");

    if (isKnownVideoProvider) {
      network.blockedAttempts.push({ method, url: redactUrl(url), reason: "video_provider_blocked" });
      throw new Error(`BLOQUEADO: provider de video fora do escopo: ${redactUrl(url)}`);
    }

    if (isElevenLabsTts) {
      network.elevenLabsTtsCalls += 1;
      network.generationAttempts.push({ method, url: redactUrl(url), count: network.elevenLabsTtsCalls });
      if (network.elevenLabsTtsCalls > MAX_TTS_CALLS) {
        throw new Error(`BLOQUEADO: ElevenLabs TTS excedeu o teto de ${MAX_TTS_CALLS} chamadas.`);
      }
      return realFetch(input, options);
    }

    if (isElevenLabs && ["GET", "HEAD"].includes(method)) {
      network.elevenLabsReadCalls += 1;
      return realFetch(input, options);
    }

    if (isElevenLabs) {
      network.blockedAttempts.push({ method, url: redactUrl(url), reason: "unexpected_elevenlabs_method" });
      throw new Error(`BLOQUEADO: metodo ElevenLabs inesperado nesta audicao: ${method}`);
    }

    return realFetch(input, options);
  };
}

function redactUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace(/\/v1\/text-to-speech\/[^/?]+/, "/v1/text-to-speech/<voice-id>");
    parsed.pathname = parsed.pathname.replace(/\/v1\/voices\/[^/?]+/, "/v1/voices/<voice-id>");
    return parsed.toString();
  } catch {
    return url;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureApiKey() {
  const apiKey = String(process.env.ELEVENLABS_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY nao configurada.");
  return apiKey;
}

function getFinalists() {
  const report = readJson(INPUT_REPORT);
  const finalists = [report.FINALIST_A, report.FINALIST_B, report.FINALIST_C].filter(Boolean);
  if (finalists.length !== 3) throw new Error("Relatorio V2 nao contem exatamente 3 finalistas.");
  for (const finalist of finalists) {
    if (!finalist.voiceId) throw new Error(`Finalista ${finalist.label ?? "?"} sem voiceId.`);
  }
  return finalists;
}

async function fetchJson(url, apiKey) {
  const response = await fetch(url, { headers: { "xi-api-key": apiKey, Accept: "application/json" }, cache: "no-store" });
  const body = await response.text();
  let data = null;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    data = { raw: body };
  }
  return { ok: response.ok, status: response.status, data, error: response.ok ? null : body.slice(0, 500) };
}

async function preflight(apiKey, finalists) {
  const estimatedCredits = AUDITION_TEXT.length * finalists.length;
  if (estimatedCredits > ELEVENLABS_CREDITS_MAX) {
    throw new Error(`ABORT: custo estimado ${estimatedCredits} > limite ${ELEVENLABS_CREDITS_MAX}.`);
  }

  const models = await fetchJson("https://api.elevenlabs.io/v1/models", apiKey);
  if (!models.ok) throw new Error(`ABORT: falha ao listar modelos ElevenLabs (${models.status}).`);
  const modelList = Array.isArray(models.data) ? models.data : Array.isArray(models.data?.models) ? models.data.models : [];
  const modelIds = modelList.map((model) => String(model.model_id ?? model.id ?? "")).filter(Boolean);
  if (!modelIds.includes(MODEL_ID)) throw new Error(`ABORT: ${MODEL_ID} nao esta disponivel na conta/provider.`);

  const voiceChecks = [];
  for (const finalist of finalists) {
    const voice = await fetchJson(`https://api.elevenlabs.io/v1/voices/${finalist.voiceId}`, apiKey);
    voiceChecks.push({
      candidate: finalist.label,
      name: finalist.name,
      voiceId: finalist.voiceId,
      accessible: voice.ok,
      status: voice.status,
      explicitProviderError: voice.error,
    });
    if (!voice.ok) {
      throw new Error(`ABORT: voz ${finalist.label} (${finalist.voiceId}) nao acessivel: ElevenLabs ${voice.status} ${voice.error ?? ""}`.trim());
    }
  }

  return {
    modelAvailable: true,
    modelIds,
    voiceChecks,
    estimatedCredits,
  };
}

async function synthesize(apiKey, finalist, outputPath) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${finalist.voiceId}?output_format=${OUTPUT_FORMAT}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: AUDITION_TEXT,
        model_id: MODEL_ID,
        voice_settings: VOICE_SETTINGS,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return {
      status: "FAILED",
      audioPath: null,
      bytes: 0,
      error: `ElevenLabs ${response.status}: ${errorText.slice(0, 500)}`.trim(),
    };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return {
    status: buffer.byteLength > 0 ? "COMPLETED" : "FAILED",
    audioPath: outputPath,
    bytes: buffer.byteLength,
    error: buffer.byteLength > 0 ? null : "Provider retornou audio vazio.",
  };
}

function findBinary(name) {
  const envName = name === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH";
  if (process.env[envName] && fs.existsSync(process.env[envName])) return process.env[envName];

  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const localAppData = process.env.LOCALAPPDATA;
  const capcutAppsDir = localAppData ? path.join(localAppData, "CapCut", "Apps") : null;
  if (capcutAppsDir && fs.existsSync(capcutAppsDir)) {
    const candidates = fs
      .readdirSync(capcutAppsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(capcutAppsDir, entry.name, exe))
      .filter((candidate) => fs.existsSync(candidate))
      .sort()
      .reverse();
    if (candidates[0]) return candidates[0];
  }

  return name;
}

function probeDuration(audioPath) {
  const ffprobe = findBinary("ffprobe");
  const result = spawnSync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audioPath], {
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  const value = Number(String(result.stdout ?? "").trim());
  return Number.isFinite(value) ? Number(value.toFixed(3)) : null;
}

function measurePeak(audioPath) {
  const ffmpeg = findBinary("ffmpeg");
  const result = spawnSync(ffmpeg, ["-hide_banner", "-i", audioPath, "-af", "astats=metadata=0", "-f", "null", "-"], {
    encoding: "utf8",
  });
  const raw = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  const matches = [...raw.matchAll(/Peak level dB:\s*(-?\d+(\.\d+)?)/g)];
  if (matches.length === 0) return null;
  return Math.max(...matches.map((match) => Number(match[1])));
}

function measureIntegratedLoudness(audioPath) {
  const ffmpeg = findBinary("ffmpeg");
  const result = spawnSync(ffmpeg, [
    "-hide_banner",
    "-i",
    audioPath,
    "-af",
    "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json",
    "-f",
    "null",
    "-",
  ], { encoding: "utf8" });
  const raw = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  const match = raw.match(/"input_i"\s*:\s*"(-?\d+(\.\d+)?)"/);
  return match ? Number(match[1]) : null;
}

function measureAudio(audioPath) {
  return {
    duration: probeDuration(audioPath),
    peak: measurePeak(audioPath),
    integratedLoudness: measureIntegratedLoudness(audioPath),
  };
}

function outputName(label) {
  return `finalist-${String(label).toLowerCase()}.mp3`;
}

function writeReports(report) {
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");
  const header = "| candidate | name | voiceId | model | duration | credits | peak | loudness | generationStatus | audioPath |\n" +
    "|---|---|---|---|---:|---:|---:|---:|---|---|";
  const rows = report.results.map((item) =>
    [
      `| ${item.candidate}`,
      item.name,
      item.voiceId,
      item.model,
      item.duration ?? "null",
      item.credits,
      item.peak ?? "null",
      item.loudness ?? "null",
      item.generationStatus,
      item.audioPath ?? "null",
    ].join(" | ") + " |",
  );
  const md = [
    "# Garota Radar Controlled Voice Audition V1",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    header,
    ...rows,
    "",
    `TOTAL_CREDITS=${report.TOTAL_CREDITS}`,
    `Kling calls=${report.costSafety.klingCalls}`,
    `HeyGen calls=${report.costSafety.heyGenCalls}`,
    `WAN calls=${report.costSafety.wanCalls}`,
    `ElevenLabs TTS calls=${report.network.elevenLabsTtsCalls}`,
    `READY_FOR_HUMAN_VOICE_AUDITION=${report.READY_FOR_HUMAN_VOICE_AUDITION}`,
  ].join("\n");
  fs.writeFileSync(REPORT_MD, md, "utf8");
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  installProviderGuard();

  const apiKey = ensureApiKey();
  const finalists = getFinalists();
  const preflightResult = await preflight(apiKey, finalists);
  const results = [];

  for (const finalist of finalists) {
    const outputPath = path.join(OUT_DIR, outputName(finalist.label));
    const startedAt = new Date().toISOString();
    const generation = await synthesize(apiKey, finalist, outputPath);
    const completedAt = new Date().toISOString();
    const metrics = generation.status === "COMPLETED" && generation.audioPath ? measureAudio(generation.audioPath) : {
      duration: null,
      peak: null,
      integratedLoudness: null,
    };

    results.push({
      candidate: finalist.label,
      name: finalist.name,
      voiceId: finalist.voiceId,
      model: MODEL_ID,
      text: AUDITION_TEXT,
      credits: AUDITION_TEXT.length,
      duration: metrics.duration,
      peak: metrics.peak,
      loudness: metrics.integratedLoudness,
      generationStatus: generation.status,
      audioPath: generation.audioPath ? path.relative(root, generation.audioPath) : null,
      bytes: generation.bytes,
      error: generation.error,
      startedAt,
      completedAt,
    });

    if (generation.status !== "COMPLETED") break;
  }

  const allCompleted = results.length === finalists.length && results.every((item) => item.generationStatus === "COMPLETED");
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "GAROTA_RADAR_CONTROLLED_VOICE_AUDITION_V1",
    purpose: "Human-only voice selection; no automatic winner.",
    inputReport: path.relative(root, INPUT_REPORT),
    model: MODEL_ID,
    outputFormat: OUTPUT_FORMAT,
    text: AUDITION_TEXT,
    settings: {
      stability: VOICE_SETTINGS.stability,
      similarityBoost: VOICE_SETTINGS.similarity_boost,
      style: VOICE_SETTINGS.style,
      speed: null,
      speakerBoost: VOICE_SETTINGS.use_speaker_boost,
      outputFormat: OUTPUT_FORMAT,
    },
    preflight: preflightResult,
    results,
    TOTAL_CREDITS: results.reduce((sum, item) => sum + item.credits, 0),
    maxCredits: ELEVENLABS_CREDITS_MAX,
    retries: 0,
    fallbacks: 0,
    secondTakes: 0,
    winnerSelected: false,
    officialVoiceUpdated: false,
    storyboardAltered: false,
    publicationPerformed: false,
    costSafety: {
      klingCalls: network.klingCalls,
      heyGenCalls: network.heyGenCalls,
      wanCalls: network.wanCalls,
      paidVideoGeneration: 0,
    },
    network,
    READY_FOR_HUMAN_VOICE_AUDITION: allCompleted ? "YES" : "NO",
  };

  writeReports(report);
  console.log("TOTAL_CREDITS=" + report.TOTAL_CREDITS);
  console.log("ElevenLabs TTS calls=" + network.elevenLabsTtsCalls);
  console.log("Kling calls=0");
  console.log("HeyGen calls=0");
  console.log("WAN calls=0");
  console.log("READY_FOR_HUMAN_VOICE_AUDITION=" + report.READY_FOR_HUMAN_VOICE_AUDITION);
  console.log("REPORT_JSON=" + path.relative(root, REPORT_JSON));
  console.log("REPORT_MD=" + path.relative(root, REPORT_MD));
  for (const item of report.results) {
    console.log(`${item.candidate}=${item.audioPath ?? item.generationStatus}`);
  }

  if (!allCompleted) process.exitCode = 1;
}

main().catch((error) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "GAROTA_RADAR_CONTROLLED_VOICE_AUDITION_V1_FAILED",
    error: error instanceof Error ? error.message : String(error),
    network,
    TOTAL_CREDITS: 0,
    costSafety: {
      klingCalls: network.klingCalls,
      heyGenCalls: network.heyGenCalls,
      wanCalls: network.wanCalls,
      paidVideoGeneration: 0,
    },
    READY_FOR_HUMAN_VOICE_AUDITION: "NO",
  };
  writeReports({ ...report, results: [] });
  console.error("[CONTROLLED_VOICE_AUDITION_V1] Falhou:", report.error);
  process.exit(1);
});
