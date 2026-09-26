// Radar Smart - Garota Radar Voice Casting Real V1.
//
// Escopo deliberado: busca real e somente leitura no ElevenLabs Voice Library,
// sem TTS, sem video, sem writes remotos e sem alteracao do storyboard.

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

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

const { GAROTA_RADAR_VOICE_PROFILE } = require("../lib/commercial-video/audio/garota-radar-voice-profile.ts");
const { estimateVoiceCanaryCredits } = require("../lib/commercial-video/audio/voice-canary-guardrails.ts");

const OUT_DIR = path.join(root, "temp", "voice-casting-real-v1");
const REPORT_JSON = path.join(OUT_DIR, "garota-radar-voice-casting-report.json");
const REPORT_MD = path.join(OUT_DIR, "garota-radar-voice-casting-report.md");

const AUDITION_TEXT = "Gente, olha o pre\u00e7o desse achado! S\u00f3 treze reais e dezesseis centavos.";
const TARGET_PROFILE = {
  profileId: "ENERGETIC_CREATOR",
  languagePreference: "Brazilian Portuguese",
  gender: "female",
  age: "young adult / adult young",
  desiredQualities: [
    "energetic",
    "bright",
    "friendly",
    "enthusiastic",
    "conversational",
    "confident",
    "warm",
    "natural",
    "creator",
    "social media",
    "commercial",
  ],
};

const SEARCH_ATTEMPTS = [
  {
    label: "pt female social media",
    params: {
      page_size: "10",
      voice_type: "community",
      gender: "female",
      language: "pt",
      use_cases: "social_media",
      search: "Brazilian Portuguese female energetic social media creator",
    },
  },
  {
    label: "pt-br creator",
    params: {
      page_size: "10",
      voice_type: "community",
      search: "Portuguese Brazil female friendly enthusiastic commercial creator",
    },
  },
  {
    label: "pt-br ad voice",
    params: {
      page_size: "10",
      voice_type: "community",
      gender: "female",
      language: "pt",
      use_cases: "advertisement",
      search: "Brazilian Portuguese female advertisement commercial energetic",
    },
  },
  {
    label: "pt-br conversational deal",
    params: {
      page_size: "10",
      voice_type: "community",
      gender: "female",
      language: "pt",
      use_cases: "conversational",
      search: "Brazilian Portuguese woman friendly deal discovery conversational",
    },
  },
  {
    label: "fallback female broad",
    params: {
      page_size: "10",
      gender: "female",
      search: "female energetic social media commercial warm conversational",
    },
  },
  {
    label: "endpoint minimal",
    params: {
      page_size: "10",
    },
  },
];

const network = {
  elevenLabsReadCalls: [],
  providerGenerationCalls: 0,
  providerGenerationAttempts: [],
  remoteWriteAttempts: 0,
};

function installReadOnlyNetworkGuard() {
  const realFetch = global.fetch;
  global.fetch = async (input, options = {}) => {
    const url = typeof input === "string" ? input : input?.url ? input.url : String(input);
    const method = String(options.method ?? "GET").toUpperCase();
    const parsed = new URL(url);
    const isElevenLabs = parsed.hostname === "api.elevenlabs.io";
    const isTtsGeneration = isElevenLabs && parsed.pathname.includes("/text-to-speech/");
    const isKnownGenerationProvider =
      url.includes("api.freepik.com") ||
      url.includes("cdn-magnific.freepik.com") ||
      url.includes("api.magnific.com") ||
      url.includes("api.heygen.com") ||
      url.includes("api.openai.com") ||
      url.includes("klingai.com") ||
      url.includes("runwayml") ||
      url.includes("replicate");

    if (isTtsGeneration || isKnownGenerationProvider) {
      network.providerGenerationCalls += 1;
      network.providerGenerationAttempts.push({ method, url: redactUrl(url) });
      throw new Error(`BLOQUEADO: tentativa de provider de geracao fora do escopo: ${redactUrl(url)}`);
    }

    if (!["GET", "HEAD"].includes(method)) {
      network.remoteWriteAttempts += 1;
      throw new Error(`BLOQUEADO: voice casting e somente leitura; metodo ${method} para ${redactUrl(url)}`);
    }

    if (isElevenLabs) {
      network.elevenLabsReadCalls.push({ method, url: redactUrl(url) });
    }

    return realFetch(input, options);
  };
}

function redactUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.includes("/voices/")) {
      parsed.pathname = parsed.pathname.replace(/\/voices\/[^/?]+/, "/voices/<voice-id>");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function ensureEnv() {
  const apiKey = String(process.env.ELEVENLABS_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY nao configurada; impossivel fazer busca real no ElevenLabs.");
  }
  return apiKey;
}

function elevenHeaders(apiKey) {
  return { "xi-api-key": apiKey, Accept: "application/json" };
}

function buildUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim()) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function fetchJson(url, apiKey) {
  const response = await fetch(url, { headers: elevenHeaders(apiKey), cache: "no-store" });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    data,
    errorText: response.ok ? null : text.slice(0, 500),
  };
}

async function searchVoiceLibrary(apiKey) {
  const attempts = [];
  const found = [];
  const seen = new Set();

  for (const attempt of SEARCH_ATTEMPTS) {
    const url = buildUrl("https://api.elevenlabs.io/v2/voices", attempt.params);
    const result = await fetchJson(url, apiKey);
    attempts.push({
      label: attempt.label,
      status: result.status,
      ok: result.ok,
      url: redactUrl(url),
      error: result.ok ? null : result.errorText,
    });

    if (!result.ok) {
      continue;
    }

    const voices = Array.isArray(result.data?.voices) ? result.data.voices : [];
    for (const voice of voices) {
      const voiceId = String(voice?.voice_id ?? "").trim();
      if (!voiceId || seen.has(voiceId)) continue;
      seen.add(voiceId);
      found.push(voice);
      if (found.length >= 10) break;
    }

  }

  return {
    available: attempts.some((attempt) => attempt.ok),
    attempts,
    voices: found,
  };
}

async function getCurrentVoice(apiKey) {
  const voiceId = GAROTA_RADAR_VOICE_PROFILE.voiceId;
  const url = `https://api.elevenlabs.io/v1/voices/${voiceId}`;
  const result = await fetchJson(url, apiKey);
  return {
    ok: result.ok,
    status: result.status,
    source: redactUrl(url),
    data: result.ok ? result.data : null,
    error: result.ok ? null : result.errorText,
  };
}

async function listModels(apiKey) {
  const url = "https://api.elevenlabs.io/v1/models";
  const result = await fetchJson(url, apiKey);
  const models = Array.isArray(result.data) ? result.data : Array.isArray(result.data?.models) ? result.data.models : [];
  return {
    ok: result.ok,
    status: result.status,
    source: url,
    models,
    error: result.ok ? null : result.errorText,
  };
}

function labelsToRecord(labels) {
  if (!labels || typeof labels !== "object") return {};
  return labels;
}

function uniqueCompact(values) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function getNestedText(voice) {
  const labels = labelsToRecord(voice.labels);
  const sharing = voice.sharing && typeof voice.sharing === "object" ? voice.sharing : {};
  const verifiedLanguages = Array.isArray(voice.verified_languages) ? voice.verified_languages : [];
  const parts = [
    voice.name,
    voice.description,
    voice.category,
    voice.accent,
    sharing.description,
    sharing.use_case,
    sharing.accent,
    labels.description,
    labels.language,
    labels.gender,
    labels.age,
    labels.accent,
    labels.use_case,
    labels.usecase,
    labels.locale,
    ...Object.values(labels),
    ...verifiedLanguages.flatMap((language) => [
      language.language,
      language.locale,
      language.accent,
      language.model_id,
    ]),
  ];
  return parts.map((part) => String(part ?? "")).join(" ").toLowerCase();
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function scoreDimension(text, positives, negatives, base = 55) {
  let score = base;
  for (const item of positives) {
    if (text.includes(item.word)) score += item.weight;
  }
  for (const item of negatives) {
    if (text.includes(item.word)) score -= item.weight;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreVoice(voice) {
  const text = getNestedText(voice);
  const isPtBr =
    includesAny(text, ["brazil", "brasil", "brasile", "pt-br", "portuguese", "portugues", "português"]) ||
    (Array.isArray(voice.verified_languages) &&
      voice.verified_languages.some((language) => {
        const raw = `${language.language ?? ""} ${language.locale ?? ""}`.toLowerCase();
        return raw.includes("pt") || raw.includes("portuguese") || raw.includes("brazil");
      }));
  const isFemale = includesAny(text, ["female", "woman", "mulher", "feminina", "feminine"]);

  const ENERGY = scoreDimension(
    text,
    [
      { word: "energetic", weight: 18 },
      { word: "excited", weight: 14 },
      { word: "enthusiastic", weight: 14 },
      { word: "upbeat", weight: 12 },
      { word: "dynamic", weight: 10 },
      { word: "bright", weight: 8 },
      { word: "commercial", weight: 6 },
      { word: "social", weight: 6 },
    ],
    [
      { word: "calm", weight: 14 },
      { word: "soft", weight: 10 },
      { word: "meditation", weight: 18 },
      { word: "sleep", weight: 18 },
      { word: "audiobook", weight: 10 },
    ],
  );

  const BRIGHTNESS = scoreDimension(
    text,
    [
      { word: "bright", weight: 18 },
      { word: "cheerful", weight: 14 },
      { word: "upbeat", weight: 12 },
      { word: "friendly", weight: 10 },
      { word: "young", weight: 8 },
      { word: "smiling", weight: 8 },
    ],
    [
      { word: "dark", weight: 16 },
      { word: "serious", weight: 8 },
      { word: "deep", weight: 7 },
    ],
  );

  const WARMTH = scoreDimension(
    text,
    [
      { word: "warm", weight: 18 },
      { word: "friendly", weight: 16 },
      { word: "kind", weight: 9 },
      { word: "natural", weight: 8 },
      { word: "conversational", weight: 8 },
    ],
    [
      { word: "cold", weight: 14 },
      { word: "formal", weight: 8 },
      { word: "robotic", weight: 18 },
    ],
  );

  const ENTHUSIASM = scoreDimension(
    text,
    [
      { word: "enthusiastic", weight: 18 },
      { word: "excited", weight: 16 },
      { word: "energetic", weight: 14 },
      { word: "expressive", weight: 10 },
      { word: "advertisement", weight: 7 },
      { word: "commercial", weight: 7 },
    ],
    [
      { word: "monotone", weight: 20 },
      { word: "calm", weight: 12 },
      { word: "sleep", weight: 18 },
    ],
  );

  const CONVERSATIONAL_FEEL = scoreDimension(
    text,
    [
      { word: "conversational", weight: 20 },
      { word: "natural", weight: 16 },
      { word: "casual", weight: 12 },
      { word: "friendly", weight: 8 },
      { word: "creator", weight: 8 },
      { word: "social", weight: 6 },
    ],
    [
      { word: "documentary", weight: 9 },
      { word: "news", weight: 10 },
      { word: "announcer", weight: 7 },
      { word: "corporate", weight: 7 },
    ],
  );

  const SOCIAL_MEDIA_FIT = scoreDimension(
    text,
    [
      { word: "social media", weight: 22 },
      { word: "creator", weight: 16 },
      { word: "influencer", weight: 14 },
      { word: "tiktok", weight: 14 },
      { word: "youtube", weight: 10 },
      { word: "commercial", weight: 8 },
      { word: "advertisement", weight: 8 },
    ],
    [
      { word: "audiobook", weight: 12 },
      { word: "narration", weight: 5 },
      { word: "meditation", weight: 14 },
    ],
  );

  const SALES_APPEAL = scoreDimension(
    text,
    [
      { word: "commercial", weight: 18 },
      { word: "advertisement", weight: 16 },
      { word: "sales", weight: 14 },
      { word: "promo", weight: 12 },
      { word: "confident", weight: 12 },
      { word: "persuasive", weight: 10 },
      { word: "energetic", weight: 6 },
    ],
    [
      { word: "sleep", weight: 16 },
      { word: "meditation", weight: 14 },
      { word: "audiobook", weight: 8 },
    ],
  );

  const NATURALNESS = scoreDimension(
    text,
    [
      { word: "natural", weight: 20 },
      { word: "realistic", weight: 14 },
      { word: "conversational", weight: 10 },
      { word: "warm", weight: 8 },
      { word: "friendly", weight: 8 },
      { word: "human", weight: 8 },
    ],
    [
      { word: "robotic", weight: 22 },
      { word: "synthetic", weight: 8 },
    ],
  );

  let RADAR_SMART_FIT = Math.round(
    ENERGY * 0.17 +
      BRIGHTNESS * 0.12 +
      WARMTH * 0.13 +
      ENTHUSIASM * 0.14 +
      CONVERSATIONAL_FEEL * 0.14 +
      SOCIAL_MEDIA_FIT * 0.14 +
      SALES_APPEAL * 0.1 +
      NATURALNESS * 0.06,
  );
  if (isPtBr) RADAR_SMART_FIT += 8;
  if (isFemale) RADAR_SMART_FIT += 4;
  RADAR_SMART_FIT = Math.max(0, Math.min(100, RADAR_SMART_FIT));

  return {
    ENERGY,
    BRIGHTNESS,
    WARMTH,
    ENTHUSIASM,
    CONVERSATIONAL_FEEL,
    SOCIAL_MEDIA_FIT,
    SALES_APPEAL,
    NATURALNESS,
    RADAR_SMART_FIT,
  };
}

function firstKnown(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return null;
}

function inferGender(voice, labels) {
  const explicit = firstKnown(labels.gender, voice.gender);
  if (explicit) return explicit;
  const text = getNestedText(voice);
  if (includesAny(text, ["female", "woman", "mulher", "feminina", "feminine"])) return "female";
  if (includesAny(text, ["male", "man", "homem", "masculina", "masculine"])) return "male";
  return null;
}

function inferAge(voice, labels) {
  const explicit = firstKnown(labels.age, voice.age);
  if (explicit) return explicit;
  const text = getNestedText(voice);
  if (includesAny(text, ["young adult", "young", "adult young"])) return "young";
  if (includesAny(text, ["28", "29", "30", "31", "32", "33"])) return "adult_young";
  if (includesAny(text, ["50s", "50 years", "early 50"])) return "middle_aged";
  if (includesAny(text, ["80", "elderly", "senior"])) return "senior";
  return null;
}

function normalizeCandidate(voice, models) {
  const labels = labelsToRecord(voice.labels);
  const sharing = voice.sharing && typeof voice.sharing === "object" ? voice.sharing : {};
  const verifiedLanguages = Array.isArray(voice.verified_languages) ? voice.verified_languages : [];
  const modelIds = uniqueCompact([
    ...(Array.isArray(voice.high_quality_base_model_ids) ? voice.high_quality_base_model_ids : []),
    ...verifiedLanguages.map((language) => language.model_id),
  ]);
  const scores = scoreVoice(voice);
  const language = firstKnown(labels.language, verifiedLanguages[0]?.language, voice.language);
  const locale = firstKnown(labels.locale, verifiedLanguages[0]?.locale);
  const accent = firstKnown(labels.accent, voice.accent, sharing.accent, verifiedLanguages[0]?.accent);
  const useCase = firstKnown(labels.use_case, labels.usecase, sharing.use_case, voice.use_case, voice.category);

  return {
    name: firstKnown(voice.name),
    voiceId: firstKnown(voice.voice_id),
    language,
    locale,
    accent,
    gender: inferGender(voice, labels),
    age: inferAge(voice, labels),
    description: firstKnown(voice.description, labels.description, sharing.description),
    useCase,
    labels: Object.keys(labels).length > 0 ? labels : null,
    modelCompatibility: describeModelCompatibility(modelIds, models),
    previewUrl: firstKnown(voice.preview_url, voice.previewUrl),
    source: "ElevenLabs GET /v2/voices",
    scores,
    rawModelIds: modelIds,
  };
}

function describeModelCompatibility(modelIds, models) {
  const availableModelIds = new Set(models.map((model) => String(model.model_id ?? model.modelId ?? model.id ?? "")));
  const configured = GAROTA_RADAR_VOICE_PROFILE.model;
  const supportsConfigured =
    modelIds.length === 0
      ? null
      : modelIds.includes(configured) || modelIds.some((modelId) => modelId.toLowerCase().includes(configured.toLowerCase()));
  return {
    configuredModel: configured,
    candidateModelIds: modelIds.length > 0 ? modelIds : null,
    configuredModelListedByProvider: availableModelIds.has(configured),
    supportsConfiguredModel: supportsConfigured,
  };
}

function selectFinalists(candidates) {
  const isPreferredFemale = (candidate) => String(candidate.gender ?? "").toLowerCase().includes("female");
  const byFit = [...candidates]
    .filter(isPreferredFemale)
    .sort((a, b) => b.scores.RADAR_SMART_FIT - a.scores.RADAR_SMART_FIT);
  const fallbackByFit = [...candidates].sort((a, b) => b.scores.RADAR_SMART_FIT - a.scores.RADAR_SMART_FIT);
  const picked = [];
  const pick = (label, reason, sorter) => {
    const preferred = [...byFit].filter((item) => !picked.some((existing) => existing.voiceId === item.voiceId)).sort(sorter)[0];
    const fallback = [...fallbackByFit].filter((item) => !picked.some((existing) => existing.voiceId === item.voiceId)).sort(sorter)[0];
    const candidate = preferred ?? fallback;
    if (candidate) picked.push({ label, reason, ...candidate });
  };

  pick("A", "Mais energetica/criadora", (a, b) =>
    b.scores.ENERGY + b.scores.SOCIAL_MEDIA_FIT + b.scores.ENTHUSIASM -
    (a.scores.ENERGY + a.scores.SOCIAL_MEDIA_FIT + a.scores.ENTHUSIASM),
  );
  pick("B", "Mais natural/amiga mostrando achado", (a, b) =>
    b.scores.NATURALNESS + b.scores.CONVERSATIONAL_FEEL + b.scores.WARMTH -
    (a.scores.NATURALNESS + a.scores.CONVERSATIONAL_FEEL + a.scores.WARMTH),
  );
  pick("C", "Mais comercial/vendedora moderna dentro da preferencia feminina", (a, b) =>
    b.scores.SALES_APPEAL + b.scores.BRIGHTNESS + b.scores.ENERGY -
    (a.scores.SALES_APPEAL + a.scores.BRIGHTNESS + a.scores.ENERGY),
  );

  return picked.slice(0, 3);
}

function currentVoiceComparison(currentVoiceApiData) {
  const currentApiLabels = labelsToRecord(currentVoiceApiData?.labels);
  return {
    status: "CURRENT_VOICE",
    humanReview: "LOW_ENERGY_FOR_SOCIAL_COMMERCE",
    voiceId: GAROTA_RADAR_VOICE_PROFILE.voiceId,
    voiceName: GAROTA_RADAR_VOICE_PROFILE.voiceName,
    model: GAROTA_RADAR_VOICE_PROFILE.model,
    approvedAt: GAROTA_RADAR_VOICE_PROFILE.approvedAt,
    currentPreviewUrl: currentVoiceApiData?.preview_url ?? null,
    currentApiLabels: Object.keys(currentApiLabels).length > 0 ? currentApiLabels : null,
    keepVoiceInRegistry: true,
    decision: "Nao remover. Manter como voz oficial atual ate avaliacao humana aprovar substituta.",
    gapForSocialCommerceV2:
      "Avaliacao humana observou energia baixa para cenas de descoberta/oferta; buscar voz com mais brilho e entusiasmo perceptivel.",
  };
}

function modelRecommendation(models, finalists) {
  const modelIds = new Set(models.map((model) => String(model.model_id ?? model.modelId ?? model.id ?? "")));
  const finalistsSupportConfigured = finalists.every(
    (candidate) => candidate.modelCompatibility.supportsConfiguredModel !== false,
  );
  const hasV3 = Array.from(modelIds).some((modelId) => modelId === "eleven_v3" || modelId.includes("v3"));

  return {
    currentPipelineModel: GAROTA_RADAR_VOICE_PROFILE.model,
    expressiveModelRecommendation:
      finalistsSupportConfigured
        ? "Usar eleven_multilingual_v2 na audicao por ser o modelo ja aprovado no pipeline e adequado para PT-BR; nao migrar modelo sem canary separado."
        : "Validar compatibilidade do finalista antes da audicao; nao sintetizar com modelo diferente sem canary separado.",
    elevenV3SeenInModelList: hasV3,
    noTtsGenerated: true,
  };
}

function markdownTable(candidates) {
  const header =
    "| # | Name | Voice ID | Lang | Accent | Gender | Age | Use case | Radar fit | Preview |\n" +
    "|---:|---|---|---|---|---|---|---|---:|---|";
  const rows = candidates.map((candidate, index) =>
    [
      `| ${index + 1}`,
      escapeCell(candidate.name),
      escapeCell(candidate.voiceId),
      escapeCell(candidate.language),
      escapeCell(candidate.accent),
      escapeCell(candidate.gender),
      escapeCell(candidate.age),
      escapeCell(candidate.useCase),
      candidate.scores.RADAR_SMART_FIT,
      candidate.previewUrl ? `[preview](${candidate.previewUrl})` : "-",
    ].join(" | ") + " |",
  );
  return [header, ...rows].join("\n");
}

function escapeCell(value) {
  return String(value ?? "-").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function reportMarkdown(report) {
  const finalists = report.TOP_3_VOICE_FINALISTS.map(
    (candidate) =>
      `- ${candidate.label}: ${candidate.name} (${candidate.voiceId}) - ${candidate.reason}, fit ${candidate.scores.RADAR_SMART_FIT}/100, preview: ${candidate.previewUrl ?? "null"}`,
  ).join("\n");

  return [
    "# Garota Radar Voice Casting Real V1",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "## Status",
    "",
    `VOICE_LIBRARY_SEARCH_AVAILABLE=${report.VOICE_LIBRARY_SEARCH_AVAILABLE}`,
    `CANDIDATES_FOUND=${report.CANDIDATES_FOUND}`,
    `PROVIDER_GENERATION_CALLS=${report.PROVIDER_GENERATION_CALLS}`,
    `READY_FOR_HUMAN_VOICE_PREVIEW=${report.READY_FOR_HUMAN_VOICE_PREVIEW}`,
    "",
    "## Current Voice",
    "",
    `CURRENT_VOICE=${report.CURRENT_VOICE_COMPARISON.voiceName}`,
    `voiceId=${report.CURRENT_VOICE_COMPARISON.voiceId}`,
    `HUMAN_REVIEW=${report.CURRENT_VOICE_COMPARISON.humanReview}`,
    "",
    "## Candidates",
    "",
    report.candidates.length > 0 ? markdownTable(report.candidates) : "Nenhum candidato real retornado pela busca.",
    "",
    "## Top 3 Voice Finalists",
    "",
    finalists || "Menos de 3 candidatos validos retornados pela busca.",
    "",
    "## Audition Plan",
    "",
    `AUDITION_TEXT="${report.AUDITION_TEXT}"`,
    `voicePerformance=${report.voicePerformance}`,
    `Estimated credits for 3 auditions=${report.ESTIMATED_TTS_COST_FOR_3_VOICE_AUDITION.credits}`,
    "",
    "## Model Compatibility",
    "",
    `MODEL_COMPATIBILITY=${JSON.stringify(report.MODEL_COMPATIBILITY)}`,
    `EXPRESSIVE_MODEL_RECOMMENDATION=${report.EXPRESSIVE_MODEL_RECOMMENDATION}`,
    "",
    "## Safety",
    "",
    `ElevenLabs synthesis calls: ${report.costSafety.elevenLabsSynthesisCalls}`,
    `Kling calls: ${report.costSafety.klingCalls}`,
    `HeyGen calls: ${report.costSafety.heyGenCalls}`,
    `WAN calls: ${report.costSafety.wanCalls}`,
    `Paid media generation: ${report.costSafety.paidMediaGeneration}`,
    `Remote write attempts: ${report.costSafety.remoteWriteAttempts}`,
  ].join("\n");
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  installReadOnlyNetworkGuard();
  const apiKey = ensureEnv();

  const [currentVoice, modelsResult, searchResult] = await Promise.all([
    getCurrentVoice(apiKey),
    listModels(apiKey),
    searchVoiceLibrary(apiKey),
  ]);

  const models = modelsResult.ok ? modelsResult.models : [];
  const candidates = searchResult.voices
    .map((voice) => normalizeCandidate(voice, models))
    .filter((candidate) => candidate.voiceId)
    .sort((a, b) => b.scores.RADAR_SMART_FIT - a.scores.RADAR_SMART_FIT)
    .slice(0, 10);
  const finalists = selectFinalists(candidates);
  const estimatedCreditsForOne = estimateVoiceCanaryCredits(AUDITION_TEXT);
  const modelPlan = modelRecommendation(models, finalists);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "GAROTA_RADAR_VOICE_CASTING_REAL_V1_READ_ONLY",
    VOICE_LIBRARY_SEARCH_AVAILABLE: searchResult.available ? "YES" : "NO",
    CANDIDATES_FOUND: candidates.length,
    TARGET_PROFILE,
    candidates,
    TOP_3_VOICE_FINALISTS: finalists,
    CURRENT_VOICE_COMPARISON: currentVoiceComparison(currentVoice.data),
    AUDITION_TEXT,
    voicePerformance:
      "energetic, bright, excited discovery, friendly, natural social-media creator, smiling voice, not shouting",
    ESTIMATED_TTS_COST_FOR_3_VOICE_AUDITION: {
      basis: "Local guardrail: eleven_multilingual_v2 estimates 1 credit per character.",
      auditionTextCharacters: AUDITION_TEXT.length,
      voices: 3,
      credits: estimatedCreditsForOne * 3,
      currencyCost: null,
    },
    MODEL_COMPATIBILITY: {
      currentVoiceApiAvailable: currentVoice.ok,
      currentVoiceApiStatus: currentVoice.status,
      modelsApiAvailable: modelsResult.ok,
      modelsApiStatus: modelsResult.status,
      currentPipelineModelListed: models.some((model) => String(model.model_id ?? model.id ?? "") === GAROTA_RADAR_VOICE_PROFILE.model),
      finalists: finalists.map((candidate) => ({
        label: candidate.label,
        voiceId: candidate.voiceId,
        name: candidate.name,
        modelCompatibility: candidate.modelCompatibility,
      })),
    },
    EXPRESSIVE_MODEL_RECOMMENDATION: modelPlan.expressiveModelRecommendation,
    modelRecommendationDiagnostics: modelPlan,
    providerReadDiagnostics: {
      voiceSearchAttempts: searchResult.attempts,
      currentVoiceLookup: {
        ok: currentVoice.ok,
        status: currentVoice.status,
        source: currentVoice.source,
        error: currentVoice.error,
      },
      modelsLookup: {
        ok: modelsResult.ok,
        status: modelsResult.status,
        source: modelsResult.source,
        error: modelsResult.error,
        modelIds: models.map((model) => model.model_id ?? model.id ?? null).filter(Boolean),
      },
      network,
    },
    costSafety: {
      elevenLabsSynthesisCalls: 0,
      klingCalls: 0,
      heyGenCalls: 0,
      wanCalls: 0,
      paidMediaGeneration: 0,
      remoteWriteAttempts: network.remoteWriteAttempts,
    },
    PROVIDER_GENERATION_CALLS: network.providerGenerationCalls,
    READY_FOR_HUMAN_VOICE_PREVIEW: searchResult.available && finalists.length === 3 && network.providerGenerationCalls === 0 ? "YES" : "NO",
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(REPORT_MD, reportMarkdown(report), "utf8");

  console.log("VOICE_LIBRARY_SEARCH_AVAILABLE=" + report.VOICE_LIBRARY_SEARCH_AVAILABLE);
  console.log("CANDIDATES_FOUND=" + report.CANDIDATES_FOUND);
  console.log("TOP_3=" + finalists.map((candidate) => `${candidate.label}:${candidate.name}:${candidate.voiceId}`).join(" | "));
  console.log("PROVIDER_GENERATION_CALLS=" + report.PROVIDER_GENERATION_CALLS);
  console.log("READY_FOR_HUMAN_VOICE_PREVIEW=" + report.READY_FOR_HUMAN_VOICE_PREVIEW);
  console.log("REPORT_JSON=" + path.relative(root, REPORT_JSON));
  console.log("REPORT_MD=" + path.relative(root, REPORT_MD));
}

main().catch((error) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const failure = {
    generatedAt: new Date().toISOString(),
    mode: "GAROTA_RADAR_VOICE_CASTING_REAL_V1_FAILED",
    error: error instanceof Error ? error.message : "Erro desconhecido.",
    network,
    PROVIDER_GENERATION_CALLS: network.providerGenerationCalls,
    costSafety: {
      elevenLabsSynthesisCalls: 0,
      klingCalls: 0,
      heyGenCalls: 0,
      wanCalls: 0,
      paidMediaGeneration: 0,
      remoteWriteAttempts: network.remoteWriteAttempts,
    },
  };
  fs.writeFileSync(REPORT_JSON, JSON.stringify(failure, null, 2), "utf8");
  console.error("[VOICE_CASTING_REAL_V1] Falhou:", failure.error);
  process.exit(1);
});
