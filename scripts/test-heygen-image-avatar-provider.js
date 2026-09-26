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

const {
  getProviderProfile,
  getProvidersForCapability,
  getProductionEligibleProvidersForCapability,
  isProviderProductionEligible,
} = require("../lib/generation-orchestrator/provider-capabilities.ts");
const {
  estimateProviderUsdCostCents,
  estimateSceneCost,
} = require("../lib/generation-orchestrator/cost-estimator.ts");
const {
  buildProviderCoverageMatrix,
  evaluateCampaignExecutionReadiness,
} = require("../lib/commercial-video/runner/execute/execution-readiness.ts");

const heygenImageAvatar = getProviderProfile("heygen-image-avatar");
assert.ok(heygenImageAvatar, "heygen-image-avatar existe");
assert.equal(heygenImageAvatar.status, "ACTIVE", "heygen-image-avatar ACTIVE");
assert.equal(heygenImageAvatar.productionEligible, true, "heygen-image-avatar productionEligible=true");
assert.ok(heygenImageAvatar.capabilities.includes("CHARACTER_VIDEO"), "suporta CHARACTER_VIDEO");
assert.ok(
  getProductionEligibleProvidersForCapability("CHARACTER_VIDEO").some((p) => p.provider === "heygen-image-avatar"),
  "aparece como productionEligible para CHARACTER_VIDEO",
);

const legacyHeygen = getProviderProfile("heygen-avatar");
assert.ok(legacyHeygen, "heygen-avatar legado existe");
assert.equal(legacyHeygen.status, "UNVERIFIED", "heygen-avatar legado permanece UNVERIFIED");
assert.equal(legacyHeygen.productionEligible, false, "heygen-avatar legado permanece productionEligible=false");
assert.ok(
  !getProvidersForCapability("TEXT_TO_VIDEO").some((p) => p.provider === "heygen-image-avatar"),
  "heygen-image-avatar nao aparece para TEXT_TO_VIDEO",
);

assert.equal(estimateProviderUsdCostCents("heygen-image-avatar", "1080p", 60), 400, "custo 1080p conhecido");
assert.equal(estimateProviderUsdCostCents("heygen-image-avatar", "720p", 60), null, "custo 720p nao inventado");
assert.equal(estimateProviderUsdCostCents("heygen-image-avatar", "4k", 60), null, "custo 4k nao inventado");

const coverage = buildProviderCoverageMatrix(["CHARACTER_VIDEO", "TEXT_TO_VIDEO"]);
const characterVideoCoverage = coverage.find((entry) => entry.capability === "CHARACTER_VIDEO");
assert.equal(characterVideoCoverage.hasProductionGap, false, "readiness reconhece CHARACTER_VIDEO coberto");
assert.ok(
  characterVideoCoverage.providers.some((p) => p.provider === "heygen-image-avatar" && p.selectableForExecute),
  "heygen-image-avatar selecionavel para EXECUTE",
);

const wanT2v = getProviderProfile("wan-2-5-t2v");
assert.ok(wanT2v, "wan-2-5-t2v existe");
assert.equal(wanT2v.status, "ACTIVE", "wan-2-5-t2v ACTIVE apos 2 CANARYs reais");
assert.equal(wanT2v.productionEligible, true, "wan-2-5-t2v productionEligible=true");
assert.deepEqual(wanT2v.capabilities, ["TEXT_TO_VIDEO"], "WAN permanece restrito a TEXT_TO_VIDEO");
assert.equal(wanT2v.supportsIdentityReference, false, "WAN nao suporta identity reference");
assert.equal(wanT2v.supportsProductReference, false, "WAN nao suporta product reference");
assert.deepEqual(wanT2v.costModel, { creditsPerSecond: 300, centavosPerCredit: null }, "WAN preserva costModel");
assert.equal(estimateSceneCost("wan-2-5-t2v", 5).estimatedCredits, 1500, "WAN 5s = 1500 creditos");
assert.equal(estimateSceneCost("wan-2-5-t2v", 3).estimatedCredits, 1500, "WAN 3s usa duracao faturavel minima de 5s");
assert.equal(estimateSceneCost("wan-2-5-t2v", 5).estimatedCurrencyCostCents, null, "WAN nao inventa custo BRL");
assert.ok(
  getProductionEligibleProvidersForCapability("TEXT_TO_VIDEO").some((p) => p.provider === "wan-2-5-t2v"),
  "WAN aparece como productionEligible para TEXT_TO_VIDEO",
);
assert.ok(
  !getProvidersForCapability("PRODUCT_VIDEO").some((p) => p.provider === "wan-2-5-t2v"),
  "WAN nao aparece para PRODUCT_VIDEO",
);
assert.ok(
  !getProvidersForCapability("CHARACTER_VIDEO").some((p) => p.provider === "wan-2-5-t2v"),
  "WAN nao aparece para CHARACTER_VIDEO",
);

const textToVideoCoverage = coverage.find((entry) => entry.capability === "TEXT_TO_VIDEO");
assert.equal(textToVideoCoverage.hasProductionGap, false, "readiness reconhece TEXT_TO_VIDEO coberto");
assert.ok(
  textToVideoCoverage.providers.some((p) => p.provider === "wan-2-5-t2v" && p.selectableForExecute),
  "wan-2-5-t2v selecionavel para EXECUTE de TEXT_TO_VIDEO",
);

const readiness = evaluateCampaignExecutionReadiness(
  [
    {
      sceneId: "scene-character",
      sceneOrder: 1,
      purpose: "HOOK",
      providerCapability: "CHARACTER_VIDEO",
      selectedProvider: "heygen-image-avatar",
      providerStatus: "ACTIVE",
      productGenerationStrategy: null,
      requiresHybridPipeline: false,
      eligibility: "ELIGIBLE",
      eligibilityReason: null,
      estimatedCost: estimateSceneCost("heygen-image-avatar", 3.55082),
      persistedStatus: "READY",
      persistedStatusReason: null,
      existingAsset: null,
    },
  ],
  null,
);
assert.equal(readiness.status, "READY", "readiness aceita CHARACTER_VIDEO coberto com custo USD conhecido");

const wanReadiness = evaluateCampaignExecutionReadiness(
  [
    {
      sceneId: "scene-background",
      sceneOrder: 1,
      purpose: "HOOK",
      providerCapability: "TEXT_TO_VIDEO",
      selectedProvider: "wan-2-5-t2v",
      providerStatus: "ACTIVE",
      productGenerationStrategy: null,
      requiresHybridPipeline: false,
      eligibility: "ELIGIBLE",
      eligibilityReason: null,
      estimatedCost: estimateSceneCost("wan-2-5-t2v", 5),
      persistedStatus: "READY",
      persistedStatusReason: null,
      existingAsset: null,
    },
  ],
  null,
);
assert.equal(wanReadiness.status, "READY", "readiness aceita TEXT_TO_VIDEO coberto pelo WAN");
assert.equal(wanReadiness.scenes[0].status, "GENERATE", "WAN vira caminho GENERATE, nao REUSE/BLOCKED");

const mockReadiness = evaluateCampaignExecutionReadiness(
  [
    {
      sceneId: "scene-mock",
      sceneOrder: 1,
      purpose: "HOOK",
      providerCapability: "CHARACTER_VIDEO",
      selectedProvider: "mock",
      providerStatus: "ACTIVE",
      productGenerationStrategy: null,
      requiresHybridPipeline: false,
      eligibility: "ELIGIBLE",
      eligibilityReason: null,
      estimatedCost: estimateSceneCost("mock", 3.55082),
      persistedStatus: "READY",
      persistedStatusReason: null,
      existingAsset: null,
    },
  ],
  null,
);
assert.equal(isProviderProductionEligible("mock"), false, "mock continua inelegivel em producao");
assert.equal(mockReadiness.status, "BLOCKED_PROVIDER_COVERAGE", "mock bloqueia readiness de producao");

assert.equal(fetchCalls, 0, "nenhuma chamada externa durante readiness/teste");

console.log("heygen-image-avatar provider tests passed");
