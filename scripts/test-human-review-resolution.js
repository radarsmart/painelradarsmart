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

const { resolveHumanReviewRepairPlan, STRICT_BACKGROUND_REGENERATION_PROMPT_GUARDS } = require("../lib/commercial-video/repair/human-review-resolution.ts");

function scene(sceneId, purpose, capability, provider) {
  return {
    sceneId,
    sceneOrder: Number(sceneId.replace(/\D/g, "")) || 1,
    purpose,
    providerCapability: capability,
    selectedProvider: provider,
    providerStatus: "ACTIVE",
    productGenerationStrategy: capability === "PRODUCT_VIDEO" ? "GENERATIVE_PRODUCT_VIDEO" : null,
    requiresHybridPipeline: false,
    eligibility: "ELIGIBLE",
    eligibilityReason: null,
    estimatedCost: { provider, estimatedCredits: null, estimatedCurrencyCostCents: null, costUnit: "CREDITS", estimatedUsdCostCents: null, actualCredits: null, actualCurrencyCostCents: null },
    persistedStatus: "READY",
    persistedStatusReason: null,
    existingAsset: { source: "GENERATION_RESULT", inputVideoPath: `${sceneId}.mp4`, status: "READY", rejectionReason: null },
  };
}

function qualityScene(sceneId, overrides) {
  return {
    sceneId,
    provider: null,
    capability: "TEXT_TO_VIDEO",
    technicalStatus: "READY",
    status: "PASS_WITH_OBSERVATIONS",
    commercialReusable: false,
    reuseDecision: "REVIEW_REQUIRED",
    reasons: [],
    observations: [],
    issues: [],
    ...overrides,
  };
}

function buildInput(scene1Issues, scene3Issues = []) {
  const runnerResult = {
    campaignId: "campaign",
    mode: "EXECUTE",
    status: "COMPLETED",
    startedAt: new Date(0).toISOString(),
    completedAt: new Date(1).toISOString(),
    durationMs: 1,
    transitions: [],
    scenes: [
      scene("scene-1", "HOOK", "TEXT_TO_VIDEO", "wan-2-5-t2v"),
      scene("scene-2", "OFFER", "PRODUCT_VIDEO", "freepik-kling-i2v"),
      scene("scene-3", "CTA", "CHARACTER_VIDEO", "heygen-image-avatar"),
    ],
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
      { sceneId: "scene-1", fingerprint: "fp1", provider: "wan-2-5-t2v", generationId: "g1", status: "COMPLETED", outputUrl: "url", durationSeconds: 3, completedAt: null, error: null },
      { sceneId: "scene-2", fingerprint: "fp2", provider: "freepik-kling-i2v", generationId: "g2", status: "COMPLETED", outputUrl: "url", durationSeconds: 4, completedAt: null, error: null },
      { sceneId: "scene-3", fingerprint: "fp3", provider: "heygen-image-avatar", generationId: "g3", status: "COMPLETED", outputUrl: "url", durationSeconds: 2, completedAt: null, error: null },
    ],
    narrationExecutionRecords: [],
    errors: [],
  };
  const qualityResult = {
    status: "FAIL",
    publishReady: false,
    sceneResults: [
      qualityScene("scene-1", { issues: scene1Issues, observations: scene1Issues.map((issue) => issue.message) }),
      qualityScene("scene-2", {
        status: "FAIL",
        reuseDecision: "NOT_REUSABLE",
        reasons: ["asset contaminado"],
        issues: [{ category: "PRODUCT_LABEL_MUTATION", severity: "BLOCKING", sceneId: "scene-2", message: "asset contaminado" }],
      }),
      qualityScene("scene-3", { capability: "CHARACTER_VIDEO", provider: "heygen-image-avatar", issues: scene3Issues }),
    ],
    offerConsistency: { status: "FAIL", issues: [] },
    narrationConsistency: {
      status: "PASS",
      issues: [],
      sceneTimings: [
        { sceneId: "scene-1", text: "a", sceneDurationSeconds: 3, audioDurationSeconds: 1, status: "PASS" },
        { sceneId: "scene-2", text: "b", sceneDurationSeconds: 4, audioDurationSeconds: 1, status: "PASS" },
        { sceneId: "scene-3", text: "c", sceneDurationSeconds: 2, audioDurationSeconds: 1.6, status: "PASS" },
      ],
    },
    finalVideoTechnicalQuality: { status: "PASS", issues: [], probe: { valid: true, durationSeconds: 9, width: 1080, height: 1920, fps: 24, videoCodec: "mpeg4", videoEncoder: "mpeg4", audioCodec: "aac", audioStreamCount: 1, error: null } },
    audioQuality: { status: "PASS", durationMatchesVideo: true, narrationTimingValid: true, clippingDetected: false, audioStreamPresent: true, masterLoudnessLUFS: -14, notes: [] },
    blockingReasons: [],
    observations: [],
    reusePolicy: [],
  };
  return { runnerResult, qualityResult };
}

const offer = { price: 49.9, priceText: "R$ 49,90", originalPrice: null, discountPercent: 0, discountText: null };
const contexts = [
  { sceneId: "scene-1", baseOverlays: { priceText: null, discountText: null, ctaText: null } },
  { sceneId: "scene-2", productStrategyInput: { mediaType: "PRODUCT_VIDEO", productIntegrityRisk: "HIGH", fidelityRisk: "HIGH", hasProductReference: true }, baseOverlays: { priceText: "R$ 49,90", discountText: "0% OFF", ctaText: null } },
  { sceneId: "scene-3", baseOverlays: { priceText: null, discountText: null, ctaText: "Acesse o Radar Smart." } },
];

let input = buildInput([{ category: "GENERATED_TEXT", severity: "NON_BLOCKING", sceneId: "scene-1", message: "texto gerado" }]);
let resolved = resolveHumanReviewRepairPlan({ ...input, offer, sceneContexts: contexts });
assert.equal(resolved.repairPlan.scenes.find((scenePlan) => scenePlan.sceneId === "scene-1").action, "REGENERATE", "scene-1 contaminada -> REGENERATE");
assert.equal(resolved.repairPlan.scenes.find((scenePlan) => scenePlan.sceneId === "scene-1").recommendedStrategy, "STRICT_BACKGROUND_REGENERATION", "scene-1 usa estrategia estrita");
assert.deepEqual(resolved.repairPlan.scenes.find((scenePlan) => scenePlan.sceneId === "scene-1").promptGuards, STRICT_BACKGROUND_REGENERATION_PROMPT_GUARDS, "prompt guards estritos presentes");
assert.equal(resolved.repairPlan.scenes.find((scenePlan) => scenePlan.sceneId === "scene-3").action, "REUSE", "scene-3 sem falha objetiva -> REUSE");
assert.equal(resolved.repairPlan.estimatedNewCosts.wanCredits, 3000, "scene-1 + scene-2 WAN credits com duracao faturavel minima");
assert.equal(resolved.readyForRepairExecute, true, "decisoes resolvidas -> ready");

input = buildInput([]);
resolved = resolveHumanReviewRepairPlan({ ...input, offer, sceneContexts: contexts });
assert.equal(resolved.repairPlan.scenes.find((scenePlan) => scenePlan.sceneId === "scene-1").action, "REVIEW_REQUIRED", "scene-1 sem evidencia objetiva permanece REVIEW_REQUIRED");

input = buildInput([{ category: "GENERATED_TEXT", severity: "NON_BLOCKING", sceneId: "scene-1", message: "texto gerado" }], [
  { category: "CTA_TRUNCATED", severity: "BLOCKING", sceneId: "scene-3", message: "cta cortado" },
]);
resolved = resolveHumanReviewRepairPlan({ ...input, offer, sceneContexts: contexts });
assert.equal(resolved.repairPlan.scenes.find((scenePlan) => scenePlan.sceneId === "scene-3").action, "REGENERATE", "CTA_TRUNCATED objetivo -> REGENERATE");

assert.equal(fetchCalls, 0, "nenhum provider chamado");

console.log("human review resolution tests passed");
