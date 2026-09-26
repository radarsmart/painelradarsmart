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

global.fetch = async () => {
  throw new Error("External calls are forbidden in current repair planning.");
};

const { planCommercialRepair } = require("../lib/commercial-video/repair/repair-planner.ts");

const resumePayload = JSON.parse(fs.readFileSync(path.join(root, "temp", "first-full-execute-resume", "resume-execute-result.json"), "utf8"));
const qualityPayload = JSON.parse(fs.readFileSync(path.join(root, "temp", "first-full-execute-resume", "commercial-quality-result.json"), "utf8"));

const repairPlan = planCommercialRepair({
  runnerResult: resumePayload.result,
  qualityResult: qualityPayload.quality,
  sourceJobId: resumePayload.resumeJobId,
  offer: {
    price: 49.9,
    priceText: "R$ 49,90",
    originalPrice: null,
    discountPercent: 0,
    discountText: null,
  },
  sceneContexts: [
    {
      sceneId: "scene-1",
      baseOverlays: { priceText: null, discountText: null, ctaText: null },
    },
    {
      sceneId: "scene-2",
      productStrategyInput: {
        mediaType: "PRODUCT_VIDEO",
        productIntegrityRisk: "HIGH",
        fidelityRisk: "HIGH",
        hasProductReference: true,
      },
      baseOverlays: { priceText: "R$ 49,90", discountText: "0% OFF", ctaText: null },
    },
    {
      sceneId: "scene-3",
      baseOverlays: { priceText: null, discountText: null, ctaText: "Acesse o Radar Smart." },
    },
  ],
});

const outputPath = path.join(root, "temp", "first-full-execute-resume", "commercial-repair-plan.json");
fs.writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), repairPlan }, null, 2));

console.log(JSON.stringify({ outputPath, repairPlan }, null, 2));
