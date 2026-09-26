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

const { assessCommercialQuality, buildAudioQualityFromMeasuredFacts, buildManualAssessment } = require("../lib/commercial-video/quality/commercial-quality-gate.ts");
const { assessOfferConsistency } = require("../lib/commercial-video/quality/offer-consistency-check.ts");
const { assessSceneQuality } = require("../lib/commercial-video/quality/scene-quality-gate.ts");
const { assessNarrationConsistency } = require("../lib/commercial-video/quality/narration-consistency-check.ts");
const { assessFinalVideoTechnicalQuality } = require("../lib/commercial-video/quality/final-video-quality-check.ts");
const { decidePublishReady } = require("../lib/commercial-video/quality/publish-readiness.ts");

function scene(id, capability = "TEXT_TO_VIDEO") {
  return {
    sceneId: id,
    sceneOrder: Number(id.replace(/\D/g, "")) || 1,
    purpose: "HOOK",
    providerCapability: capability,
    selectedProvider: capability === "CHARACTER_VIDEO" ? "heygen-image-avatar" : "wan-2-5-t2v",
    providerStatus: "ACTIVE",
    productGenerationStrategy: null,
    requiresHybridPipeline: false,
    eligibility: "ELIGIBLE",
    eligibilityReason: null,
    estimatedCost: {
      provider: "test",
      estimatedCredits: null,
      estimatedCurrencyCostCents: null,
      estimatedUsdCostCents: null,
      actualCredits: null,
      actualCurrencyCostCents: null,
      costUnit: "CREDITS",
    },
    persistedStatus: "READY",
    persistedStatusReason: null,
    existingAsset: {
      source: "GENERATION_RESULT",
      inputVideoPath: "asset.mp4",
      status: "READY",
      rejectionReason: null,
    },
  };
}

function runnerResult(overrides = {}) {
  return {
    campaignId: "campaign-test",
    mode: "EXECUTE",
    status: "COMPLETED",
    startedAt: new Date(0).toISOString(),
    completedAt: new Date(1).toISOString(),
    durationMs: 1,
    transitions: [],
    scenes: [scene("scene-1"), scene("scene-2", "PRODUCT_VIDEO"), scene("scene-3", "CHARACTER_VIDEO")],
    narrationPlan: {
      campaignId: "campaign-test",
      language: "pt-BR",
      scenes: [
        { sceneId: "scene-1", sceneOrder: 1, purpose: "HOOK", durationSeconds: 3, maxCharacters: 35, text: "Hook.", estimatedSpeechSeconds: 1, status: "READY", reason: null, candidatesConsidered: 1 },
        { sceneId: "scene-2", sceneOrder: 2, purpose: "OFFER", durationSeconds: 4, maxCharacters: 50, text: "Ficou por R$ 49,90.", estimatedSpeechSeconds: 1, status: "READY", reason: null, candidatesConsidered: 1 },
        { sceneId: "scene-3", sceneOrder: 3, purpose: "CTA", durationSeconds: 2, maxCharacters: 30, text: "Acesse o Radar Smart.", estimatedSpeechSeconds: 1, status: "READY", reason: null, candidatesConsidered: 1 },
      ],
      totalCharacters: 40,
      estimatedCredits: 40,
      status: "READY",
    },
    narrationQualityResult: { status: "PASS", reasons: [] },
    costPreview: {
      videoCreditsKnown: 0,
      videoCurrencyCostCentsKnown: null,
      videoUsdCostCentsKnown: null,
      ttsCredits: 0,
      ttsCurrencyCostCents: null,
      unknownCurrencyComponents: [],
    },
    videoCostGuard: { status: "OK", reason: null },
    usdCostGuard: { status: "OK", reason: null },
    ttsCostGuard: { status: "OK", reason: null },
    quality: {
      sceneEligibility: "PASS",
      assetResolution: "PASS",
      narrationQuality: "PASS",
      audioQuality: "PASS",
      finalVideoQuality: "PASS",
      finalStatus: "PASS",
    },
    traceability: [],
    finalVideoPath: "final.mp4",
    finalVideoUrl: null,
    executionGuard: { status: "OK", reason: null },
    executionReadiness: { status: "READY", canProduceFinalCommercial: true, blockers: [], warnings: [], scenes: [] },
    sceneExecutionRecords: [],
    narrationExecutionRecords: [
      { sceneId: "scene-1", fingerprint: "a", status: "COMPLETED", audioPath: "1.mp3", actualDurationSeconds: 1, completedAt: null, error: null },
      { sceneId: "scene-2", fingerprint: "b", status: "COMPLETED", audioPath: "2.mp3", actualDurationSeconds: 1, completedAt: null, error: null },
      { sceneId: "scene-3", fingerprint: "c", status: "COMPLETED", audioPath: "3.mp3", actualDurationSeconds: 1.5, completedAt: null, error: null },
    ],
    errors: [],
    ...overrides,
  };
}

const offer = { price: 49.9, priceText: "R$ 49,90", originalPrice: null, discountPercent: null, discountText: null };
const goodProbe = { valid: true, durationSeconds: 8.5, width: 1080, height: 1920, fps: 24, videoCodec: "h264", videoEncoder: "Lavc61.3.100 h264_mf", audioCodec: "aac", audioStreamCount: 1, error: null };
const goodAudio = buildAudioQualityFromMeasuredFacts({
  videoDurationSeconds: 8.5,
  audioDurationSeconds: 8.5,
  narrationSegments: [],
  peakLevelDb: -4,
  audioStreamPresent: true,
  masterLoudnessLUFS: -19,
});

assert.equal(assessOfferConsistency(offer, [{ sceneId: "scene-2", source: "COMPOSITOR_OVERLAY", kind: "PRICE", value: "R$ 49,90" }]).status, "PASS", "preco correto passa");
assert.equal(assessOfferConsistency(offer, [{ sceneId: "scene-2", source: "COMPOSITOR_OVERLAY", kind: "PRICE", value: "R$ 59,90" }]).status, "FAIL", "preco divergente falha");
assert.equal(assessOfferConsistency({ ...offer, originalPrice: 99.9, discountPercent: 50, discountText: "50% OFF" }, [{ sceneId: "scene-2", source: "COMPOSITOR_OVERLAY", kind: "DISCOUNT", value: "50% OFF" }]).status, "PASS", "desconto real passa");
assert.equal(assessOfferConsistency(offer, [{ sceneId: "scene-2", source: "COMPOSITOR_OVERLAY", kind: "DISCOUNT", value: "0% OFF" }]).status, "FAIL", "0% OFF bloqueia");
assert.equal(assessOfferConsistency(offer, [{ sceneId: "scene-2", source: "GENERATED_CONTENT", kind: "PRICE", value: "R$ 49,90" }]).status, "FAIL", "generated price contamination bloqueia");

const failedScene = assessSceneQuality({
  scene: scene("scene-2", "PRODUCT_VIDEO"),
  narrationRecord: null,
  manualAssessments: [buildManualAssessment("scene-2", "PRODUCT_LABEL_MUTATION", "CRITICAL", "Rotulo inventado.")],
});
assert.equal(failedScene.commercialReusable, false, "fingerprint + quality FAIL nao reutiliza");
assert.equal(failedScene.reuseDecision, "NOT_REUSABLE", "quality FAIL vira NOT_REUSABLE");
assert.equal(assessSceneQuality({ scene: scene("scene-1"), narrationRecord: null, manualAssessments: [] }).reuseDecision, "REUSABLE", "fingerprint + quality PASS reutiliza");
assert.equal(failedScene.status, "FAIL", "product mutation bloqueia");

assert.equal(assessNarrationConsistency(runnerResult().narrationPlan, runnerResult().narrationExecutionRecords).status, "PASS", "character timing valido passa");
const longNarration = runnerResult({
  narrationExecutionRecords: [
    { sceneId: "scene-1", fingerprint: "a", status: "COMPLETED", audioPath: "1.mp3", actualDurationSeconds: 1, completedAt: null, error: null },
    { sceneId: "scene-2", fingerprint: "b", status: "COMPLETED", audioPath: "2.mp3", actualDurationSeconds: 1, completedAt: null, error: null },
    { sceneId: "scene-3", fingerprint: "c", status: "COMPLETED", audioPath: "3.mp3", actualDurationSeconds: 2.2, completedAt: null, error: null },
  ],
});
assert.equal(assessNarrationConsistency(longNarration.narrationPlan, longNarration.narrationExecutionRecords).status, "FAIL", "CTA truncado bloqueia");

assert.equal(buildAudioQualityFromMeasuredFacts({ videoDurationSeconds: 8, audioDurationSeconds: 8, narrationSegments: [], peakLevelDb: 0, audioStreamPresent: true, masterLoudnessLUFS: -14 }).status, "FAIL", "audio clipping bloqueia");
assert.equal(assessFinalVideoTechnicalQuality({ probe: { ...goodProbe, valid: false, error: "bad" } }).status, "FAIL", "MP4 invalido bloqueia");
assert.equal(assessCommercialQuality({ runnerResult: runnerResult({ scenes: [scene("scene-1"), { ...scene("scene-2"), existingAsset: { source: null, inputVideoPath: null, status: "MISSING_ASSET", rejectionReason: "missing" } }] }), offer, visualClaims: [], finalVideoProbe: goodProbe, audioQuality: goodAudio }).status, "FAIL", "scene faltante bloqueia");

const pass = assessCommercialQuality({ runnerResult: runnerResult(), offer, visualClaims: [{ sceneId: "scene-2", source: "COMPOSITOR_OVERLAY", kind: "PRICE", value: "R$ 49,90" }], finalVideoProbe: goodProbe, audioQuality: goodAudio });
assert.equal(pass.status, "PASS", "PASS completo");
assert.equal(pass.publishReady, true, "PASS completo -> publishReady true");
assert.equal(pass.requiresHumanAcknowledgement, false, "PASS limpo nao exige acknowledgement humano");

const observed = assessCommercialQuality({
  runnerResult: runnerResult(),
  offer,
  visualClaims: [],
  manualSceneAssessments: [buildManualAssessment("scene-3", "REVIEW_REQUIRED", "NON_BLOCKING", "Revisao humana recomendada.")],
  finalVideoProbe: goodProbe,
  audioQuality: goodAudio,
});
assert.equal(observed.status, "PASS_WITH_OBSERVATIONS", "observacao vira PASS_WITH_OBSERVATIONS");
assert.equal(observed.publishReady, true, "NON_BLOCKING observation -> publishReady true");
assert.equal(observed.requiresHumanAcknowledgement, true, "NON_BLOCKING observation exige acknowledgement humano");
assert.equal(observed.publishObservations.length, 1, "observacao publicavel fica registrada");

const blockingObservation = assessCommercialQuality({
  runnerResult: runnerResult(),
  offer,
  visualClaims: [],
  manualSceneAssessments: [buildManualAssessment("scene-3", "CTA_TRUNCATED", "BLOCKING", "CTA truncado.")],
  finalVideoProbe: goodProbe,
  audioQuality: goodAudio,
});
assert.equal(blockingObservation.publishReady, false, "BLOCKING observation -> publishReady false");

const criticalObservation = assessCommercialQuality({
  runnerResult: runnerResult(),
  offer,
  visualClaims: [],
  manualSceneAssessments: [buildManualAssessment("scene-2", "PRODUCT_MUTATION", "CRITICAL", "Produto errado.")],
  finalVideoProbe: goodProbe,
  audioQuality: goodAudio,
});
assert.equal(criticalObservation.publishReady, false, "CRITICAL -> publishReady false");
assert.equal(criticalObservation.status, "FAIL", "CRITICAL falha o gate");

const wrongPrice = assessOfferConsistency(offer, [{ sceneId: "scene-2", source: "COMPOSITOR_OVERLAY", kind: "PRICE", value: "R$ 59,90" }]);
assert.equal(wrongPrice.issues[0].severity, "CRITICAL", "preco errado -> CRITICAL");
const falseDiscount = assessOfferConsistency(offer, [{ sceneId: "scene-2", source: "COMPOSITOR_OVERLAY", kind: "DISCOUNT", value: "0% OFF" }]);
assert.equal(falseDiscount.issues[0].severity, "CRITICAL", "desconto falso -> CRITICAL");

const smallHalo = assessSceneQuality({
  scene: scene("scene-2", "PRODUCT_VIDEO"),
  narrationRecord: null,
  manualAssessments: [buildManualAssessment("scene-2", "REVIEW_REQUIRED", "NON_BLOCKING", "Pequeno halo de cutout.")],
});
assert.equal(smallHalo.status, "PASS_WITH_OBSERVATIONS", "pequeno halo -> NON_BLOCKING/PASS_WITH_OBSERVATIONS");
assert.equal(smallHalo.commercialReusable, true, "NON_BLOCKING nao bloqueia reuso comercial");
const irregularCutout = assessSceneQuality({
  scene: scene("scene-2", "PRODUCT_VIDEO"),
  narrationRecord: null,
  manualAssessments: [buildManualAssessment("scene-2", "REVIEW_REQUIRED", "NON_BLOCKING", "Borda irregular de cutout.")],
});
assert.equal(irregularCutout.issues[0].severity, "NON_BLOCKING", "borda irregular de cutout -> NON_BLOCKING");

const ctaTruncated = assessSceneQuality({
  scene: scene("scene-3", "CHARACTER_VIDEO"),
  narrationRecord: null,
  manualAssessments: [buildManualAssessment("scene-3", "CTA_TRUNCATED", "BLOCKING", "CTA truncado.")],
});
assert.equal(ctaTruncated.issues[0].severity, "BLOCKING", "CTA truncado -> BLOCKING");
assert.equal(ctaTruncated.status, "FAIL", "CTA truncado bloqueia");
const productWrong = assessSceneQuality({
  scene: scene("scene-2", "PRODUCT_VIDEO"),
  narrationRecord: null,
  manualAssessments: [buildManualAssessment("scene-2", "PRODUCT_MUTATION", "CRITICAL", "Produto errado.")],
});
assert.equal(productWrong.issues[0].severity, "CRITICAL", "produto errado -> CRITICAL");

assert.equal(assessFinalVideoTechnicalQuality({ probe: { ...goodProbe, valid: false, error: "bad" } }).issues[0].severity, "CRITICAL", "video invalido -> CRITICAL");
assert.equal(decidePublishReady("PASS_WITH_OBSERVATIONS", [{ category: "REVIEW_REQUIRED", severity: "NON_BLOCKING", message: "cosmetico" }], goodAudio), true, "nenhuma observacao NON_BLOCKING inicia regeneration automaticamente");

assert.equal(fetchCalls, 0, "nenhuma chamada provider");
assert.equal(fetchCalls, 0, "nenhuma publicacao");

console.log("commercial quality gate tests passed");
