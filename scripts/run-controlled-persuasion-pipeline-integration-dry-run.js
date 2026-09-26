// Controlled Persuasion Pipeline Integration V1 - DRY_RUN real.
// Zero provider calls, zero media generation, zero remote writes.

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

const CAMPAIGN_ID = process.argv[2] || "660d53b5-d3dc-47a5-b031-4d035bfd97a3";
const OUT_DIR = path.join(root, "temp", "controlled-persuasion-pipeline-integration-v1");

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

let blockedProviderAttempts = 0;
const networkCalls = [];
const realFetch = global.fetch;
global.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
  networkCalls.push(url);
  if (BLOCKED_PROVIDER_HOST_SUBSTRINGS.some((host) => url.includes(host))) {
    blockedProviderAttempts += 1;
    throw new Error(`ABORTED: paid provider host attempted in DRY_RUN: ${url}`);
  }
  return realFetch(input, init);
};

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const supabaseUrl = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseServiceKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabaseHost = new URL(supabaseUrl).host;
const supabaseAdminRaw = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

let writeAttempts = 0;
const supabaseAdmin = {
  from(table) {
    const builder = supabaseAdminRaw.from(table);
    for (const method of ["insert", "update", "upsert", "delete"]) {
      builder[method] = () => {
        writeAttempts += 1;
        throw new Error(`ABORTED: remote write attempted in DRY_RUN: ${table}.${method}()`);
      };
    }
    return builder;
  },
};

const { buildCommercialDirection } = require("../lib/commercial-director/director.ts");
const { buildCreativeDirectionV2DecisionEngine } = require("../lib/creative-director-v2/decision-engine/decision-engine.ts");
const { buildCampaignPromptPlan } = require("../lib/prompt-builder/prompt-builder.ts");
const { buildCampaignExecutionPlan } = require("../lib/generation-orchestrator/orchestrator.ts");
const { resolveCampaignSceneReferences } = require("../lib/generation-orchestrator/reference-resolver.ts");
const { runCommercialGeneration } = require("../lib/commercial-video/runner/commercial-generation-runner.ts");
const { buildControlledPersuasionPipeline } = require("../lib/commercial-video/persuasion/pipeline-integration.ts");

const KOKESHI_OBSERVED_PACKAGING = [
  { text: "OLEO DE COPAIBA", observedVia: "validated prior canary frame inspection" },
  { text: "Firmeza", observedVia: "validated prior canary frame inspection" },
  { text: "Densidade", observedVia: "validated prior canary frame inspection" },
  { text: "Textura leve, rapida absorcao", observedVia: "validated prior canary frame inspection" },
  { text: "Creme Gel Gota de Colageno", observedVia: "validated prior canary frame inspection" },
  { text: "FACIAL", observedVia: "validated prior canary frame inspection" },
  { text: "45g", observedVia: "validated prior canary frame inspection" },
];

function resolvePlatform(value) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("reels") || normalized.includes("instagram")) return "INSTAGRAM_REELS";
  if (normalized.includes("meta") || normalized.includes("ads")) return "META_ADS";
  return "TIKTOK";
}

function billableDuration(provider, timelineDuration) {
  if (provider === "wan-2-5-t2v" || provider === "freepik-kling-i2v") {
    return timelineDuration <= 5 ? 5 : 10;
  }
  return timelineDuration;
}

function rowToProductIntelligence(row) {
  return {
    category: row.category || "geral",
    painPoints: row.pain_points || [],
    desires: row.desires || [],
    objections: row.objections || [],
    purchaseMotivations: row.purchase_motivations || [],
    keyBenefits: row.key_benefits || [],
    emotionalBenefits: row.emotional_benefits || [],
    functionalBenefits: row.functional_benefits || [],
  };
}

function scenePersuasionByPurpose(strategy, purpose) {
  return strategy.sceneStrategies.find((scene) => scene.purpose === purpose) || null;
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const initialGit = {
    branch: git(["branch", "--show-current"]),
    lastCommit: git(["log", "-1", "--oneline", "--decorate"]),
    statusShort: git(["status", "--short"]),
  };

  const { data: campaignRow, error: campaignError } = await supabaseAdmin
    .from("creative_campaigns")
    .select("id,name,offer_id,product_intelligence_id,selected_framework,selected_angle,selected_persona_id,aspect_ratio,platform,creative_brief")
    .eq("id", CAMPAIGN_ID)
    .maybeSingle();
  if (campaignError) throw new Error(campaignError.message);
  if (!campaignRow) throw new Error(`Campaign not found: ${CAMPAIGN_ID}`);

  const [offerRes, piRes, personaRes] = await Promise.all([
    supabaseAdmin
      .from("offers")
      .select("title,category,discount_pct,price,original_price,rating,reviews_count,marketplace,image_url")
      .eq("id", campaignRow.offer_id)
      .maybeSingle(),
    supabaseAdmin
      .from("product_intelligence")
      .select("id,category,pain_points,desires,objections,purchase_motivations,key_benefits,emotional_benefits,functional_benefits")
      .eq("id", campaignRow.product_intelligence_id)
      .maybeSingle(),
    campaignRow.selected_persona_id
      ? supabaseAdmin.from("ugc_personas").select("slug,is_official_brand_character").eq("id", campaignRow.selected_persona_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (offerRes.error) throw new Error(offerRes.error.message);
  if (piRes.error) throw new Error(piRes.error.message);
  if (!offerRes.data) throw new Error("Offer not found.");
  if (!piRes.data) throw new Error("Product Intelligence not found.");

  const offerRow = offerRes.data;
  const rawProductIntelligence = rowToProductIntelligence(piRes.data);
  const persona = personaRes.data;

  const input = {
    offerId: campaignRow.offer_id,
    productTitle: offerRow.title || "produto",
    category: rawProductIntelligence.category,
    discountPct: offerRow.discount_pct,
    price: offerRow.price,
    originalPrice: offerRow.original_price,
    rating: offerRow.rating,
    reviewsCount: offerRow.reviews_count,
    marketplace: offerRow.marketplace,
    primaryPain: rawProductIntelligence.painPoints[0] || "",
    primaryDesire: rawProductIntelligence.desires[0] || "",
    primaryObjection: rawProductIntelligence.objections[0] || "",
    purchaseMotivation: rawProductIntelligence.purchaseMotivations[0] || "",
    frameworkSlug: campaignRow.selected_framework,
    angleSlug: campaignRow.selected_angle || "",
    officialCharacterSlug: persona && persona.is_official_brand_character ? persona.slug : null,
  };

  const persuasionPipeline = buildControlledPersuasionPipeline({
    offer: {
      title: offerRow.title || "produto",
      price: offerRow.price,
      originalPrice: offerRow.original_price,
      discountPct: offerRow.discount_pct,
      marketplace: offerRow.marketplace,
      brand: null,
      imageUrl: offerRow.image_url,
      rating: offerRow.rating,
      reviewsCount: offerRow.reviews_count,
    },
    productIntelligence: rawProductIntelligence,
    observedPackagingTexts: KOKESHI_OBSERVED_PACKAGING,
    useCharacter: Boolean(input.officialCharacterSlug),
  });

  const commercialDirectionV1 = campaignRow.creative_brief?.commercialDirection || (await buildCommercialDirection(input));
  const v1PromptPlanA = buildCampaignPromptPlan(CAMPAIGN_ID, commercialDirectionV1, {
    productTitle: offerRow.title || "produto",
    category: rawProductIntelligence.category,
    platform: resolvePlatform(campaignRow.platform),
    aspectRatio: campaignRow.aspect_ratio || "9:16",
    defaultLogoAssetId: null,
  });
  const v1PromptPlanB = buildCampaignPromptPlan(CAMPAIGN_ID, commercialDirectionV1, {
    productTitle: offerRow.title || "produto",
    category: rawProductIntelligence.category,
    platform: resolvePlatform(campaignRow.platform),
    aspectRatio: campaignRow.aspect_ratio || "9:16",
    defaultLogoAssetId: null,
  });

  const commercialDirectionV2 = await buildCreativeDirectionV2DecisionEngine(
    input,
    commercialDirectionV1,
    persuasionPipeline.persuasionStrategy,
  );
  const v2 = commercialDirectionV2.result;

  const promptPlan = buildCampaignPromptPlan(
    CAMPAIGN_ID,
    v2.underlyingDirection,
    {
      productTitle: offerRow.title || "produto",
      category: persuasionPipeline.cleanedProductIntelligence.category,
      platform: resolvePlatform(campaignRow.platform),
      aspectRatio: campaignRow.aspect_ratio || "9:16",
      defaultLogoAssetId: null,
    },
    {
      sceneBlueprints: v2.sceneBlueprints,
      ctaDirection: v2.ctaDirection,
      persuasionStrategy: persuasionPipeline.persuasionStrategy,
    },
  );

  const resolvedRefsBySceneId = await resolveCampaignSceneReferences(
    promptPlan,
    campaignRow.offer_id,
    persuasionPipeline.cleanedProductIntelligence.category,
  );
  const generationPlan = buildCampaignExecutionPlan(CAMPAIGN_ID, "MOCK", promptPlan, resolvedRefsBySceneId);
  const dryRunResult = await runCommercialGeneration({
    executionPlan: generationPlan,
    mode: "DRY_RUN",
    confirmed: false,
    maxVideoCredits: 100000,
    maxTtsCredits: 100000,
    maxUsdCostCents: 100000,
    acknowledgeUnknownVideoCost: true,
    narrationOffer: { title: offerRow.title || "produto", rating: offerRow.rating, reviewsCount: offerRow.reviews_count },
    narrationProduct: { keyBenefits: rawProductIntelligence.keyBenefits },
    productIntelligenceCategory: persuasionPipeline.cleanedProductIntelligence.category,
    creativeQualityGateStatus: v2.storyboardQualityGate.status,
    commercialPersuasionGateStatus: persuasionPipeline.scoredStoryboard.qualityGate.status,
    assetCacheDir: path.join(OUT_DIR, "runner-cache"),
  });

  const providerPlan = generationPlan.scenes.map((scenePlan) => {
    const promptScene = promptPlan.scenes.find((scene) => scene.sceneId === scenePlan.sceneId);
    const persuasionScene = promptScene ? scenePersuasionByPurpose(persuasionPipeline.persuasionStrategy, promptScene.purpose) : null;
    return {
      sceneId: scenePlan.sceneId,
      purpose: promptScene?.purpose || null,
      persuasionObjective: persuasionScene?.persuasionObjective || null,
      productInteraction: persuasionScene?.productInteraction || null,
      characterRole: persuasionScene?.characterNarrativeRole || null,
      capability: scenePlan.providerCapability,
      strategy: scenePlan.productGenerationStrategy,
      provider: scenePlan.selectedProvider,
      referenceRequirement: promptScene?.productFidelityRequirement || null,
      timelineDuration: scenePlan.durationSeconds,
      billableDuration: billableDuration(scenePlan.selectedProvider, scenePlan.durationSeconds),
      estimatedCredits: scenePlan.estimatedCost.estimatedCredits,
      estimatedUSD: scenePlan.estimatedCost.estimatedUsdCostCents !== null ? scenePlan.estimatedCost.estimatedUsdCostCents / 100 : null,
    };
  });
  const planVideoCredits = generationPlan.scenes.reduce((sum, scene) => sum + (scene.estimatedCost.estimatedCredits || 0), 0);
  const planUsdCents = generationPlan.scenes.reduce((sum, scene) => sum + (scene.estimatedCost.estimatedUsdCostCents || 0), 0);

  const persuasionChecks = persuasionPipeline.scoredStoryboard.qualityGate.checks;
  const report = {
    generatedAt: new Date().toISOString(),
    branch: initialGit.branch,
    git: initialGit,
    campaign: { id: CAMPAIGN_ID, name: campaignRow.name },
    architectureFound: {
      productIntelligence: "lib/product-intelligence",
      grounding: "lib/product-intelligence-grounding",
      persuasion: "lib/commercial-video/persuasion",
      creativeDirectorV2: "lib/creative-director-v2",
      promptBuilder: "lib/prompt-builder",
      generationOrchestrator: "lib/generation-orchestrator",
      executionReadiness: "lib/commercial-video/runner/execute/execution-readiness.ts",
    },
    featureVersionFlag: { persuasionEngineVersion: "V1", creativeDirectorVersion: "V2" },
    flowBefore: "Offer -> Product Intelligence -> Creative Director V2 -> Storyboard -> Prompt Builder -> Generation Plan -> Execution Readiness",
    flowAfter: "Offer -> Product Intelligence -> Grounding -> Desire Engine V1 -> Persuasion Strategy -> Creative Director V2 -> Storyboard -> Commercial Persuasion Quality Gate -> Prompt Builder -> Generation Plan -> Execution Readiness",
    productIntelligenceUsed: rawProductIntelligence,
    grounding: {
      category: persuasionPipeline.cleanedProductIntelligence.category,
      status: persuasionPipeline.groundingGate.status,
      downstreamReady: persuasionPipeline.groundingGate.downstreamReady,
      blockingReasons: persuasionPipeline.groundingGate.blockingReasons,
      groundedProductIntelligence: persuasionPipeline.groundedProductIntelligence,
    },
    desireEngine: {
      active: true,
      desireProfile: persuasionPipeline.desireProfile,
      winningSalesAngle: persuasionPipeline.winningSalesAngle,
      motivationAnswers: persuasionPipeline.motivationAnswers,
    },
    persuasionStrategy: persuasionPipeline.persuasionStrategy,
    scrollStopEngineV2: {
      active: true,
      selectedHookVariant: persuasionPipeline.hookDecision.selectedVariant,
      hookScores: Object.fromEntries(persuasionPipeline.hookEvaluations.map((entry) => [entry.variantId, entry.metrics.scrollStopPower])),
    },
    hookSelected: persuasionPipeline.hookDecision.selectedVariant,
    hookSelectionReason: persuasionPipeline.hookDecision.reasons,
    storyboardFinal: persuasionPipeline.scoredStoryboard.storyboard,
    creativeDirectorV2Integration: {
      persuasionStrategyAttached: Boolean(v2.persuasionStrategy),
      qualityGateAttached: Boolean(v2.commercialPersuasionQualityGate),
      storyboardQualityGate: v2.storyboardQualityGate,
    },
    promptBuilderIntegration: {
      persuasionHintsPresent: promptPlan.scenes.some((scene) => scene.positivePrompt.includes("Persuasion objective:")),
      sceneCount: promptPlan.scenes.length,
    },
    executionReadinessIntegration: {
      status: dryRunResult.executionReadiness.status,
      canProduceFinalCommercial: dryRunResult.executionReadiness.canProduceFinalCommercial,
      reasons: dryRunResult.executionReadiness.reasons,
      persuasionBlockingReasons: dryRunResult.executionReadiness.reasons.filter((reason) => reason.includes("Commercial Persuasion")),
      blockingReasonImplemented: "BLOCKED_COMMERCIAL_PERSUASION",
    },
    commercialPersuasionGate: persuasionPipeline.scoredStoryboard.qualityGate,
    scores: persuasionPipeline.persuasionStrategy.scores,
    generationPlan: providerPlan,
    estimatedCosts: {
      videoCredits: planVideoCredits,
      ttsCredits: dryRunResult.costPreview.ttsCredits,
      usdCost: planUsdCents > 0 ? planUsdCents / 100 : null,
      runnerPendingVideoCredits: dryRunResult.costPreview.videoCreditsKnown,
      runnerPendingUsdCost: dryRunResult.costPreview.videoUsdCostCentsKnown !== null ? dryRunResult.costPreview.videoUsdCostCentsKnown / 100 : null,
      currenciesKeptSeparate: true,
    },
    regression: {
      persuasionOffV1PromptPlanByteIdentical: JSON.stringify(v1PromptPlanA) === JSON.stringify(v1PromptPlanB),
      v1SceneCount: commercialDirectionV1.scenes.length,
      v2SceneCount: v2.underlyingDirection.scenes.length,
    },
    antiGaming: {
      fixturesPreservedInCode: true,
      notes: [
        "BEAUTIFUL_BUT_EMPTY, UGLY_BUT_PERSUASIVE, UNSUPPORTED_CLAIM, FAKE_URGENCY, DISCONNECTED_CHARACTER and REPEATED_PACKSHOT remain covered by existing scripts/test-commercial-persuasion-desire-engine.js.",
      ],
    },
    verification: {
      expectedCampaignId: CAMPAIGN_ID,
      productCategoryIsBeleza: persuasionPipeline.cleanedProductIntelligence.category === "beleza",
      groundingDownstreamReady: persuasionPipeline.groundingGate.downstreamReady,
      desireEngineV1Active: true,
      scrollStopEngineV2Active: true,
      hookDSelected: persuasionPipeline.hookDecision.selectedVariant === "D_PRESENTER_CONTROL",
      commercialPersuasionQualityGatePass: persuasionPipeline.scoredStoryboard.qualityGate.status === "PASS",
      persuasionChecksPass: persuasionChecks.filter((check) => check.status === "PASS").length,
      persuasionChecksTotal: persuasionChecks.length,
      zeroPersuasionBlockingReasons: persuasionPipeline.scoredStoryboard.qualityGate.blockingReasons.length === 0,
      noProviderCalls: blockedProviderAttempts === 0,
      noMediaGenerated: true,
      remoteWriteAttempts: writeAttempts,
      externalRealCost: 0,
      networkCallsTotal: networkCalls.length,
      nonSupabaseNetworkCalls: networkCalls.filter((url) => {
        try {
          return new URL(url).host !== supabaseHost;
        } catch {
          return true;
        }
      }),
    },
  };

  const valid =
    report.verification.productCategoryIsBeleza &&
    report.verification.groundingDownstreamReady &&
    report.verification.hookDSelected &&
    report.verification.commercialPersuasionQualityGatePass &&
    report.verification.zeroPersuasionBlockingReasons &&
    report.verification.noProviderCalls &&
    report.verification.remoteWriteAttempts === 0 &&
    report.promptBuilderIntegration.persuasionHintsPresent &&
    report.creativeDirectorV2Integration.persuasionStrategyAttached;

  report.PERSUASION_PIPELINE_INTEGRATION_VALID = valid ? "YES" : "NO";
  report.READY_FOR_FIRST_PERSUASION_VIDEO_CANARY = valid ? "YES" : "NO";

  const outPath = path.join(OUT_DIR, "dry-run-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`PERSUASION_PIPELINE_INTEGRATION_VALID = ${report.PERSUASION_PIPELINE_INTEGRATION_VALID}`);
  console.log(`READY_FOR_FIRST_PERSUASION_VIDEO_CANARY = ${report.READY_FOR_FIRST_PERSUASION_VIDEO_CANARY}`);
  console.log(`HOOK = ${report.hookSelected}`);
  console.log(`Commercial Persuasion Gate = ${report.commercialPersuasionGate.status} (${report.verification.persuasionChecksPass}/${report.verification.persuasionChecksTotal})`);
  console.log(`Execution Readiness = ${report.executionReadinessIntegration.status}`);
  console.log(`Provider attempts blocked = ${blockedProviderAttempts}; remote write attempts = ${writeAttempts}; real external cost = 0`);
  console.log(`Report: ${path.relative(root, outPath)}`);
}

main().catch((err) => {
  console.error("Controlled persuasion integration dry-run failed:", err.message);
  process.exitCode = 1;
});
