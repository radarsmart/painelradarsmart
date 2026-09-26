// Radar Smart - First User-Approved Commercial Canary / Final Cost Preflight.
//
// Read-only DRY_RUN. No media generation, no provider calls, no Supabase writes.
// The approved persisted storyboard is the source of truth; this script only
// verifies approval/fingerprint, resolves real references, estimates cost, and
// reports readiness gates.

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

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

const CAMPAIGN_ID = process.argv[2] || "660d53b5-d3dc-47a5-b031-4d035bfd97a3";
const OUT_DIR = path.join(root, "temp", "first-user-approved-commercial-canary-preflight");
const OUT_FILE = path.join(OUT_DIR, "kokeshi-final-cost-preflight-report.json");
const MIN_TAIL_MARGIN_SECONDS = 0.25;
const KLING_ENUM_PROVIDERS = new Set(["freepik-kling-i2v", "wan-2-5-t2v"]);

const EXPECTED_NARRATION = {
  "scene-1": "Olha esse achado por só R$ 13,16.",
  "scene-2": "Esse é o Creme Gel Kokeshi.",
  "scene-3": "Por esse preço, vale conhecer.",
  "scene-4": "Só R$ 13,16.",
  "scene-5": "Entre no Grupo VIP da Radar Smart.",
};

const EXPECTED_STRUCTURE = {
  "scene-1": { presenter: "GAROTA_RADAR", purpose: "HOOK" },
  "scene-2": { presenter: "PRODUCT_ONLY", purpose: "PRODUCT_DEMONSTRATION" },
  "scene-3": { presenter: "GAROTA_RADAR", purpose: "SALES_ARGUMENT" },
  "scene-4": { presenter: "PRODUCT_ONLY", purpose: "OFFER" },
  "scene-5": { presenter: "GAROTA_RADAR", purpose: "CTA" },
};

const BLOCKED_PROVIDER_HOST_SUBSTRINGS = [
  "api.magnific.com",
  "api.freepik.com",
  "cdn-magnific.freepik.com",
  "heygen.com",
  "elevenlabs.io",
  "api.openai.com",
  "klingai.com",
  "runwayml",
  "replicate",
];

const providerAttempts = [];
const networkCalls = [];
const realFetch = global.fetch;
global.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
  networkCalls.push(url);
  if (BLOCKED_PROVIDER_HOST_SUBSTRINGS.some((host) => url.includes(host))) {
    providerAttempts.push(url);
    throw new Error(`ABORTED: paid provider host attempted during preflight: ${url}`);
  }
  return realFetch(input, init);
};

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

const supabaseAdminRaw = createClient(mustEnv("NEXT_PUBLIC_SUPABASE_URL"), mustEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

let remoteWriteAttempts = 0;
const supabaseAdmin = {
  from(table) {
    const builder = supabaseAdminRaw.from(table);
    for (const method of ["insert", "update", "upsert", "delete"]) {
      builder[method] = () => {
        remoteWriteAttempts += 1;
        throw new Error(`ABORTED: remote write attempted during preflight: ${table}.${method}()`);
      };
    }
    return builder;
  },
};

const { buildCampaignExecutionPlan } = require("../lib/generation-orchestrator/orchestrator.ts");
const { resolveCampaignSceneReferences } = require("../lib/generation-orchestrator/reference-resolver.ts");
const { validateSceneForGeneration } = require("../lib/generation-orchestrator/guardrails.ts");
const { getProviderProfile, isProviderProductionEligible } = require("../lib/generation-orchestrator/provider-capabilities.ts");
const { scanTextForForbiddenClaims } = require("../lib/content-safety/claims-policy.ts");
const { estimateSpeechSeconds, computeMaxCharacters } = require("../lib/commercial-video/narration/narration-duration-budget.ts");
const { assessNarrationQuality } = require("../lib/commercial-video/narration/narration-quality-gate.ts");
const { computeSceneFingerprint, computeNarrationFingerprint } = require("../lib/commercial-video/runner/execute/scene-fingerprint.ts");
const { buildReusableSceneCandidates, buildReusableNarrationRecords } = require("../lib/commercial-video/runner/execute/reusable-candidates.ts");
const { evaluateCampaignExecutionReadiness } = require("../lib/commercial-video/runner/execute/execution-readiness.ts");
const { GAROTA_RADAR_VOICE_PROFILE } = require("../lib/commercial-video/audio/garota-radar-voice-profile.ts");
const { assertFinalVideoEncoderReady, FINAL_VIDEO_CODEC_POLICY } = require("../lib/commercial-video/final-video-codec-policy.ts");

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePurpose(sceneId, purpose) {
  if (sceneId === "scene-2" && purpose === "PRODUCT") return "PRODUCT_DEMONSTRATION";
  return purpose;
}

function presenterKind(scene) {
  return scene.garotaRadarAppearance === "NONE" ? "PRODUCT_ONLY" : "GAROTA_RADAR";
}

function billableDurationSeconds(provider, timelineDurationSeconds) {
  if (KLING_ENUM_PROVIDERS.has(provider)) return timelineDurationSeconds <= 5 ? 5 : 10;
  return timelineDurationSeconds;
}

function currency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

function compactHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return String(url).slice(0, 80);
  }
}

function sceneRunnerPlanFromExecutionScene(scenePlan, purpose, existingAsset) {
  const providerProfile = getProviderProfile(scenePlan.selectedProvider);
  const providerStatus = providerProfile?.status ?? null;
  const requiresHybridPipeline = scenePlan.productGenerationStrategy === "HYBRID_PRODUCT_COMPOSITE";
  let eligibility = "ELIGIBLE";
  let eligibilityReason = null;

  if (scenePlan.productGenerationStrategy === "BLOCKED_REFERENCE_QUALITY") {
    eligibility = "BLOCKED_REFERENCE_QUALITY";
    eligibilityReason = scenePlan.statusReason ?? "Estrategia bloqueada por qualidade de referencia insuficiente.";
  } else if (scenePlan.status === "SKIPPED") {
    eligibility = "SKIPPED";
    eligibilityReason = scenePlan.statusReason;
  } else if (scenePlan.status === "FAILED" && scenePlan.capabilityFidelityBlocked) {
    eligibility = "BLOCKED_CAPABILITY_FIDELITY";
    eligibilityReason = scenePlan.statusReason ?? "Capability selecionada nao aceita referencia real de produto exigida pela cena.";
  } else if (scenePlan.status === "FAILED") {
    eligibility = "BLOCKED_PROVIDER_STATUS";
    eligibilityReason = scenePlan.statusReason ?? "Cena marcada FAILED pelo Generation Orchestrator.";
  } else if (scenePlan.selectedProvider !== "mock" && providerStatus !== "ACTIVE") {
    eligibility = "BLOCKED_PROVIDER_STATUS";
    eligibilityReason = `Provider "${scenePlan.selectedProvider}" tem status "${providerStatus ?? "DESCONHECIDO"}".`;
  } else {
    const validation = validateSceneForGeneration(scenePlan);
    if (!validation.ok) {
      eligibility = "BLOCKED_VALIDATION";
      eligibilityReason = validation.reason;
    }
  }

  return {
    sceneId: scenePlan.sceneId,
    sceneOrder: scenePlan.sceneOrder,
    purpose,
    providerCapability: scenePlan.providerCapability,
    selectedProvider: scenePlan.selectedProvider,
    providerStatus,
    productGenerationStrategy: scenePlan.productGenerationStrategy,
    requiresHybridPipeline,
    eligibility,
    eligibilityReason,
    estimatedCost: scenePlan.estimatedCost,
    persistedStatus: scenePlan.status,
    persistedStatusReason: scenePlan.statusReason,
    existingAsset,
  };
}

async function readJsonReport(pathname) {
  if (!fs.existsSync(pathname)) return null;
  return JSON.parse(fs.readFileSync(pathname, "utf8"));
}

async function loadPreviousExecuteJobs(campaignId) {
  const { data, error } = await supabaseAdmin
    .from("commercial_generation_jobs")
    .select("id,campaign_id,mode,status,runner_result,created_at,completed_at")
    .eq("campaign_id", campaignId)
    .eq("mode", "EXECUTE")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return { jobs: [], error: error.message };
  }
  return { jobs: data ?? [], error: null };
}

function reusableSceneAssets(previousJobs, currentScenes) {
  const previousResult = previousJobs.map((job) => job.runner_result).find(Boolean) ?? null;
  const candidates = buildReusableSceneCandidates(previousResult, currentScenes);
  const currentFingerprints = Object.fromEntries(currentScenes.map((scene) => [scene.sceneId, computeSceneFingerprint(scene)]));
  return currentScenes.map((scene) => {
    const candidate = candidates.find((entry) => {
      if (entry.sceneId !== scene.sceneId) return false;
      if (entry.source !== "GENERATION_RESULT" && entry.source !== "HYBRID_COMPOSITE") return false;
      if (!entry.fingerprint) return false;
      return entry.fingerprint === currentFingerprints[scene.sceneId];
    });
    return {
      sceneId: scene.sceneId,
      currentFingerprint: currentFingerprints[scene.sceneId],
      action: candidate ? "REUSE" : "GENERATE",
      reusable: Boolean(candidate),
      reason: candidate
        ? "Storyboard fingerprint, scene prompt/provider/references/duration and scene fingerprint match a previous paid output."
        : "No previous paid asset with identical scene fingerprint was found; do not reuse by campaign id alone.",
      source: candidate?.source ?? null,
      provider: candidate?.provider ?? null,
      generationId: candidate?.generationId ?? null,
      outputUrlPresent: Boolean(candidate && (candidate.outputUrl || candidate.outputPath)),
    };
  });
}

function reusableNarration(previousJobs, narrationPlan) {
  const previousResult = previousJobs.map((job) => job.runner_result).find(Boolean) ?? null;
  const records = buildReusableNarrationRecords(previousResult);
  return narrationPlan.scenes.map((scene) => {
    const fingerprint = scene.text
      ? computeNarrationFingerprint(scene.text, GAROTA_RADAR_VOICE_PROFILE.voiceId, GAROTA_RADAR_VOICE_PROFILE.model)
      : null;
    const match = fingerprint
      ? records.find(
          (record) =>
            record.sceneId === scene.sceneId &&
            record.fingerprint === fingerprint &&
            (record.status === "COMPLETED" || record.status === "REUSED") &&
            (record.audioPath || record.audioUrl),
        )
      : null;
    return {
      sceneId: scene.sceneId,
      action: match ? "REUSE" : "GENERATE",
      reusable: Boolean(match),
      fingerprint,
      reason: match
        ? "Narration text, voice and model match a previous completed/reused audio record."
        : "No previous paid narration with identical text, voice and model was found.",
    };
  });
}

function buildExactNarrationPlan(campaignId, storyboard) {
  const scenes = storyboard.scenes.map((scene) => {
    const text = scene.spokenNarration || "";
    const characterCount = [...text].length;
    const estimatedSpeechSeconds = estimateSpeechSeconds(characterCount);
    const maxCharacters = computeMaxCharacters(scene.durationSeconds);
    const tailMargin = scene.durationSeconds - estimatedSpeechSeconds;
    const status = !text.trim() ? "BLOCKED_MISSING_DATA" : tailMargin >= 0 ? "READY" : "TOO_LONG";
    return {
      sceneId: scene.sceneId,
      sceneOrder: scene.sceneNumber,
      purpose: scene.purpose,
      text,
      durationSeconds: scene.durationSeconds,
      maxCharacters,
      estimatedSpeechSeconds,
      status,
      reason: status === "TOO_LONG" ? `Estimated speech ${estimatedSpeechSeconds.toFixed(3)}s exceeds ${scene.durationSeconds}s scene window.` : null,
      candidatesConsidered: 1,
    };
  });

  const totalCharacters = scenes.reduce((sum, scene) => sum + (scene.text?.length ?? 0), 0);
  return {
    campaignId,
    language: "pt-BR",
    scenes,
    totalCharacters,
    estimatedCredits: totalCharacters,
    status: scenes.some((scene) => scene.status === "TOO_LONG" || scene.status === "BLOCKED_MISSING_DATA") ? "BLOCKED" : "READY",
  };
}

function normalizeComparableText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function storyboardPurposeFromPrompt(sceneId, purpose) {
  if (sceneId === "scene-2" && purpose === "PRODUCT") return "PRODUCT_DEMONSTRATION";
  if (sceneId === "scene-3" && purpose === "BENEFIT") return "SALES_ARGUMENT";
  return purpose;
}

function capabilityIntentFromPrompt(promptScene) {
  if (!promptScene) return null;
  if (promptScene.mediaType === "CHARACTER_VIDEO") return "CHARACTER_VIDEO";
  if (promptScene.mediaType === "PRODUCT_VIDEO") return "PRODUCT_VIDEO";
  if (promptScene.mediaType === "TEXT_TO_VIDEO") return "TEXT_TO_VIDEO";
  if (promptScene.mediaType === "IMAGE_TO_VIDEO") return "IMAGE_TO_VIDEO";
  return promptScene.mediaType ?? null;
}

function overlayMatchesStoryboard(storyScene, promptScene) {
  if (!promptScene) return false;
  const storyboardOverlay = normalizeComparableText(storyScene.overlay);
  const promptTextOverlay = normalizeComparableText(promptScene.textOverlay);
  const priceText = normalizeComparableText(promptScene.overlayInstructions?.priceText);
  const ctaText = normalizeComparableText(promptScene.overlayInstructions?.ctaText);
  const discountText = normalizeComparableText(promptScene.overlayInstructions?.discountText);

  if (storyScene.purpose === "OFFER") {
    const storyPrice = normalizeComparableText(storyScene.price || storyScene.overlay);
    return Boolean(storyPrice) && priceText === storyPrice && discountText === "";
  }

  if (storyScene.purpose === "CTA") {
    const storyCta = normalizeComparableText(storyScene.cta || storyScene.overlay);
    return Boolean(storyCta) && ctaText === storyCta;
  }

  return storyboardOverlay === promptTextOverlay;
}

function checkPromptPlanMatchesStoryboard(storyboard, promptPlan) {
  if (!isRecord(storyboard) || !Array.isArray(storyboard.scenes)) {
    return {
      ok: false,
      reasons: ["Storyboard ausente ou sem scenes[]."],
      checks: [],
    };
  }

  if (!isRecord(promptPlan) || !Array.isArray(promptPlan.scenes)) {
    return {
      ok: false,
      reasons: ["Prompt Plan ausente ou sem scenes[]."],
      checks: [],
    };
  }

  const checks = storyboard.scenes.map((storyScene) => {
    const promptScene = promptPlan.scenes.find((scene) => scene.sceneId === storyScene.sceneId);
    const expectedPurpose = storyboardPurposeFromPrompt(storyScene.sceneId, promptScene?.purpose ?? null);
    const actualPurpose = normalizePurpose(storyScene.sceneId, storyScene.purpose);
    const presenterRequired = storyScene.garotaRadarAppearance !== "NONE";
    const productReferenceExpected = storyScene.sceneId === "scene-2" || storyScene.sceneId === "scene-4";
    const productRequirementMatches = !promptScene
      ? false
      : productReferenceExpected
        ? promptScene.productFidelityRequirement === "REQUIRED" || promptScene.providerHints?.requiresProductReference === true
        : promptScene.providerHints?.requiresProductReference !== true || promptScene.productFidelityRequirement !== "REQUIRED";
    const capabilityIntent = capabilityIntentFromPrompt(promptScene);

    const check = {
      sceneId: storyScene.sceneId,
      promptPlanPresent: Boolean(promptScene),
      sceneIdMatches: Boolean(promptScene?.sceneId === storyScene.sceneId),
      purposeMatches: expectedPurpose === actualPurpose,
      durationMatches: promptScene?.durationSeconds === storyScene.durationSeconds,
      spokenNarrationMatches:
        normalizeComparableText(promptScene?.voiceoverIntent) === normalizeComparableText(storyScene.spokenNarration),
      overlayMatches: overlayMatchesStoryboard(storyScene, promptScene),
      presenterRequirementMatches: presenterRequired
        ? promptScene?.mediaType === "CHARACTER_VIDEO" && Boolean(promptScene.identityReferenceAssetId)
        : promptScene?.mediaType !== "CHARACTER_VIDEO",
      productRequirementMatches,
      capabilityIntentMatches: capabilityIntent === storyScene.estimatedCapability,
      actual: {
        purpose: actualPurpose,
        durationSeconds: storyScene.durationSeconds,
        spokenNarration: storyScene.spokenNarration,
        overlay: storyScene.overlay,
        price: storyScene.price,
        cta: storyScene.cta,
        presenterRequired,
        estimatedCapability: storyScene.estimatedCapability,
      },
      prompt: {
        purpose: expectedPurpose,
        durationSeconds: promptScene?.durationSeconds ?? null,
        voiceoverIntent: promptScene?.voiceoverIntent ?? null,
        textOverlay: promptScene?.textOverlay ?? null,
        overlayInstructions: promptScene?.overlayInstructions ?? null,
        mediaType: promptScene?.mediaType ?? null,
        productFidelityRequirement: promptScene?.productFidelityRequirement ?? null,
        providerHints: promptScene?.providerHints ?? null,
        capabilityIntent,
      },
    };

    return {
      ...check,
      ok:
        check.promptPlanPresent &&
        check.sceneIdMatches &&
        check.purposeMatches &&
        check.durationMatches &&
        check.spokenNarrationMatches &&
        check.overlayMatches &&
        check.presenterRequirementMatches &&
        check.productRequirementMatches &&
        check.capabilityIntentMatches,
    };
  });

  const promptSceneIds = new Set(promptPlan.scenes.map((scene) => scene.sceneId));
  const storyboardSceneIds = new Set(storyboard.scenes.map((scene) => scene.sceneId));
  const missingFromPrompt = [...storyboardSceneIds].filter((sceneId) => !promptSceneIds.has(sceneId));
  const extraPromptScenes = [...promptSceneIds].filter((sceneId) => !storyboardSceneIds.has(sceneId));
  const reasons = [];

  if (storyboard.scenes.length !== promptPlan.scenes.length) {
    reasons.push(`Scene count diverge: storyboard=${storyboard.scenes.length}, promptPlan=${promptPlan.scenes.length}.`);
  }
  for (const sceneId of missingFromPrompt) reasons.push(`Cena ${sceneId} ausente no Prompt Plan.`);
  for (const sceneId of extraPromptScenes) reasons.push(`Prompt Plan contem cena extra ${sceneId}.`);
  for (const check of checks.filter((entry) => !entry.ok)) {
    reasons.push(`Cena ${check.sceneId} diverge entre Storyboard e Prompt Plan.`);
  }

  return {
    ok: reasons.length === 0 && checks.every((entry) => entry.ok),
    reasons,
    checks,
  };
}

function buildAbortReport(reason, partial) {
  return {
    reportName: "FIRST_USER_APPROVED_COMMERCIAL_CANARY_FINAL_COST_PREFLIGHT",
    generatedAt: new Date().toISOString(),
    campaignId: CAMPAIGN_ID,
    mode: "READ_ONLY_PREFLIGHT_ABORTED",
    abortReason: reason,
    ...partial,
    providerCalls: 0,
    providerAttemptsBlocked: providerAttempts.length,
    providerAttemptUrls: providerAttempts,
    mediaGeneration: 0,
    uploads: 0,
    remoteWriteAttempts,
    READY_FOR_USER_APPROVED_PAID_EXECUTION: "NO",
  };
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const finalVideoEncoder = assertFinalVideoEncoderReady();

  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from("creative_campaigns")
    .select("id,name,offer_id,product_intelligence_id,aspect_ratio,platform,creative_brief")
    .eq("id", CAMPAIGN_ID)
    .maybeSingle();

  if (campaignError) throw new Error(campaignError.message);
  if (!campaign) throw new Error(`Campaign not found: ${CAMPAIGN_ID}`);

  const creativeBrief = campaign.creative_brief ?? {};
  const storyboard = creativeBrief.commercialCreationStoryboard;
  const approvalStatus = creativeBrief.commercialCreationStatus ?? null;
  const approvedStoryboardFingerprint = creativeBrief.commercialCreationApprovedFingerprint ?? null;
  const currentStoryboardFingerprint = isRecord(storyboard) ? storyboard.storyboardFingerprint ?? null : null;

  const approvalFingerprintValid =
    approvalStatus === "APPROVED_FOR_GENERATION" &&
    Boolean(approvedStoryboardFingerprint) &&
    approvedStoryboardFingerprint === currentStoryboardFingerprint;

  if (!isRecord(storyboard) || !approvalFingerprintValid) {
    const report = buildAbortReport("APPROVAL_STATUS_OR_FINGERPRINT_INVALID", {
      approval: {
        approvalStatus,
        approvedStoryboardFingerprint,
        currentStoryboardFingerprint,
        approvalFingerprintValid,
      },
    });
    fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify(report, null, 2));
    console.log(`\nRelatorio salvo em: ${path.relative(root, OUT_FILE)}`);
    console.log("READY_FOR_USER_APPROVED_PAID_EXECUTION = NO");
    return;
  }

  const promptPlan = storyboard.promptPlan ?? creativeBrief.promptPlan;
  if (!isRecord(promptPlan) || !Array.isArray(promptPlan.scenes)) {
    const report = buildAbortReport("MISSING_PROMPT_PLAN", {
      approval: { approvalStatus, approvedStoryboardFingerprint, currentStoryboardFingerprint, approvalFingerprintValid },
    });
    fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify(report, null, 2));
    console.log(`\nRelatorio salvo em: ${path.relative(root, OUT_FILE)}`);
    console.log("READY_FOR_USER_APPROVED_PAID_EXECUTION = NO");
    return;
  }

  const [offerRes, piRes, previousJobsResult] = await Promise.all([
    supabaseAdmin
      .from("offers")
      .select("id,title,price,discount_pct,image_url,rating,reviews_count")
      .eq("id", campaign.offer_id)
      .maybeSingle(),
    supabaseAdmin
      .from("product_intelligence")
      .select("id,category,key_benefits")
      .eq("id", campaign.product_intelligence_id)
      .maybeSingle(),
    loadPreviousExecuteJobs(CAMPAIGN_ID),
  ]);

  if (offerRes.error) throw new Error(offerRes.error.message);
  if (piRes.error) throw new Error(piRes.error.message);
  if (!offerRes.data) throw new Error("Offer not found.");

  const offer = offerRes.data;
  const productIntelligence = piRes.data;
  const category = productIntelligence?.category ?? "geral";

  const resolvedRefs = await resolveCampaignSceneReferences(promptPlan, campaign.offer_id, category);
  const executionPlan = buildCampaignExecutionPlan(CAMPAIGN_ID, "MOCK", promptPlan, resolvedRefs);
  const promptPlanMatchesStoryboard = checkPromptPlanMatchesStoryboard(storyboard, promptPlan);
  const exactNarrationPlan = buildExactNarrationPlan(CAMPAIGN_ID, storyboard);
  const narrationQuality = assessNarrationQuality(exactNarrationPlan);
  const sceneReuse = reusableSceneAssets(previousJobsResult.jobs, executionPlan.scenes);
  const narrationReuse = reusableNarration(previousJobsResult.jobs, exactNarrationPlan);

  const runnerScenes = executionPlan.scenes.map((scene) => {
    const promptScene = promptPlan.scenes.find((entry) => entry.sceneId === scene.sceneId);
    const reuse = sceneReuse.find((entry) => entry.sceneId === scene.sceneId);
    const existingAsset = reuse?.reusable
      ? { source: reuse.source, inputVideoPath: reuse.outputUrlPresent ? "previous-storage-output" : null, status: "READY", rejectionReason: null }
      : null;
    return sceneRunnerPlanFromExecutionScene(scene, promptScene?.purpose ?? "PRODUCT", existingAsset);
  });

  const creativeQualityGateStatus = storyboard.optimizerAudit?.qualityGateStatus ?? null;
  const persuasionStatus =
    storyboard.optimizerAudit?.qualityGateStatus ??
    creativeBrief.commercialPersuasion?.persuasionStrategy?.qualityGate?.status ??
    null;
  const executionReadiness = evaluateCampaignExecutionReadiness(
    runnerScenes,
    exactNarrationPlan,
    creativeQualityGateStatus === "PASS_WITH_OBSERVATIONS" ? "PASS_WITH_OBSERVATIONS" : creativeQualityGateStatus,
    persuasionStatus === "PASS_WITH_OBSERVATIONS" ? "PASS_WITH_OBSERVATIONS" : persuasionStatus,
  );

  const claimViolations = exactNarrationPlan.scenes.flatMap((scene) =>
    scene.text
      ? scanTextForForbiddenClaims(scene.text, category).map((violation) => ({ sceneId: scene.sceneId, ...violation }))
      : [],
  );

  const narrationTiming = exactNarrationPlan.scenes.map((scene) => {
    const tailMargin = scene.estimatedSpeechSeconds === null ? null : Number((scene.durationSeconds - scene.estimatedSpeechSeconds).toFixed(3));
    const reuse = narrationReuse.find((entry) => entry.sceneId === scene.sceneId);
    return {
      sceneId: scene.sceneId,
      narration: scene.text,
      characters: scene.text?.length ?? 0,
      estimatedSpeechDuration: scene.estimatedSpeechSeconds === null ? null : Number(scene.estimatedSpeechSeconds.toFixed(3)),
      sceneDuration: scene.durationSeconds,
      maxCharacters: scene.maxCharacters,
      tailMargin,
      tailMarginSafe: tailMargin !== null && tailMargin >= MIN_TAIL_MARGIN_SECONDS,
      elevenLabsCredits: reuse?.reusable ? 0 : scene.text?.length ?? 0,
      narrationAction: reuse?.action ?? "GENERATE",
      status: scene.status,
      reason: scene.reason,
    };
  });

  const generationRows = storyboard.scenes.map((storyScene) => {
    const executionScene = executionPlan.scenes.find((scene) => scene.sceneId === storyScene.sceneId);
    const promptScene = promptPlan.scenes.find((scene) => scene.sceneId === storyScene.sceneId);
    const refs = resolvedRefs[storyScene.sceneId];
    const reuse = sceneReuse.find((entry) => entry.sceneId === storyScene.sceneId);
    const provider = executionScene?.selectedProvider ?? storyScene.estimatedProvider;
    const timelineDuration = storyScene.durationSeconds;
    const billableDuration = billableDurationSeconds(provider, timelineDuration);
    const profile = getProviderProfile(provider);
    return {
      sceneId: storyScene.sceneId,
      timelineDuration,
      provider,
      capability: executionScene?.providerCapability ?? storyScene.estimatedCapability,
      billableDuration,
      productionEligible: isProviderProductionEligible(provider),
      providerStatus: profile?.status ?? null,
      action: reuse?.action ?? "GENERATE",
      estimatedCredits: reuse?.reusable ? 0 : executionScene?.estimatedCost.estimatedCredits ?? null,
      estimatedCurrencyCostCents: reuse?.reusable ? 0 : executionScene?.estimatedCost.estimatedCurrencyCostCents ?? null,
      estimatedUsdCostCents: reuse?.reusable ? 0 : executionScene?.estimatedCost.estimatedUsdCostCents ?? null,
      productReferenceResolved: Boolean(refs?.productReferenceUrl),
      identityReferenceResolved: Boolean(refs?.identityReferenceUrl),
      supportReferenceResolved: Boolean(refs?.supportReferenceUrl),
      supportReferenceError: refs?.supportReferenceError ?? null,
      productReferenceRequired: storyScene.sceneId === "scene-2" || storyScene.sceneId === "scene-4",
      characterReferenceRequired: storyScene.sceneId === "scene-1" || storyScene.sceneId === "scene-3" || storyScene.sceneId === "scene-5",
      productFidelityRequirement: promptScene?.productFidelityRequirement ?? executionScene?.productFidelityRequirement ?? null,
      productGenerationStrategy: executionScene?.productGenerationStrategy ?? null,
      overlayInstructions: promptScene?.overlayInstructions ?? executionScene?.overlayInstructions ?? null,
    };
  });

  const structureChecks = storyboard.scenes.map((scene) => {
    const expected = EXPECTED_STRUCTURE[scene.sceneId];
    const actualPresenter = presenterKind(scene);
    const actualPurpose = normalizePurpose(scene.sceneId, scene.purpose);
    return {
      sceneId: scene.sceneId,
      expectedPresenter: expected?.presenter ?? null,
      actualPresenter,
      presenterOk: expected ? actualPresenter === expected.presenter : false,
      expectedPurpose: expected?.purpose ?? null,
      actualPurpose,
      purposeOk: expected ? actualPurpose === expected.purpose : false,
    };
  });

  const narrationExactChecks = storyboard.scenes.map((scene) => ({
    sceneId: scene.sceneId,
    expected: EXPECTED_NARRATION[scene.sceneId] ?? null,
    actual: scene.spokenNarration,
    exact: scene.spokenNarration === EXPECTED_NARRATION[scene.sceneId],
  }));

  const scene2 = storyboard.scenes.find((scene) => scene.sceneId === "scene-2");
  const scene4 = storyboard.scenes.find((scene) => scene.sceneId === "scene-4");
  const scene4Prompt = promptPlan.scenes.find((scene) => scene.sceneId === "scene-4");

  const creativeContractValid =
    storyboard.contract?.creationMode === "HYBRID_SALES" &&
    storyboard.creationTrace?.resolvedCreationMode === "HYBRID_SALES" &&
    structureChecks.every((entry) => entry.presenterOk && entry.purposeOk) &&
    narrationExactChecks.every((entry) => entry.exact);

  const groundingReady =
    Boolean(offer.image_url) &&
    generationRows.filter((entry) => entry.productReferenceRequired).every((entry) => entry.productReferenceResolved) &&
    narrationExactChecks.every((entry) => entry.exact);

  const offerCheck = {
    price: offer.price,
    expectedPrice: 13.16,
    priceText: currency(offer.price),
    expectedPriceText: "R$ 13,16",
    priceOk: Number(offer.price) === 13.16,
    discount_pct: offer.discount_pct,
    discountPctOk: Number(offer.discount_pct ?? 0) === 0,
    scene4Overlay: scene4?.overlay ?? null,
    deterministicOverlayOk:
      (scene4?.overlay ?? "").includes("R$ 13,16") ||
      scene4Prompt?.overlayInstructions?.priceText === "R$ 13,16",
    discountText: scene4Prompt?.overlayInstructions?.discountText ?? null,
    discountTextOk: (scene4Prompt?.overlayInstructions?.discountText ?? null) === null,
    providerGeneratedPriceBlocked: true,
  };

  const productReferenceGate =
    generationRows
      .filter((entry) => entry.productReferenceRequired)
      .every((entry) => entry.productReferenceResolved && entry.productFidelityRequirement === "REQUIRED") &&
    (scene2?.productUse ?? "").toLowerCase().includes("product fidelity") &&
    (scene2?.productUse ?? "").toLowerCase().includes("sem promessa") &&
    (scene2?.productUse ?? "").toLowerCase().includes("sem produto flutuando");

  const characterReferenceGate = generationRows
    .filter((entry) => entry.characterReferenceRequired)
    .every((entry) => entry.identityReferenceResolved && entry.supportReferenceResolved);

  const providerCoverageReady = generationRows.every((entry) => entry.productionEligible && entry.providerStatus === "ACTIVE");
  const costEstimationValid = generationRows.every(
    (entry) =>
      entry.action === "REUSE" ||
      entry.estimatedCredits !== null ||
      entry.estimatedUsdCostCents !== null,
  );
  const narrationTimingValid = narrationTiming.every((entry) => entry.status === "READY" && entry.tailMarginSafe);
  const claimSafetyPass = claimViolations.length === 0;
  const persuasionPass = persuasionStatus === "PASS";
  const promptIntegrityValid = promptPlanMatchesStoryboard.ok;

  const totals = {
    KLING_CREDITS: generationRows
      .filter((entry) => entry.provider === "freepik-kling-i2v")
      .reduce((sum, entry) => sum + (entry.estimatedCredits ?? 0), 0),
    WAN_CREDITS: generationRows
      .filter((entry) => entry.provider === "wan-2-5-t2v")
      .reduce((sum, entry) => sum + (entry.estimatedCredits ?? 0), 0),
    HEYGEN_USD: Number(
      (
        generationRows
          .filter((entry) => entry.provider === "heygen-image-avatar")
          .reduce((sum, entry) => sum + (entry.estimatedUsdCostCents ?? 0), 0) / 100
      ).toFixed(2),
    ),
    ELEVENLABS_CREDITS: narrationTiming.reduce((sum, entry) => sum + entry.elevenLabsCredits, 0),
  };

  const gates = [
    { gate: "Creative Contract valid", pass: creativeContractValid },
    { gate: "Approval fingerprint valid", pass: approvalFingerprintValid },
    { gate: "Grounding ready", pass: groundingReady },
    { gate: "ClaimSafety PASS", pass: claimSafetyPass },
    { gate: "Persuasion PASS", pass: persuasionPass },
    { gate: "Product references resolved", pass: productReferenceGate },
    { gate: "Character refs resolved", pass: characterReferenceGate },
    { gate: "Provider coverage ready", pass: providerCoverageReady },
    { gate: "Cost estimation valid", pass: costEstimationValid },
    { gate: "Narration timing valid", pass: narrationTimingValid },
    { gate: "Prompt/storyboard narration unchanged", pass: promptIntegrityValid },
    { gate: "Final video encoder ready", pass: finalVideoEncoder.ready },
  ];

  const blockingReasons = gates.filter((entry) => !entry.pass).map((entry) => entry.gate);
  blockingReasons.push(...promptPlanMatchesStoryboard.reasons);
  if (!executionReadiness.canProduceFinalCommercial) {
    blockingReasons.push(`Execution Readiness: ${executionReadiness.status}`);
  }

  const finalSceneTable = storyboard.scenes.map((scene) => {
    const generation = generationRows.find((entry) => entry.sceneId === scene.sceneId);
    const narration = narrationTiming.find((entry) => entry.sceneId === scene.sceneId);
    return {
      sceneId: scene.sceneId,
      role: presenterKind(scene),
      purpose: normalizePurpose(scene.sceneId, scene.purpose),
      narration: scene.spokenNarration,
      visualIntent: scene.productUse,
      timelineDuration: scene.durationSeconds,
      provider: generation?.provider ?? null,
      capability: generation?.capability ?? null,
      billableDuration: generation?.billableDuration ?? null,
      action: generation?.action ?? "GENERATE",
      videoCost: {
        klingCredits: generation?.provider === "freepik-kling-i2v" ? generation.estimatedCredits : null,
        wanCredits: generation?.provider === "wan-2-5-t2v" ? generation.estimatedCredits : null,
        heygenUsd: generation?.provider === "heygen-image-avatar" ? Number(((generation.estimatedUsdCostCents ?? 0) / 100).toFixed(2)) : null,
      },
      narrationTiming: {
        characters: narration?.characters ?? null,
        estimatedSpeechDuration: narration?.estimatedSpeechDuration ?? null,
        sceneDuration: narration?.sceneDuration ?? null,
        tailMargin: narration?.tailMargin ?? null,
        elevenLabsCredits: narration?.elevenLabsCredits ?? null,
      },
      overlay: generation?.overlayInstructions ?? null,
    };
  });

  const report = {
    reportName: "FIRST_USER_APPROVED_COMMERCIAL_CANARY_FINAL_COST_PREFLIGHT",
    generatedAt: new Date().toISOString(),
    campaignId: CAMPAIGN_ID,
    mode: "READ_ONLY_PREFLIGHT",
    items: {
      "1_approval": {
        approvalStatus,
        approvedStoryboardFingerprint,
        currentStoryboardFingerprint,
        approvalFingerprintValid,
      },
      "2_creative_immutability": {
        creativeRegenerated: false,
        storyboardAltered: false,
        promptPlanMatchesStoryboard,
      },
      "3_scene_generation_plan": generationRows,
      "4_narration_exact": narrationExactChecks,
      "5_narration_timing": {
        planStatus: exactNarrationPlan.status,
        quality: narrationQuality,
        scenes: narrationTiming,
      },
      "6_product_references": {
        scene2ProductReferenceRequiredAndResolved: generationRows.find((entry) => entry.sceneId === "scene-2")?.productReferenceResolved ?? false,
        scene4ProductReferenceRequiredAndResolved: generationRows.find((entry) => entry.sceneId === "scene-4")?.productReferenceResolved ?? false,
        scene1_3_5ProductVisualRequired: false,
        scene1_3_5CharacterIdentityRequired: true,
      },
      "7_offer": offerCheck,
      "8_cost_separated_units": totals,
      "9_reusable_assets": {
        previousExecuteJobsChecked: previousJobsResult.jobs.length,
        previousExecuteJobsError: previousJobsResult.error,
        scenes: sceneReuse,
        narration: narrationReuse,
      },
      "10_execution_readiness_gates": gates,
      "11_execution_readiness": executionReadiness,
      "12_creationMode": storyboard.contract?.creationMode ?? null,
      "13_structure": structureChecks,
      "14_scene2_visual": {
        visual: scene2?.visual ?? null,
        productUse: scene2?.productUse ?? null,
        productFidelityNoFloatingNoClaimsOk: productReferenceGate,
      },
      "15_scene4_overlay": {
        visual: scene4?.visual ?? null,
        productUse: scene4?.productUse ?? null,
        overlayInstructions: scene4Prompt?.overlayInstructions ?? null,
      },
      "16_character_continuity": generationRows
        .filter((entry) => entry.characterReferenceRequired)
        .map((entry) => ({
          sceneId: entry.sceneId,
          identityReferenceResolved: entry.identityReferenceResolved,
          supportReferenceResolved: entry.supportReferenceResolved,
          supportReferenceError: entry.supportReferenceError,
        })),
      "17_provider_calls": {
        providerCalls: 0,
        providerAttemptsBlocked: providerAttempts.length,
        providerAttemptUrls: providerAttempts,
      },
      "18_media_generation": { mediaGeneration: 0, uploads: 0 },
      "19_remote_writes": { remoteWriteAttempts },
      "20_network": {
        nonProviderNetworkCallCount: networkCalls.length - providerAttempts.length,
        nonProviderHosts: [...new Set(networkCalls.filter((url) => !providerAttempts.includes(url)).map(compactHost))],
      },
      "21_final_video_codec_policy": {
        policy: FINAL_VIDEO_CODEC_POLICY,
        finalVideoEncoder,
      },
      "22_blocking_reasons": blockingReasons,
    },
    FINAL_CREATIVE_CONTRACT_VALID: creativeContractValid ? "YES" : "NO",
    APPROVAL_FINGERPRINT_VALID: approvalFingerprintValid ? "YES" : "NO",
    NARRATION_TIMING_VALID: narrationTimingValid ? "YES" : "NO",
    FINAL_VIDEO_ENCODER_READY: finalVideoEncoder.ready ? "YES" : "NO",
    READY_FOR_USER_APPROVED_PAID_EXECUTION:
      blockingReasons.length === 0 &&
      executionReadiness.canProduceFinalCommercial &&
      providerAttempts.length === 0 &&
      remoteWriteAttempts === 0
        ? "YES"
        : "NO",
    finalSceneTable,
    providerCalls: 0,
    mediaGeneration: 0,
    uploads: 0,
    remoteWriteAttempts,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nRelatorio salvo em: ${path.relative(root, OUT_FILE)}`);
  console.log(`READY_FOR_USER_APPROVED_PAID_EXECUTION = ${report.READY_FOR_USER_APPROVED_PAID_EXECUTION}`);
}

if (require.main === module) {
  main().catch((error) => {
    const report = buildAbortReport(error instanceof Error ? error.message : String(error), {});
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2), "utf8");
    console.error(error);
    console.log(`\nRelatorio salvo em: ${path.relative(root, OUT_FILE)}`);
    console.log("READY_FOR_USER_APPROVED_PAID_EXECUTION = NO");
    process.exitCode = 1;
  });
}

module.exports = {
  checkPromptPlanMatchesStoryboard,
};
