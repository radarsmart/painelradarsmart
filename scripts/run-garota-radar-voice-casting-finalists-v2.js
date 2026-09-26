// Radar Smart - Garota Radar Voice Casting Finalists V2.
//
// Scope: refine the finalists from the previous real read-only ElevenLabs
// casting report. This script does not call providers and does not synthesize
// TTS. It only reads the local V1 report and writes a V2 preflight report.

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const INPUT_REPORT = path.join(root, "temp", "voice-casting-real-v1", "garota-radar-voice-casting-report.json");
const OUT_DIR = path.join(root, "temp", "voice-casting-finalists-v2");
const REPORT_JSON = path.join(OUT_DIR, "garota-radar-voice-finalists-v2-report.json");
const REPORT_MD = path.join(OUT_DIR, "garota-radar-voice-finalists-v2-report.md");

const AUDITION_TEXT = "Gente, olha o pre\u00e7o desse achado! S\u00f3 treze reais e dezesseis centavos.";
const TARGET_MODEL = "eleven_multilingual_v2";
const REJECTED_VOICE_IDS = new Set(["ORgG8rwdAiMYRug8RJwR"]);
const CURRENT_LOW_ENERGY_VOICE_IDS = new Set(["MZxV5lN3cv7hi1376O0m"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function supportsTargetModel(candidate) {
  const modelIds = Array.isArray(candidate.rawModelIds)
    ? candidate.rawModelIds
    : Array.isArray(candidate.modelCompatibility?.candidateModelIds)
      ? candidate.modelCompatibility.candidateModelIds
      : null;

  if (!modelIds || modelIds.length === 0) {
    return "VOICE_MODEL_COMPATIBILITY_UNKNOWN";
  }

  return modelIds.includes(TARGET_MODEL) ? "SUPPORTED" : "NOT_LISTED_FOR_VOICE";
}

function hasPreview(candidate) {
  return Boolean(text(candidate.previewUrl));
}

function isPortuguese(candidate) {
  const lang = lower(candidate.language);
  const locale = lower(candidate.locale);
  const accent = lower(candidate.accent);
  const description = lower(candidate.description);
  return (
    lang === "pt" ||
    locale.includes("pt-br") ||
    description.includes("brazilian portuguese") ||
    description.includes("portuguese") ||
    accent.includes("brazilian")
  );
}

function replacementScore(candidate) {
  const scores = candidate.scores ?? {};
  let score = 0;
  if (isPortuguese(candidate)) score += 35;
  if (lower(candidate.gender).includes("female")) score += 30;
  if (lower(candidate.age).includes("young") || lower(candidate.age).includes("adult_young")) score += 15;
  if (supportsTargetModel(candidate) === "SUPPORTED") score += 10;
  if (hasPreview(candidate)) score += 8;
  score += Math.round(Number(scores.ENERGY ?? 0) * 0.12);
  score += Math.round(Number(scores.BRIGHTNESS ?? 0) * 0.1);
  score += Math.round(Number(scores.CONVERSATIONAL_FEEL ?? 0) * 0.08);
  score += Math.round(Number(scores.SOCIAL_MEDIA_FIT ?? 0) * 0.08);
  score += Math.round(Number(scores.NATURALNESS ?? 0) * 0.06);

  const description = lower(candidate.description);
  if (description.includes("calm") || description.includes("relaxed")) score -= 10;
  if (description.includes("narration") || description.includes("narrative")) score -= 6;
  if (description.includes("audiobook") || description.includes("news") || description.includes("formal")) score -= 16;
  if (!lower(candidate.gender).includes("female")) score -= 35;
  if (!isPortuguese(candidate)) score -= 25;

  return score;
}

function chooseReplacement(candidates, keepVoiceIds) {
  return candidates
    .filter((candidate) => !keepVoiceIds.has(candidate.voiceId))
    .filter((candidate) => !REJECTED_VOICE_IDS.has(candidate.voiceId))
    .filter((candidate) => !CURRENT_LOW_ENERGY_VOICE_IDS.has(candidate.voiceId))
    .map((candidate) => ({ candidate, replacementScore: replacementScore(candidate) }))
    .sort((a, b) => b.replacementScore - a.replacementScore)[0];
}

function finalist(candidate, label, archetype, whySelected, strength, risk, extra = {}) {
  return {
    label,
    name: candidate.name ?? null,
    voiceId: candidate.voiceId ?? null,
    archetype,
    preview: candidate.previewUrl ?? null,
    strength,
    risk,
    whySelected,
    source: candidate.source ?? null,
    language: candidate.language ?? null,
    locale: candidate.locale ?? null,
    accent: candidate.accent ?? null,
    gender: candidate.gender ?? null,
    age: candidate.age ?? null,
    useCase: candidate.useCase ?? null,
    scores: candidate.scores ?? null,
    modelCompatibility: {
      targetModel: TARGET_MODEL,
      status: supportsTargetModel(candidate),
      providerReturnedCandidateModelIds:
        Array.isArray(candidate.rawModelIds) && candidate.rawModelIds.length > 0
          ? candidate.rawModelIds
          : null,
    },
    ...extra,
  };
}

function markdown(report) {
  const lines = [
    "# Garota Radar Voice Casting Finalists V2",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "## Status",
    "",
    `PROVIDER_GENERATION_CALLS=${report.PROVIDER_GENERATION_CALLS}`,
    `READY_FOR_FREE_HUMAN_PREVIEW=${report.READY_FOR_FREE_HUMAN_PREVIEW}`,
    `READY_FOR_CONTROLLED_TTS_AUDITION=${report.READY_FOR_CONTROLLED_TTS_AUDITION}`,
    "",
    "## Finalists",
    "",
  ];

  for (const item of report.finalists) {
    lines.push(
      `### FINALIST_${item.label}`,
      "",
      `name=${item.name}`,
      `voiceId=${item.voiceId}`,
      `archetype=${item.archetype}`,
      `preview=${item.preview}`,
      `strength=${item.strength}`,
      `risk=${item.risk}`,
      `modelCompatibility=${item.modelCompatibility.status}`,
      "",
    );
  }

  lines.push(
    "## Previously Rejected Voices",
    "",
    JSON.stringify(report.PREVIOUSLY_REJECTED_VOICES, null, 2),
    "",
    "## Model Test Strategy",
    "",
    JSON.stringify(report.MODEL_TEST_STRATEGY, null, 2),
    "",
    "## Audition",
    "",
    `AUDITION_TEXT="${report.AUDITION_TEXT}"`,
    `creditsPerVoice=${report.AUDITION_ESTIMATED_CREDITS.creditsPerVoice}`,
    `totalCredits=${report.AUDITION_ESTIMATED_CREDITS.totalCredits}`,
  );

  return lines.join("\n");
}

function main() {
  if (!fs.existsSync(INPUT_REPORT)) {
    throw new Error(`Missing V1 report: ${path.relative(root, INPUT_REPORT)}`);
  }

  const source = readJson(INPUT_REPORT);
  const candidates = Array.isArray(source.candidates) ? source.candidates : [];
  const candidateById = new Map(candidates.map((candidate) => [candidate.voiceId, candidate]));

  const friendShowingFind = candidateById.get("qUqXzKPs4b4NRdbYKPx7");
  const modernCommercial = candidateById.get("Xn8Pl3KG5gTxSTFXF9V4");

  if (!friendShowingFind || !modernCommercial) {
    throw new Error("Expected retained finalists were not found in the V1 candidate list.");
  }

  const keepVoiceIds = new Set([friendShowingFind.voiceId, modernCommercial.voiceId]);
  const replacement = chooseReplacement(candidates, keepVoiceIds);

  if (!replacement) {
    throw new Error("No replacement finalist found among the V1 candidates.");
  }

  const energeticCreator = replacement.candidate;
  const creditsPerVoice = AUDITION_TEXT.length;
  const finalists = [
    finalist(
      energeticCreator,
      "A",
      "ENERGETIC_CREATOR",
      "Chosen as the closest remaining PT-BR female young-adult candidate after applying human rejection over metadata score.",
      "PT-BR female young voice with explicit target-model support and existing preview.",
      "Weak energetic-creator evidence in metadata; description says relaxed/narration, so this must be eliminated by free human preview if it sounds low-energy.",
      { replacementScore: replacement.replacementScore },
    ),
    finalist(
      friendShowingFind,
      "B",
      "FRIEND_SHOWING_A_FIND",
      "Kept from V1 because it best matches natural friend-sharing-a-find energy.",
      "Very high warmth, conversational feel, and naturalness; description explicitly mentions genuine discovery and smile in the voice.",
      "Provider did not return per-voice model IDs, so compatibility with the target model remains unknown instead of assumed.",
    ),
    finalist(
      modernCommercial,
      "C",
      "MODERN_COMMERCIAL",
      "Kept from V1 as a deliberate mature/commercial contrast.",
      "Warm and natural commercial contrast against the friend/creator options.",
      "May be too mature, slow, or deliberate for scroll-stopping social commerce; provider did not return per-voice model IDs.",
    ),
  ];

  const modelIds = source.providerReadDiagnostics?.modelsLookup?.modelIds ?? [];
  const readyForFreePreview = finalists.every((item) => Boolean(item.preview)) ? "YES" : "NO";
  const allCompatibilityKnown = finalists.every((item) => item.modelCompatibility.status === "SUPPORTED");

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "GAROTA_RADAR_VOICE_CASTING_FINALISTS_V2_NO_PROVIDER_CALLS",
    sourceReport: path.relative(root, INPUT_REPORT),
    FINALIST_A: finalists[0],
    FINALIST_B: finalists[1],
    FINALIST_C: finalists[2],
    finalists,
    PREVIOUSLY_REJECTED_VOICES: [
      {
        name: "Ana Alice - Friendly & Clear",
        voiceId: "ORgG8rwdAiMYRug8RJwR",
        reason: "HUMAN_CANARY_PREVIOUSLY_REJECTED",
        ruleApplied: "human rejection > metadata score",
        keptInHistory: true,
      },
    ],
    CURRENT_VOICE: {
      name: "Ana Dias - Engaging, Smooth and Forceful",
      voiceId: "MZxV5lN3cv7hi1376O0m",
      status: "CURRENT_VOICE",
      humanReview: "LOW_ENERGY_FOR_SOCIAL_COMMERCE",
      keptInHistory: true,
      notSelectedAsReplacement: true,
    },
    MODEL_TEST_STRATEGY: {
      firstAudition: {
        experimentRule: "VOICE_VARIABLE_ONLY",
        model: TARGET_MODEL,
        text: AUDITION_TEXT,
        sameText: true,
        sameModel: true,
        sameOutputFormat: true,
        sameEquivalentSettings: true,
        useElevenV3: false,
      },
      elevenV3Available: modelIds.includes("eleven_v3"),
      futureTest:
        "After a human picks the winning voice, run a separate A/B: WINNER + eleven_multilingual_v2 versus WINNER + eleven_v3.",
    },
    AUDITION_TEXT,
    voicePerformance:
      "energetic, bright, excited discovery, friendly, natural creator, smiling voice, confident, not shouting, not corporate announcer",
    AUDITION_ESTIMATED_CREDITS: {
      basis: "Local project guardrail: eleven_multilingual_v2 estimates 1 credit per character.",
      auditionTextCharacters: AUDITION_TEXT.length,
      creditsPerVoice,
      voices: finalists.length,
      totalCredits: creditsPerVoice * finalists.length,
      currencyCost: null,
    },
    MODEL_COMPATIBILITY_WARNINGS: finalists
      .filter((item) => item.modelCompatibility.status !== "SUPPORTED")
      .map((item) => ({
        finalist: item.label,
        voiceId: item.voiceId,
        status: item.modelCompatibility.status,
      })),
    PROVIDER_GENERATION_CALLS: 0,
    PROVIDER_READ_CALLS_THIS_RUN: 0,
    READY_FOR_FREE_HUMAN_PREVIEW: readyForFreePreview,
    READY_FOR_CONTROLLED_TTS_AUDITION: allCompatibilityKnown ? "YES" : "NO",
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(REPORT_MD, markdown(report), "utf8");

  console.log("FINALIST_A=" + `${report.FINALIST_A.name}:${report.FINALIST_A.voiceId}`);
  console.log("FINALIST_B=" + `${report.FINALIST_B.name}:${report.FINALIST_B.voiceId}`);
  console.log("FINALIST_C=" + `${report.FINALIST_C.name}:${report.FINALIST_C.voiceId}`);
  console.log("PROVIDER_GENERATION_CALLS=" + report.PROVIDER_GENERATION_CALLS);
  console.log("READY_FOR_FREE_HUMAN_PREVIEW=" + report.READY_FOR_FREE_HUMAN_PREVIEW);
  console.log("READY_FOR_CONTROLLED_TTS_AUDITION=" + report.READY_FOR_CONTROLLED_TTS_AUDITION);
  console.log("REPORT_JSON=" + path.relative(root, REPORT_JSON));
  console.log("REPORT_MD=" + path.relative(root, REPORT_MD));
}

main();
