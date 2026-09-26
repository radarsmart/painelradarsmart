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
  throw new Error("External calls are forbidden in review tests.");
};

const {
  buildCommercialReviewSummary,
  canApproveCommercial,
  canRejectCommercial,
} = require("../lib/commercial-video/review/commercial-review-state.ts");

function issue(severity, message = "issue") {
  return { category: "REVIEW_REQUIRED", severity, sceneId: "scene-2", message };
}

function job(overrides = {}) {
  const quality = overrides.quality ?? {
    status: "PASS",
    publishReady: true,
    requiresHumanAcknowledgement: false,
    publishObservations: [],
    sceneResults: [
      { sceneId: "scene-1", status: "PASS" },
      { sceneId: "scene-2", status: "PASS" },
      { sceneId: "scene-3", status: "PASS" },
    ],
  };

  return {
    id: "job-1",
    campaignId: "campaign-1",
    offerId: "offer-1",
    mode: "EXECUTE",
    status: overrides.status ?? "COMPLETED",
    currentStage: "COMPLETED",
    progressPercent: 100,
    costSummary: {
      estimatedVideoCredits: 1500,
      estimatedTtsCredits: 0,
      knownCostBRL: null,
      costHasUnknownComponents: false,
    },
    qualityStatus: quality.status,
    runnerResult: {
      finalVideoUrl: "https://example.com/final.mp4",
      finalVideoPath: null,
      quality: { finalStatus: quality.status },
      commercialQualityResult: quality,
      scenes: [
        {
          sceneId: "scene-1",
          purpose: "HOOK",
          selectedProvider: "wan-2-5-t2v",
          requiresHybridPipeline: false,
          productGenerationStrategy: null,
          existingAsset: { source: "GENERATION_RESULT", status: "READY" },
          eligibility: "ELIGIBLE",
          estimatedCost: { estimatedCredits: 1500, estimatedUsdCostCents: null },
        },
        {
          sceneId: "scene-2",
          purpose: "OFFER",
          selectedProvider: "wan-2-5t2v-hybrid-local",
          requiresHybridPipeline: true,
          productGenerationStrategy: "HYBRID_PRODUCT_COMPOSITE",
          existingAsset: { source: "GENERATION_RESULT", status: "READY" },
          eligibility: "ELIGIBLE",
          estimatedCost: { estimatedCredits: 1500, estimatedUsdCostCents: null },
        },
        {
          sceneId: "scene-3",
          purpose: "CTA",
          selectedProvider: "heygen-image-avatar",
          requiresHybridPipeline: false,
          productGenerationStrategy: null,
          existingAsset: { source: "GENERATION_RESULT", status: "READY" },
          eligibility: "ELIGIBLE",
          estimatedCost: { estimatedCredits: null, estimatedUsdCostCents: 13 },
        },
      ],
    },
    traceability: [],
    review: {
      status: "PENDING_REVIEW",
      reviewedAt: null,
      reviewedByUserId: null,
      reviewedByEmail: null,
      notes: null,
      humanAcknowledgedObservations: false,
    },
    error: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

let summary = buildCommercialReviewSummary(job());
assert.equal(summary.qualityStatus, "PASS", "PASS mostra status principal");
assert.equal(summary.publishReady, true, "PASS mostra publishReady");
assert.equal(summary.requiresHumanAcknowledgement, false, "PASS limpo nao exige checkbox");
assert.equal(canApproveCommercial(summary, false), true, "PASS limpo permite aprovar");

summary = buildCommercialReviewSummary(job({
  quality: {
    status: "PASS_WITH_OBSERVATIONS",
    publishReady: true,
    requiresHumanAcknowledgement: true,
    publishObservations: [issue("NON_BLOCKING", "Borda irregular de cutout.")],
    sceneResults: [{ sceneId: "scene-2", status: "PASS_WITH_OBSERVATIONS" }],
  },
}));
assert.equal(summary.qualityStatus, "PASS_WITH_OBSERVATIONS", "PASS_WITH_OBSERVATIONS aparece");
assert.equal(summary.observations[0].severity, "NON_BLOCKING", "NON_BLOCKING e exibido");
assert.equal(summary.publishReady, true, "NON_BLOCKING nao bloqueia publishReady");
assert.equal(canApproveCommercial(summary, false), false, "requiresHumanAcknowledgement exige checkbox");
assert.equal(canApproveCommercial(summary, true), true, "checkbox libera aprovacao");

summary = buildCommercialReviewSummary(job({
  quality: {
    status: "PASS_WITH_OBSERVATIONS",
    publishReady: false,
    requiresHumanAcknowledgement: false,
    publishObservations: [issue("BLOCKING", "CTA truncado.")],
    sceneResults: [{ sceneId: "scene-3", status: "FAIL" }],
  },
}));
assert.equal(canApproveCommercial(summary, true), false, "BLOCKING impede aprovacao");

summary = buildCommercialReviewSummary(job({
  quality: {
    status: "FAIL",
    publishReady: false,
    requiresHumanAcknowledgement: false,
    publishObservations: [issue("CRITICAL", "Preco errado.")],
    sceneResults: [{ sceneId: "scene-2", status: "FAIL" }],
  },
}));
assert.equal(canApproveCommercial(summary, true), false, "CRITICAL/FAIL impede aprovacao");
assert.equal(canRejectCommercial(), true, "REJECTED pode ser registrado sem provider");

const reportPath = path.join(root, "temp", "final-reassembly-prepublish-qa", "final-reassembly-prepublish-qa-report.json");
if (fs.existsSync(reportPath)) {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  summary = buildCommercialReviewSummary(job({ quality: report.quality }));
  assert.equal(summary.qualityStatus, "PASS_WITH_OBSERVATIONS", "comercial real fica PASS_WITH_OBSERVATIONS");
  assert.equal(summary.publishReady, true, "comercial real fica publishReady=true");
  assert.equal(summary.requiresHumanAcknowledgement, true, "comercial real exige acknowledgement");
  assert.equal(summary.observations[0].severity, "NON_BLOCKING", "borda do splash e NON_BLOCKING");
}

assert.equal(fetchCalls, 0, "nenhum provider chamado");
console.log("commercial review approval tests passed");
