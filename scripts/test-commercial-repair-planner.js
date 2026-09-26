const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(root, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function loadTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

let fetchCalls = 0;
global.fetch = async () => {
  fetchCalls += 1;
  throw new Error("External calls are forbidden in this test.");
};

const { planCommercialRepair } = require("../lib/commercial-video/repair/repair-planner.ts");
const { buildRepairFingerprint } = require("../lib/commercial-video/repair/repair-fingerprint.ts");

function scene(id, providerCapability = "PRODUCT_VIDEO", provider = "freepik-kling-i2v") {
  return {
    sceneId: id,
    sceneOrder: Number(id.replace(/\D/g, "")) || 1,
    purpose: "OFFER",
    providerCapability,
    selectedProvider: provider,
    providerStatus: "ACTIVE",
    productGenerationStrategy: providerCapability === "PRODUCT_VIDEO" ? "GENERATIVE_PRODUCT_VIDEO" : null,
    requiresHybridPipeline: false,
    eligibility: "ELIGIBLE",
    eligibilityReason: null,
    estimatedCost: {
      provider,
      estimatedCredits: 260,
      estimatedCurrencyCostCents: 104,
      costUnit: "CREDITS",
      estimatedUsdCostCents: null,
      actualCredits: null,
      actualCurrencyCostCents: null,
    },
    persistedStatus: "READY",
    persistedStatusReason: null,
    existingAsset: {
      source: "GENERATION_RESULT",
      inputVideoPath: `${id}.mp4`,
      status: "READY",
      rejectionReason: null,
    },
  };
}

function qualityScene(id, overrides = {}) {
  return {
    sceneId: id,
    provider: "freepik-kling-i2v",
    capability: "PRODUCT_VIDEO",
    technicalStatus: "READY",
    status: "PASS",
    commercialReusable: true,
    reuseDecision: "REUSABLE",
    reasons: [],
    observations: [],
    issues: [],
    ...overrides,
  };
}

function runner(overrides = {}) {
  return {
    campaignId: "campaign",
    mode: "EXECUTE",
    status: "COMPLETED",
    startedAt: new Date(0).toISOString(),
    completedAt: new Date(1).toISOString(),
    durationMs: 1,
    transitions: [],
    scenes: [scene("scene-1"), scene("scene-2"), scene("scene-3", "CHARACTER_VIDEO", "heygen-image-avatar")],
    narrationPlan: null,
    narrationQualityResult: { status: "PASS", reasons: [] },
    costPreview: { videoCreditsKnown: 0, videoCurrencyCostCentsKnown: null, videoUsdCostCentsKnown: null, ttsCredits: 0, ttsCurrencyCostCents: null, unknownCurrencyComponents: [] },
    videoCostGuard: { status: "OK", reason: null },
    usdCostGuard: { status: "OK", reason: null },
    ttsCostGuard: { status: "OK", reason: null },
    quality: { sceneEligibility: "PASS", assetResolution: "PASS", narrationQuality: "PASS", audioQuality: "PASS", finalVideoQuality: "PASS", finalStatus: "PASS" },
    traceability: [],
    finalVideoPath: null,
    finalVideoUrl: null,
    executionGuard: { status: "OK", reason: null },
    executionReadiness: { status: "READY", canProduceFinalCommercial: true, blockers: [], warnings: [], scenes: [] },
    sceneExecutionRecords: [
      { sceneId: "scene-1", fingerprint: "fp1", provider: "freepik-kling-i2v", generationId: "g1", status: "COMPLETED", outputUrl: "url", durationSeconds: 4, completedAt: null, error: null },
      { sceneId: "scene-2", fingerprint: "fp2", provider: "freepik-kling-i2v", generationId: "g2", status: "COMPLETED", outputUrl: "url", durationSeconds: 4, completedAt: null, error: null },
      { sceneId: "scene-3", fingerprint: "fp3", provider: "heygen-image-avatar", generationId: "g3", status: "COMPLETED", outputUrl: "url", durationSeconds: 2, completedAt: null, error: null },
    ],
    narrationExecutionRecords: [
      { sceneId: "scene-1", fingerprint: "n1", status: "REUSED", audioPath: "1.mp3", actualDurationSeconds: 1, completedAt: null, error: null },
      { sceneId: "scene-2", fingerprint: "n2", status: "REUSED", audioPath: "2.mp3", actualDurationSeconds: 1, completedAt: null, error: null },
      { sceneId: "scene-3", fingerprint: "n3", status: "REUSED", audioPath: "3.mp3", actualDurationSeconds: 1, completedAt: null, error: null },
    ],
    errors: [],
    ...overrides,
  };
}

function quality(overrides = {}) {
  return {
    status: "PASS",
    publishReady: true,
    sceneResults: [qualityScene("scene-1"), qualityScene("scene-2"), qualityScene("scene-3", { provider: "heygen-image-avatar", capability: "CHARACTER_VIDEO" })],
    offerConsistency: { status: "PASS", issues: [] },
    narrationConsistency: {
      status: "PASS",
      issues: [],
      sceneTimings: [
        { sceneId: "scene-1", text: "a", sceneDurationSeconds: 4, audioDurationSeconds: 1, status: "PASS" },
        { sceneId: "scene-2", text: "b", sceneDurationSeconds: 4, audioDurationSeconds: 1, status: "PASS" },
        { sceneId: "scene-3", text: "c", sceneDurationSeconds: 2, audioDurationSeconds: 1, status: "PASS" },
      ],
    },
    finalVideoTechnicalQuality: { status: "PASS", issues: [], probe: { valid: true, durationSeconds: 10, width: 1080, height: 1920, fps: 24, videoCodec: "mpeg4", videoEncoder: "mpeg4", audioCodec: "aac", audioStreamCount: 1, error: null } },
    audioQuality: { status: "PASS", durationMatchesVideo: true, narrationTimingValid: true, clippingDetected: false, audioStreamPresent: true, masterLoudnessLUFS: -14, notes: [] },
    blockingReasons: [],
    observations: [],
    reusePolicy: [],
    ...overrides,
  };
}

const offer = { price: 49.9, priceText: "R$ 49,90", originalPrice: null, discountPercent: 0, discountText: "0% OFF" };

let plan = planCommercialRepair({ runnerResult: runner(), qualityResult: quality(), offer });
assert.equal(plan.scenes[0].action, "REUSE", "PASS scene -> REUSE");
assert.equal(plan.scenes[0].estimatedCost, null, "cenas boas nao regeneradas");
assert.equal(plan.scenes[0].reuseNarration, true, "narration PASS -> reuse");
assert.equal(plan.estimatedNewCosts.elevenLabsCredits, 0, "narration fingerprint igual -> zero TTS");

const notReusableQuality = quality({
  status: "FAIL",
  publishReady: false,
  sceneResults: [
    qualityScene("scene-1"),
    qualityScene("scene-2", {
      status: "FAIL",
      commercialReusable: false,
      reuseDecision: "NOT_REUSABLE",
      reasons: ["Label mutado."],
      issues: [{ category: "PRODUCT_LABEL_MUTATION", severity: "BLOCKING", sceneId: "scene-2", message: "Label mutado." }],
    }),
    qualityScene("scene-3", { provider: "heygen-image-avatar", capability: "CHARACTER_VIDEO" }),
  ],
});
plan = planCommercialRepair({
  runnerResult: runner(),
  qualityResult: notReusableQuality,
  offer,
  sceneContexts: [
    {
      sceneId: "scene-2",
      productStrategyInput: { mediaType: "PRODUCT_VIDEO", productIntegrityRisk: "HIGH", fidelityRisk: "HIGH", hasProductReference: true },
      baseOverlays: { priceText: "R$ 49,90", discountText: "0% OFF", ctaText: "Acesse o Radar Smart." },
    },
  ],
});
const scene2 = plan.scenes.find((entry) => entry.sceneId === "scene-2");
assert.equal(scene2.action, "REGENERATE", "NOT_REUSABLE -> nunca REUSE");
assert.equal(scene2.recommendedStrategy, "HYBRID_PRODUCT_COMPOSITE", "HYBRID pode ser escolhido pelas regras existentes");
assert.equal(scene2.provider, "wan-2-5-t2v", "provider productionEligible exigido");
assert.equal(scene2.effectiveOverlays.discountText, null, "0% OFF -> discountText null");
assert.equal(scene2.effectiveOverlays.priceText, "R$ 49,90", "preco real preservado");
assert.ok((scene2.estimatedCost.estimatedCredits ?? 0) > 0, "quality FAIL objetivo -> REGENERATE com custo");
assert.equal(plan.scenes[0].action, "REUSE", "cenas boas nao regeneradas");

const reviewQuality = quality({
  status: "PASS_WITH_OBSERVATIONS",
  publishReady: false,
  sceneResults: [
    qualityScene("scene-1", { status: "PASS_WITH_OBSERVATIONS", commercialReusable: false, reuseDecision: "REVIEW_REQUIRED", observations: ["olhar humano"], issues: [{ category: "REVIEW_REQUIRED", severity: "NON_BLOCKING", sceneId: "scene-1", message: "olhar humano" }] }),
    qualityScene("scene-2"),
    qualityScene("scene-3", { provider: "heygen-image-avatar", capability: "CHARACTER_VIDEO" }),
  ],
});
plan = planCommercialRepair({ runnerResult: runner(), qualityResult: reviewQuality, offer });
assert.equal(plan.scenes[0].action, "REVIEW_REQUIRED", "REVIEW sem evidencia suficiente -> REVIEW_REQUIRED");

const blockingProviderPlan = planCommercialRepair({
  runnerResult: runner({ scenes: [scene("scene-2", "PRODUCT_VIDEO", "mock")] }),
  qualityResult: quality({ sceneResults: [notReusableQuality.sceneResults[1]], narrationConsistency: { ...quality().narrationConsistency, sceneTimings: [{ sceneId: "scene-2", text: "b", sceneDurationSeconds: 4, audioDurationSeconds: 1, status: "PASS" }] } }),
  offer,
});
assert.equal(blockingProviderPlan.scenes[0].providerProductionEligible, false, "provider productionEligible exigido");
assert.equal(blockingProviderPlan.canAutoRepair, false, "provider inelegivel bloqueia autoRepair");

const unknownCostPlan = planCommercialRepair({
  runnerResult: runner({ scenes: [scene("scene-2", "PRODUCT_VIDEO", "openai-image-edit")] }),
  qualityResult: quality({ sceneResults: [notReusableQuality.sceneResults[1]], narrationConsistency: { ...quality().narrationConsistency, sceneTimings: [{ sceneId: "scene-2", text: "b", sceneDurationSeconds: 4, audioDurationSeconds: 1, status: "PASS" }] } }),
  offer,
});
assert.equal(unknownCostPlan.estimatedNewCosts.unknownCostScenes.includes("scene-2"), true, "unknown cost bloqueia autoRepair");
assert.equal(unknownCostPlan.canAutoRepair, false, "unknown cost bloqueia autoRepair");

const fp1 = buildRepairFingerprint({ originalFingerprint: "same", qualityFailureReasons: ["a"], repairStrategy: "PRESERVE_PACKAGE_VIDEO", effectiveOverlays: { priceText: "R$ 49,90", discountText: null, ctaText: null }, provider: "freepik-kling-i2v" });
const fp2 = buildRepairFingerprint({ originalFingerprint: "same", qualityFailureReasons: ["b"], repairStrategy: "PRESERVE_PACKAGE_VIDEO", effectiveOverlays: { priceText: "R$ 49,90", discountText: null, ctaText: null }, provider: "freepik-kling-i2v" });
assert.notEqual(fp1, fp2, "repair fingerprint muda com quality reason");

assert.equal(fetchCalls, 0, "nenhum provider chamado");
assert.equal(plan.campaignId, "campaign", "nao hardcodar produto especifico");

console.log("commercial repair planner tests passed");
