// Radar Smart - Garota Radar Voice Model A/B for winner B.
//
// Generates two samples with the same voice, spoken text, output format and
// voice settings. The only experimental variable is model_id:
// eleven_multilingual_v2 vs eleven_v3.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

require("dotenv").config({ path: ".env.local" });

const root = path.resolve(__dirname, "..");
const OUT_DIR = path.join(root, "temp", "winner-b-model-ab");
const REPORT_JSON = path.join(OUT_DIR, "garota-radar-winner-b-model-ab-report.json");
const REPORT_MD = path.join(OUT_DIR, "garota-radar-winner-b-model-ab-report.md");

const VOICE_ID = "qUqXzKPs4b4NRdbYKPx7";
const VOICE_NAME = "Mulher 33 anos";
const AUDITION_TEXT = "Gente, olha o pre\u00e7o desse achado! S\u00f3 treze reais e dezesseis centavos.";
const OUTPUT_FORMAT = "mp3_44100_128";
const MAX_TTS_CALLS = 2;
const MAX_ESTIMATED_CREDITS = 140;

const MODELS = [
  {
    key: "MULTILINGUAL_V2",
    model: "eleven_multilingual_v2",
    outputFile: "winner-b-multilingual-v2.mp3",
  },
  {
    key: "ELEVEN_V3",
    model: "eleven_v3",
    outputFile: "winner-b-eleven-v3.mp3",
  },
];

const VOICE_SETTINGS = Object.freeze({
  stability: 0.45,
  similarity_boost: 0.85,
  style: 0.65,
  speed: 1,
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
    const isTts = isElevenLabs && method === "POST" && parsed.pathname.includes("/text-to-speech/");
    const isBlockedProvider =
      url.includes("api.freepik.com") ||
      url.includes("api.heygen.com") ||
      url.includes("klingai.com") ||
      url.includes("runwayml") ||
      url.includes("replicate") ||
      url.includes("api.magnific.com");

    if (isBlockedProvider) {
      network.blockedAttempts.push({ method, url: redactUrl(url), reason: "non_audio_provider_blocked" });
      throw new Error(`BLOQUEADO: provider fora do escopo do A/B de voz: ${redactUrl(url)}`);
    }

    if (isTts) {
      network.elevenLabsTtsCalls += 1;
      network.generationAttempts.push({ method, url: redactUrl(url), count: network.elevenLabsTtsCalls });
      if (network.elevenLabsTtsCalls > MAX_TTS_CALLS) {
        throw new Error(`BLOQUEADO: ElevenLabs TTS excedeu ${MAX_TTS_CALLS} chamadas.`);
      }
      return realFetch(input, options);
    }

    if (isElevenLabs && ["GET", "HEAD"].includes(method)) {
      network.elevenLabsReadCalls += 1;
      return realFetch(input, options);
    }

    if (isElevenLabs) {
      network.blockedAttempts.push({ method, url: redactUrl(url), reason: "unexpected_elevenlabs_method" });
      throw new Error(`BLOQUEADO: metodo ElevenLabs inesperado: ${method}`);
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

function ensureApiKey() {
  const apiKey = String(process.env.ELEVENLABS_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY nao configurada.");
  return apiKey;
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

async function preflight(apiKey) {
  const multilingualV2Credits = AUDITION_TEXT.length;
  const elevenV3Credits = AUDITION_TEXT.length;
  const totalEstimatedCredits = multilingualV2Credits + elevenV3Credits;

  if (totalEstimatedCredits > MAX_ESTIMATED_CREDITS) {
    throw new Error(`ABORT: custo estimado ${totalEstimatedCredits} > limite ${MAX_ESTIMATED_CREDITS}.`);
  }

  const models = await fetchJson("https://api.elevenlabs.io/v1/models", apiKey);
  if (!models.ok) throw new Error(`ABORT: falha ao listar modelos ElevenLabs (${models.status}).`);
  const modelList = Array.isArray(models.data) ? models.data : Array.isArray(models.data?.models) ? models.data.models : [];
  const modelIds = modelList.map((model) => String(model.model_id ?? model.id ?? "")).filter(Boolean);
  for (const expected of MODELS.map((item) => item.model)) {
    if (!modelIds.includes(expected)) throw new Error(`ABORT: modelo indisponivel na conta/provider: ${expected}.`);
  }

  const voice = await fetchJson(`https://api.elevenlabs.io/v1/voices/${VOICE_ID}`, apiKey);
  if (!voice.ok) {
    throw new Error(`ABORT: voz ${VOICE_ID} nao acessivel: ElevenLabs ${voice.status} ${voice.error ?? ""}`.trim());
  }

  return {
    voiceAccessible: true,
    voiceStatus: voice.status,
    modelIds,
    MULTILINGUAL_V2_ESTIMATED_CREDITS: multilingualV2Credits,
    ELEVEN_V3_ESTIMATED_CREDITS: elevenV3Credits,
    TOTAL_ESTIMATED_CREDITS: totalEstimatedCredits,
    controlAudit: {
      elevenV3SupportsAudioTags: true,
      elevenV3AudioTagsUsed: false,
      reason:
        "Official ElevenLabs docs describe v3 audio tags, but this A/B keeps the raw text identical to isolate model_id only.",
      sameRawTextForBothModels: true,
    },
  };
}

async function synthesize(apiKey, item) {
  const outputPath = path.join(OUT_DIR, item.outputFile);
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=${OUTPUT_FORMAT}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: AUDITION_TEXT,
        model_id: item.model,
        voice_settings: VOICE_SETTINGS,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return {
      status: "FAILED",
      outputPath: null,
      bytes: 0,
      error: `ElevenLabs ${response.status}: ${errorText.slice(0, 500)}`.trim(),
    };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return {
    status: buffer.byteLength > 0 ? "COMPLETED" : "FAILED",
    outputPath,
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

function measureSilence(audioPath) {
  const ffmpeg = findBinary("ffmpeg");
  const thresholdDb = -35;
  const minimumSilenceSeconds = 0.15;
  const result = spawnSync(ffmpeg, [
    "-hide_banner",
    "-i",
    audioPath,
    "-af",
    `silencedetect=noise=${thresholdDb}dB:d=${minimumSilenceSeconds}`,
    "-f",
    "null",
    "-",
  ], { encoding: "utf8" });
  const raw = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  const durations = [...raw.matchAll(/silence_duration:\s*(\d+(\.\d+)?)/g)].map((match) => Number(match[1]));
  const silenceDuration = durations.reduce((sum, value) => sum + value, 0);
  return {
    thresholdDb,
    minimumSilenceSeconds,
    silenceDuration: Number(silenceDuration.toFixed(3)),
  };
}

function measureAudio(audioPath) {
  const duration = probeDuration(audioPath);
  const silence = measureSilence(audioPath);
  const speechActivity = duration && duration > 0
    ? Number(Math.max(0, Math.min(1, (duration - silence.silenceDuration) / duration)).toFixed(3))
    : null;
  return {
    duration,
    peak: measurePeak(audioPath),
    integratedLoudness: measureIntegratedLoudness(audioPath),
    silenceDuration: silence.silenceDuration,
    speechActivity,
    silenceDetection: {
      thresholdDb: silence.thresholdDb,
      minimumSilenceSeconds: silence.minimumSilenceSeconds,
    },
  };
}

function writeReports(report) {
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");
  const lines = [
    "# Garota Radar Winner B Model A/B",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    `VOICE_ID=${report.VOICE_ID}`,
    "",
    "| version | model | duration | credits | peak | loudness | speechActivity | silenceDuration | status | audioPath |",
    "|---|---|---:|---:|---:|---:|---:|---:|---|---|",
  ];
  for (const result of report.results) {
    lines.push(
      `| ${result.key} | ${result.model} | ${result.duration ?? "null"} | ${result.credits} | ${result.peak ?? "null"} | ${result.loudness ?? "null"} | ${result.speechActivity ?? "null"} | ${result.silenceDuration ?? "null"} | ${result.status} | ${result.audioPath ?? "null"} |`,
    );
  }
  lines.push(
    "",
    `MULTILINGUAL_V2_ESTIMATED_CREDITS=${report.MULTILINGUAL_V2.credits}`,
    `ELEVEN_V3_ESTIMATED_CREDITS=${report.ELEVEN_V3.credits}`,
    `TOTAL_CREDITS=${report.TOTAL_CREDITS}`,
    "Kling calls=0",
    "HeyGen calls=0",
    "WAN calls=0",
    `READY_FOR_HUMAN_MODEL_AUDITION=${report.READY_FOR_HUMAN_MODEL_AUDITION}`,
  );
  fs.writeFileSync(REPORT_MD, lines.join("\n"), "utf8");
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  installProviderGuard();

  const apiKey = ensureApiKey();
  const preflightResult = await preflight(apiKey);
  const results = [];

  for (const item of MODELS) {
    const startedAt = new Date().toISOString();
    const generation = await synthesize(apiKey, item);
    const completedAt = new Date().toISOString();
    const metrics = generation.status === "COMPLETED" && generation.outputPath
      ? measureAudio(generation.outputPath)
      : {
          duration: null,
          peak: null,
          integratedLoudness: null,
          silenceDuration: null,
          speechActivity: null,
          silenceDetection: null,
        };

    results.push({
      key: item.key,
      name: VOICE_NAME,
      voiceId: VOICE_ID,
      model: item.model,
      text: AUDITION_TEXT,
      outputFormat: OUTPUT_FORMAT,
      settings: {
        stability: VOICE_SETTINGS.stability,
        similarityBoost: VOICE_SETTINGS.similarity_boost,
        style: VOICE_SETTINGS.style,
        speed: VOICE_SETTINGS.speed,
        speakerBoost: VOICE_SETTINGS.use_speaker_boost,
      },
      duration: metrics.duration,
      peak: metrics.peak,
      loudness: metrics.integratedLoudness,
      speechActivity: metrics.speechActivity,
      silenceDuration: metrics.silenceDuration,
      silenceDetection: metrics.silenceDetection,
      credits: AUDITION_TEXT.length,
      status: generation.status,
      audioPath: generation.outputPath ? path.relative(root, generation.outputPath) : null,
      bytes: generation.bytes,
      error: generation.error,
      startedAt,
      completedAt,
    });

    if (generation.status !== "COMPLETED") break;
  }

  const multilingual = results.find((item) => item.key === "MULTILINGUAL_V2") ?? null;
  const v3 = results.find((item) => item.key === "ELEVEN_V3") ?? null;
  const ready = results.length === MODELS.length && results.every((item) => item.status === "COMPLETED");
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "GAROTA_RADAR_VOICE_MODEL_AB_WINNER_B",
    purpose: "Human model audition only; do not choose winner automatically.",
    VOICE_ID,
    VOICE_NAME,
    AUDITION_TEXT,
    outputFormat: OUTPUT_FORMAT,
    preflight: preflightResult,
    MULTILINGUAL_V2: multilingual,
    ELEVEN_V3: v3,
    results,
    MULTILINGUAL_V2_ESTIMATED_CREDITS: preflightResult.MULTILINGUAL_V2_ESTIMATED_CREDITS,
    ELEVEN_V3_ESTIMATED_CREDITS: preflightResult.ELEVEN_V3_ESTIMATED_CREDITS,
    TOTAL_ESTIMATED_CREDITS: preflightResult.TOTAL_ESTIMATED_CREDITS,
    TOTAL_CREDITS: results.reduce((sum, item) => sum + item.credits, 0),
    retries: 0,
    fallback: 0,
    secondTakes: 0,
    winnerSelected: false,
    officialVoiceUpdated: false,
    anaDiasUpdated: false,
    storyboardAltered: false,
    publicationPerformed: false,
    costSafety: {
      klingCalls: network.klingCalls,
      heyGenCalls: network.heyGenCalls,
      wanCalls: network.wanCalls,
      paidVideoGeneration: 0,
    },
    network,
    READY_FOR_HUMAN_MODEL_AUDITION: ready ? "YES" : "NO",
  };

  writeReports(report);

  console.log("VOICE_ID=" + VOICE_ID);
  console.log("MULTILINGUAL_V2=" + (multilingual?.audioPath ?? multilingual?.status ?? "MISSING"));
  console.log("ELEVEN_V3=" + (v3?.audioPath ?? v3?.status ?? "MISSING"));
  console.log("TOTAL_CREDITS=" + report.TOTAL_CREDITS);
  console.log("Kling calls=0");
  console.log("HeyGen calls=0");
  console.log("WAN calls=0");
  console.log("READY_FOR_HUMAN_MODEL_AUDITION=" + report.READY_FOR_HUMAN_MODEL_AUDITION);
  console.log("REPORT_JSON=" + path.relative(root, REPORT_JSON));
  console.log("REPORT_MD=" + path.relative(root, REPORT_MD));

  if (!ready) process.exitCode = 1;
}

main().catch((error) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "GAROTA_RADAR_VOICE_MODEL_AB_WINNER_B_FAILED",
    error: error instanceof Error ? error.message : String(error),
    VOICE_ID,
    TOTAL_CREDITS: 0,
    costSafety: {
      klingCalls: network.klingCalls,
      heyGenCalls: network.heyGenCalls,
      wanCalls: network.wanCalls,
      paidVideoGeneration: 0,
    },
    network,
    READY_FOR_HUMAN_MODEL_AUDITION: "NO",
    results: [],
    MULTILINGUAL_V2: null,
    ELEVEN_V3: null,
  };
  writeReports(report);
  console.error("[WINNER_B_MODEL_AB] Falhou:", report.error);
  process.exit(1);
});
