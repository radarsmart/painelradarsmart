// Radar Creative AI - COMMERCIAL V2 FULL CANARY - FINAL PRE-FLIGHT
//
// 100% DRY_RUN/leitura - ZERO chamadas a provider pago (WAN/Kling/HeyGen/
// ElevenLabs/OpenAI), ZERO escrita no Supabase. Reusa o resultado JA PAGO
// do CREATIVE V2 HOOK FIDELITY CANARY (scene-1, taskId
// 17ab385c-bf07-4a0b-a86d-a47f7cfa9844, vídeo já baixado localmente em
// temp/creative-v2-hook-fidelity-canary/kling-original-5s.mp4) como
// candidato de reuso real, testado pelo resolver de producao de verdade
// (resolveRealSceneAssets) - nunca reimplementado.

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

// Blocklist - bloqueia QUALQUER host de provider pago. Nao precisamos
// permitir nenhum host de CDN de provider aqui (o unico asset ja pago que
// reusamos ja esta em disco local - nunca rebaixado da URL efemera do
// Freepik). So Supabase + a imagem real do produto (dimensoes) passam.
const BLOCKED_PROVIDER_HOST_SUBSTRINGS = [
  "api.magnific.com",
  "api.freepik.com",
  "cdn-magnific.freepik.com",
  "heygen",
  "elevenlabs",
  "api.openai.com",
  "klingai.com",
  "runwayml",
  "replicate",
];

const realFetch = global.fetch;
let blockedAttempts = 0;
let networkCallCount = 0;
global.fetch = async (url, options) => {
  const urlString = String(url);
  if (BLOCKED_PROVIDER_HOST_SUBSTRINGS.some((host) => urlString.includes(host))) {
    blockedAttempts += 1;
    throw new Error(`BLOQUEADO (guardrail de rede): tentativa de chamar host de provider pago "${urlString}".`);
  }
  networkCallCount += 1;
  return realFetch(url, options);
};

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { buildCommercialDirection } = require("../lib/commercial-director/director.ts");
const { buildCreativeDirectionV2DecisionEngine } = require("../lib/creative-director-v2/decision-engine/decision-engine.ts");
const { runCreativeValidation } = require("../lib/creative-director-v2/validation/validation-orchestrator.ts");
const { buildCampaignPromptPlan } = require("../lib/prompt-builder/prompt-builder.ts");
const { resolveCampaignSceneReferences } = require("../lib/generation-orchestrator/reference-resolver.ts");
const { buildCampaignExecutionPlan } = require("../lib/generation-orchestrator/orchestrator.ts");
const { estimateSceneCost } = require("../lib/generation-orchestrator/cost-estimator.ts");
const { getProviderProfile, isProviderProductionEligible } = require("../lib/generation-orchestrator/provider-capabilities.ts");
const { computeSceneFingerprint } = require("../lib/commercial-video/runner/execute/scene-fingerprint.ts");
const { resolveRealSceneAssets, toSceneVideoPaths } = require("../lib/commercial-video/real-scene-asset-resolver.ts");
const { buildNarrationPlan } = require("../lib/commercial-video/narration/narration-script-builder.ts");
const { assessNarrationQuality } = require("../lib/commercial-video/narration/narration-quality-gate.ts");
const { evaluateCampaignExecutionReadiness } = require("../lib/commercial-video/runner/execute/execution-readiness.ts");
const { findDryRunCampaign, buildInputForCampaign } = require("./lib/creative-director-v2-fixture.js");

const CAMPAIGN_ID = "660d53b5-d3dc-47a5-b031-4d035bfd97a3";
const CANARY_B_TASK_ID = "17ab385c-bf07-4a0b-a86d-a47f7cfa9844";
const CANARY_B_LOCAL_VIDEO = path.join(root, "temp", "creative-v2-hook-fidelity-canary", "kling-original-5s.mp4");
const CANARY_B_REPORT_PATH = path.join(root, "temp", "creative-v2-hook-fidelity-canary", "hook-fidelity-canary-report.json");
const MINIMUM_NARRATION_TAIL_MARGIN_SECONDS = 0.25;

function resolvePlatform(value) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("reels") || normalized.includes("instagram")) return "INSTAGRAM_REELS";
  if (normalized.includes("meta") || normalized.includes("ads")) return "META_ADS";
  return "TIKTOK";
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" });
}

async function loadNarrationInputs(offerId, fallbackTitle) {
  const { data: offerRow } = await supabaseAdmin.from("offers").select("title,rating,reviews_count").eq("id", offerId).maybeSingle();
  const { data: piRow } = await supabaseAdmin
    .from("product_intelligence")
    .select("category,key_benefits")
    .eq("offer_id", offerId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    offer: { title: offerRow?.title ?? fallbackTitle, rating: offerRow?.rating ?? null, reviewsCount: offerRow?.reviews_count ?? null },
    product: piRow ? { keyBenefits: piRow.key_benefits ?? [] } : null,
    category: piRow?.category ?? "geral",
  };
}

async function main() {
  const campaignRow = await findDryRunCampaign(supabaseAdmin, CAMPAIGN_ID);
  const { input, offerTitle } = await buildInputForCampaign(supabaseAdmin, campaignRow);

  const { data: fullCampaign } = await supabaseAdmin
    .from("creative_campaigns")
    .select("id,name,offer_id,aspect_ratio,platform,creative_brief")
    .eq("id", CAMPAIGN_ID)
    .maybeSingle();

  const existingBrief = fullCampaign.creative_brief || {};
  const v1 = existingBrief.commercialDirection || (await buildCommercialDirection(input));
  const v2 = existingBrief.commercialDirectionV2 || (await buildCreativeDirectionV2DecisionEngine(input, v1)).result;

  const aspectRatio = fullCampaign.aspect_ratio || "9:16";
  const platform = resolvePlatform(fullCampaign.platform);
  const ctx = { productTitle: offerTitle, category: input.category, platform, aspectRatio, defaultLogoAssetId: null };

  const promptPlan = buildCampaignPromptPlan(CAMPAIGN_ID, v2.underlyingDirection, ctx, {
    sceneBlueprints: v2.sceneBlueprints,
    ctaDirection: v2.ctaDirection,
  });
  const resolvedRefs = await resolveCampaignSceneReferences(promptPlan, fullCampaign.offer_id, input.category);
  const executionPlan = buildCampaignExecutionPlan(CAMPAIGN_ID, "MOCK", promptPlan, resolvedRefs);

  // ======================================================================
  // 1. REUSE DO HOOK (scene-1)
  // ======================================================================
  const canaryBReport = fs.existsSync(CANARY_B_REPORT_PATH) ? JSON.parse(fs.readFileSync(CANARY_B_REPORT_PATH, "utf8")) : null;
  const scene1Plan = executionPlan.scenes.find((s) => s.sceneId === "scene-1");
  const scene1Prompt = promptPlan.scenes.find((s) => s.sceneId === "scene-1");

  const hookReuseChecks = canaryBReport
    ? [
        { label: "campaignId", ok: canaryBReport.campaignId === CAMPAIGN_ID },
        { label: "sceneId", ok: canaryBReport.sceneId === "scene-1" },
        { label: "hookStrategyV2", ok: canaryBReport.promptRegistered.hookStrategyV2 === v2.hookStrategy },
        { label: "productRole (HERO)", ok: canaryBReport.promptRegistered.productRole === "HERO" && canaryBReport.promptRegistered.productRole === (v2.sceneBlueprints.find((b) => b.sceneId === "scene-1")?.productRole ?? null) },
        { label: "productFidelityRequirement", ok: canaryBReport.promptRegistered.productFidelityRequirement === scene1Prompt.productFidelityRequirement },
        { label: "capability", ok: canaryBReport.capability === scene1Plan.providerCapability },
        { label: "productGenerationStrategy", ok: canaryBReport.productGenerationStrategy === scene1Plan.productGenerationStrategy },
        { label: "provider", ok: canaryBReport.canaryResult.provider === scene1Plan.selectedProvider },
        { label: "productReferenceUrl", ok: canaryBReport.productReferenceUrlUsed === scene1Plan.productReferenceUrl },
        { label: "positivePrompt (byte-a-byte)", ok: canaryBReport.promptRegistered.positivePrompt === scene1Plan.positivePrompt },
        { label: "negativePrompt (byte-a-byte)", ok: canaryBReport.promptRegistered.negativePrompt === scene1Plan.negativePrompt },
        { label: "timelineDurationSeconds", ok: canaryBReport.timelineDurationSeconds === scene1Prompt.durationSeconds },
        { label: "canaryResult.status COMPLETED", ok: canaryBReport.canaryResult.status === "COMPLETED" },
        { label: "arquivo local existe", ok: fs.existsSync(CANARY_B_LOCAL_VIDEO) },
      ]
    : [{ label: "hook-fidelity-canary-report.json encontrado", ok: false }];

  const hookReusable = hookReuseChecks.every((c) => c.ok);
  const scene1Fingerprint = computeSceneFingerprint(scene1Plan);

  let scene1AssetResolution = null;
  if (hookReusable) {
    const candidate = {
      source: "LOCAL_ASSET",
      sceneId: "scene-1",
      localPath: CANARY_B_LOCAL_VIDEO,
      durationSeconds: scene1Prompt.durationSeconds,
      quality: "PASS",
      completedAt: canaryBReport.canaryResult.completedAt,
    };
    const [resolved] = await resolveRealSceneAssets(["scene-1"], [candidate], {
      cacheDir: path.join(root, "temp", "commercial-v2-full-canary-preflight-cache"),
      productGenerationStrategyByScene: { "scene-1": scene1Plan.productGenerationStrategy },
    });
    scene1AssetResolution = resolved;
  }

  // ======================================================================
  // 2/3. TODAS AS CENAS - custo realista (cost-estimator.ts ja corrigido)
  // ======================================================================
  const allScenes = executionPlan.scenes.map((scenePlan) => {
    const promptScene = promptPlan.scenes.find((s) => s.sceneId === scenePlan.sceneId);
    const isReuse = scenePlan.sceneId === "scene-1" && hookReusable;
    const providerProfile = getProviderProfile(scenePlan.selectedProvider);
    return {
      sceneId: scenePlan.sceneId,
      purpose: promptScene.purpose,
      timelineDurationSeconds: promptScene.durationSeconds,
      capability: scenePlan.providerCapability,
      productGenerationStrategy: scenePlan.productGenerationStrategy,
      selectedProvider: scenePlan.selectedProvider,
      providerStatus: providerProfile?.status ?? null,
      productionEligible: providerProfile?.productionEligible ?? false,
      productReferenceUrl: scenePlan.productReferenceUrl,
      reuseOrGenerate: isReuse ? "REUSE" : "GENERATE",
      estimatedCredits: isReuse ? 0 : scenePlan.estimatedCost.estimatedCredits,
      estimatedUsdCostCents: isReuse ? 0 : scenePlan.estimatedCost.estimatedUsdCostCents,
      historicalCreditsAlreadySpent: isReuse ? scenePlan.estimatedCost.estimatedCredits : 0,
      status: scenePlan.status,
      statusReason: scenePlan.statusReason,
      capabilityFidelityBlocked: scenePlan.capabilityFidelityBlocked,
    };
  });

  // ======================================================================
  // 5. NARRACAO V2 (DRY_RUN, zero ElevenLabs)
  // ======================================================================
  const narrationInputs = await loadNarrationInputs(fullCampaign.offer_id, offerTitle);
  const narrationPlan = buildNarrationPlan(CAMPAIGN_ID, promptPlan, narrationInputs.offer, narrationInputs.product, narrationInputs.category);
  const narrationQuality = assessNarrationQuality(narrationPlan);
  const narrationTable = narrationPlan.scenes.map((s) => {
    const tailMargin = s.estimatedSpeechSeconds !== null ? Number((s.durationSeconds - s.estimatedSpeechSeconds).toFixed(3)) : null;
    return {
      sceneId: s.sceneId,
      purpose: s.purpose,
      status: s.status,
      characters: s.text?.length ?? 0,
      sceneDuration: s.durationSeconds,
      estimatedSpeechSeconds: s.estimatedSpeechSeconds,
      tailMargin,
      tailMarginSafe: tailMargin === null ? null : tailMargin >= MINIMUM_NARRATION_TAIL_MARGIN_SECONDS,
      reason: s.reason,
    };
  });

  // ======================================================================
  // 6. CTA (scene-5, HeyGen) - so verificacao, nao executa
  // ======================================================================
  const ctaScenePlan = executionPlan.scenes.find((s) => s.sceneId === "scene-5");
  const ctaPromptScene = promptPlan.scenes.find((s) => s.sceneId === "scene-5");
  const ctaBlueprint = v2.sceneBlueprints.find((b) => b.sceneId === "scene-5");
  const ctaProviderProfile = getProviderProfile("heygen-image-avatar");
  const ctaDetails = {
    sceneId: "scene-5",
    capability: ctaScenePlan.providerCapability,
    selectedProvider: ctaScenePlan.selectedProvider,
    providerStatus: ctaProviderProfile?.status ?? null,
    productionEligible: ctaProviderProfile?.productionEligible ?? false,
    identityReferenceAssetId: ctaPromptScene.identityReferenceAssetId,
    identityReferenceResolved: Boolean(ctaScenePlan.identityReferenceUrl),
    supportReferenceResolved: Boolean(ctaScenePlan.supportReferenceUrl),
    durationSeconds: ctaPromptScene.durationSeconds,
    estimatedUsdCostCents: ctaScenePlan.estimatedCost.estimatedUsdCostCents,
    ctaVisualAction: v2.ctaDirection.ctaVisualAction,
    ctaCharacterGesture: v2.ctaDirection.ctaCharacterGesture,
    characterRole: ctaBlueprint?.characterRole ?? null,
    voiceProfile: "GAROTA_RADAR_VOICE_PROFILE (Ana Dias) - existe em lib/commercial-video/audio/garota-radar-voice-profile.ts, nao invocado nesta tarefa",
  };

  // ======================================================================
  // 7. COMPOSITOR / 9:16 - simulacao REAL via ffmpeg (mesmo filtro do
  // Hybrid Product Compositor/Commercial Video Composer: scale-to-cover +
  // crop centralizado, nunca letterbox) sobre o video REAL ja baixado do
  // CANARY B - zero geracao nova.
  // ======================================================================
  let cropSimulation = null;
  if (fs.existsSync(CANARY_B_LOCAL_VIDEO)) {
    const cropDir = path.join(root, "temp", "commercial-v2-full-canary-preflight");
    if (!fs.existsSync(cropDir)) fs.mkdirSync(cropDir, { recursive: true });
    const croppedPath = path.join(cropDir, "hook-cropped-9x16.mp4");
    // Mesmo filtro EXATO de lib/compositor/hybrid-product-compositor.ts /
    // lib/commercial-video/commercial-video-composer.ts (buildScenePrepareFilterGraph).
    run("ffmpeg", ["-y", "-i", CANARY_B_LOCAL_VIDEO, "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1", "-an", croppedPath]);

    const framesDir = path.join(cropDir, "frames");
    if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });
    const cropFramePaths = [0, 0.5, 1].map((pct, i) => {
      const t = pct === 1 ? 4.9 : pct * 5;
      const framePath = path.join(framesDir, `crop-frame-${i}-${Math.round(pct * 100)}pct.png`);
      run("ffmpeg", ["-y", "-ss", String(t), "-i", croppedPath, "-frames:v", "1", framePath]);
      return framePath;
    });

    cropSimulation = {
      sourceDimensions: "1440x1440",
      targetDimensions: "1080x1920",
      ffmpegFilter: "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1",
      cropMathOriginalSpace: "scale factor 1.3333 -> scaled 1920x1920 -> crop centralizado 1080x1920 -> em pixels ORIGINAIS (1440x1440): mantem x=[315,1125] (810px, 56.25% central da largura), altura inteira preservada",
      croppedVideoPath: path.relative(root, croppedPath),
      croppedFrames: cropFramePaths.map((p) => path.relative(root, p)),
    };
  }

  // ======================================================================
  // 8. CREATIVE QUALITY GATE (recomputado ao vivo, nao reaproveitado de
  // memoria antiga)
  // ======================================================================
  const validation = runCreativeValidation(v1, v2);
  const qualityGateChecks = {
    hookScore: { value: validation.hookScore, threshold: 75, pass: validation.hookScore >= 75 },
    productFirstScore: { value: validation.productFirstScore, threshold: 75, pass: validation.productFirstScore >= 75 },
    creativeDensityScore: { value: validation.creativeDensityScore, threshold: 75, pass: validation.creativeDensityScore >= 75 },
    commercialArcScore: { value: validation.commercialArcScore, threshold: 80, pass: validation.commercialArcScore >= 80 },
    sceneRedundancyRisk: { value: validation.sceneRedundancyRisk, threshold: "LOW", pass: validation.sceneRedundancyRisk === "LOW" },
    genericAdRisk: { value: validation.genericAdRisk, threshold: "LOW", pass: validation.genericAdRisk === "LOW" },
    cinematicBenchmarkScore: { value: validation.cinematicBenchmarkScore, threshold: 75, pass: validation.cinematicBenchmarkScore >= 75 },
  };
  const qualityGateAllPass = Object.values(qualityGateChecks).every((c) => c.pass);

  // ======================================================================
  // 9. FULL CANARY READINESS
  // ======================================================================
  const compositionBlocked = cropSimulation === null;
  const blockingReasons = [];
  if (!hookReusable) blockingReasons.push("HOOK (scene-1) nao pode ser reutilizado - checklist de reuso falhou.");
  if (narrationPlan.status === "BLOCKED") blockingReasons.push("NarrationPlan V2 esta BLOCKED.");
  if (narrationTable.some((s) => s.tailMarginSafe === false)) blockingReasons.push("Ao menos uma cena tem tailMargin de narracao abaixo do minimo seguro (0.25s) - risco de audio truncado.");
  if (!qualityGateAllPass) blockingReasons.push("Storyboard Quality Gate V2 nao atinge todos os limiares exigidos para este Full Canary.");
  if (compositionBlocked) blockingReasons.push("BLOCKED_COMPOSITION - simulacao de crop 9:16 nao pode ser executada.");
  const scenesNotReady = allScenes.filter((s) => s.status !== "READY");
  if (scenesNotReady.length > 0) blockingReasons.push(`Cena(s) com status != READY: ${scenesNotReady.map((s) => s.sceneId).join(", ")}.`);

  const readiness = blockingReasons.length === 0 ? "READY" : "BLOCKED";

  // ======================================================================
  // 10. LIMITES SUGERIDOS - so NOVAS chamadas (scene-1 excluida, ja paga)
  // ======================================================================
  const newGenerateScenes = allScenes.filter((s) => s.reuseOrGenerate === "GENERATE");
  const newKlingCredits = newGenerateScenes.filter((s) => s.selectedProvider === "freepik-kling-i2v").reduce((sum, s) => sum + (s.estimatedCredits ?? 0), 0);
  const newWanCredits = newGenerateScenes.filter((s) => s.selectedProvider === "wan-2-5-t2v").reduce((sum, s) => sum + (s.estimatedCredits ?? 0), 0);
  const newHeygenUsdCents = newGenerateScenes.filter((s) => s.selectedProvider === "heygen-image-avatar").reduce((sum, s) => sum + (s.estimatedUsdCostCents ?? 0), 0);
  const newElevenLabsCredits = narrationPlan.estimatedCredits;

  const historicalKlingCredits = allScenes.filter((s) => s.reuseOrGenerate === "REUSE").reduce((sum, s) => sum + (s.historicalCreditsAlreadySpent ?? 0), 0);

  const report = {
    generatedAt: new Date().toISOString(),
    campaignId: CAMPAIGN_ID,
    mode: "DRY_RUN_READ_ONLY",
    section1_hookReuse: {
      canaryBTaskId: CANARY_B_TASK_ID,
      checks: hookReuseChecks,
      hookReusable,
      currentSceneFingerprint: scene1Fingerprint,
      scene1AssetResolution,
      NEW_KLING_CALLS_scene1: hookReusable ? 0 : 1,
    },
    section2_allScenes: allScenes,
    section5_narration: { plan: narrationTable, planStatus: narrationPlan.status, quality: narrationQuality, totalCharacters: narrationPlan.totalCharacters, estimatedCredits: narrationPlan.estimatedCredits },
    section6_cta: ctaDetails,
    section7_composition: cropSimulation,
    section8_qualityGate: { checks: qualityGateChecks, allPass: qualityGateAllPass, storyboardQualityGateStatus: v2.storyboardQualityGate.status, readyForV2PipelineIntegration: validation.readyForV2PipelineIntegration },
    section9_readiness: { status: readiness, blockingReasons },
    section10_costs: {
      NEW_WAN_CALLS: newGenerateScenes.filter((s) => s.selectedProvider === "wan-2-5-t2v").length,
      NEW_KLING_CALLS: newGenerateScenes.filter((s) => s.selectedProvider === "freepik-kling-i2v").length,
      NEW_HEYGEN_CALLS: newGenerateScenes.filter((s) => s.selectedProvider === "heygen-image-avatar").length,
      NEW_ELEVENLABS_CALLS: narrationPlan.status === "READY" ? 1 : 0,
      NEW_EXECUTION_COST: { klingCredits: newKlingCredits, wanCredits: newWanCredits, heygenUsdCents: newHeygenUsdCents, elevenLabsCredits: newElevenLabsCredits },
      HISTORICAL_COST: { klingCreditsAlreadySpent: historicalKlingCredits, note: "scene-1 (325 creditos Kling) ja foi pago no CREATIVE V2 HOOK FIDELITY CANARY - nao entra no orcamento do Full Canary." },
      suggestedLimits: {
        maxVideoCredits: newKlingCredits + newWanCredits,
        maxTtsCredits: newElevenLabsCredits,
        maxCostUSD: newHeygenUsdCents / 100,
      },
    },
    networkGuardrail: { blockedAttempts, networkCallCount },
  };

  const outDir = path.join(root, "temp", "commercial-v2-full-canary-preflight");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "full-canary-preflight-report.json"), JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nRelatorio salvo em: ${path.relative(root, path.join(outDir, "full-canary-preflight-report.json"))}`);
  console.log(`READY_FOR_COMMERCIAL_V2_FULL_CANARY = ${readiness}`);
  console.log(`Banco alterado: NAO. blockedAttempts=${blockedAttempts} (esperado 0).`);
}

main().catch((err) => {
  console.error("Pre-flight falhou:", err.message, err.stack);
  process.exitCode = 1;
});
