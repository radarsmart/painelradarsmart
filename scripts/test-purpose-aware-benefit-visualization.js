// Radar Creative AI - PURPOSE-AWARE BENEFIT VISUALIZATION V1 - Anti-Gaming Tests
//
// Mesmo padrao dos scripts anteriores. Cobre os 6 fixtures pedidos (item
// 15 da tarefa): OFFER/CTA com packshot legitimo nunca sao penalizados
// automaticamente, BENEFIT so-packshot perde score, comercial 100%
// packshot falha, uma boa mistura demonstracao+packshot legitimo passa, e
// claim nao suportada continua reprovando CLAIM_SAFETY (camada separada,
// nunca contornada por esta mudanca).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

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

let fetchCalls = 0;
global.fetch = async () => {
  fetchCalls += 1;
  throw new Error("External calls are forbidden in this test.");
};

const { resolveBenefitResponsibility, buildCommercialBenefitCoverage, scoreBenefitVisualization } = require("../lib/commercial-video/persuasion/benefit-visualization.ts");
const { scoreStoryboard } = require("../lib/commercial-video/persuasion/scorer.ts");
const { PERSUASION_THRESHOLDS } = require("../lib/commercial-video/persuasion/commercial-persuasion-quality-gate.ts");
const { GENERIC_EVIDENCE, GENERIC_DESIRE_PROFILE, NEUTRAL_MOTIVATION_ANSWERS } = require("../lib/commercial-video/persuasion/anti-gaming-fixtures.ts");

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (err) {
    results.push({ name, status: "FAIL", error: err.message });
  }
}

function baseScene(overrides) {
  return {
    purpose: "PRODUCT",
    durationSecondsHint: 3,
    arcStage: "INTEREST",
    productVisualRole: "PACKSHOT",
    productInteraction: "NONE",
    environmentDescription: "estudio neutro",
    environmentRelevance: "GENERIC_STUDIO",
    environmentJustification: null,
    characterNarrativeRole: "NONE",
    characterPerformanceIntent: null,
    benefitClaimId: null,
    salesAngleAlignment: false,
    offerRole: "NONE",
    ctaRole: "NONE",
    overlayCategories: [],
    whyContinueWatching: "produto bonito",
    narrationIntent: "generico",
    suggestedNarration: "Conheca o produto.",
    visualConcept: "produto em destaque",
    consumerState: "neutro",
    persuasionObjective: "mostrar o produto",
    ...overrides,
  };
}

async function run() {
  // ===================== A) OFFER com packshot legitimo =====================
  await test("A - OFFER com packshot legitimo nunca perde benefit score automaticamente (responsibility=NONE)", async () => {
    const scenes = [
      baseScene({ sceneId: "s1", order: 1, purpose: "HOOK" }),
      baseScene({ sceneId: "s2", order: 2, purpose: "BENEFIT", productVisualRole: "DEMONSTRATION", productInteraction: "APPLIED", benefitClaimId: "claim-1" }),
      baseScene({ sceneId: "s3", order: 3, purpose: "OFFER", productVisualRole: "PACKSHOT", offerRole: "REVEAL" }),
      baseScene({ sceneId: "s4", order: 4, purpose: "CTA", productVisualRole: "PACKSHOT", ctaRole: "PRIMARY" }),
    ];
    const offerScene = scenes.find((s) => s.purpose === "OFFER");
    assert.equal(resolveBenefitResponsibility(offerScene), "NONE");
    const coverage = buildCommercialBenefitCoverage(scenes);
    assert.ok(!coverage.reasons.some((r) => r.includes("OFFER")), "OFFER packshot nunca deveria gerar razao de penalidade");
  });

  // ===================== B) CTA sem demonstracao =====================
  await test("B - CTA sem demonstracao nunca perde benefit score automaticamente (responsibility=NONE)", async () => {
    const scenes = [
      baseScene({ sceneId: "s1", order: 1, purpose: "HOOK" }),
      baseScene({ sceneId: "s2", order: 2, purpose: "BENEFIT", productVisualRole: "DEMONSTRATION", benefitClaimId: "claim-1" }),
      baseScene({ sceneId: "s3", order: 3, purpose: "CTA", productVisualRole: "PACKSHOT", ctaRole: "PRIMARY" }),
    ];
    const ctaScene = scenes.find((s) => s.purpose === "CTA");
    assert.equal(resolveBenefitResponsibility(ctaScene), "NONE");
    assert.equal(ctaScene.benefitClaimId, null);
  });

  // ===================== C) BENEFIT scene so-packshot =====================
  await test("C - cena BENEFIT com apenas packshot (sem demonstracao real) perde score", async () => {
    const scenes = [
      baseScene({ sceneId: "s1", order: 1, purpose: "HOOK" }),
      baseScene({ sceneId: "s2", order: 2, purpose: "BENEFIT", productVisualRole: "PACKSHOT", benefitClaimId: "claim-1" }),
      baseScene({ sceneId: "s3", order: 3, purpose: "OFFER", productVisualRole: "PACKSHOT" }),
      baseScene({ sceneId: "s4", order: 4, purpose: "CTA", productVisualRole: "PACKSHOT" }),
    ];
    const benefitScene = scenes.find((s) => s.purpose === "BENEFIT");
    assert.equal(resolveBenefitResponsibility(benefitScene), "PRIMARY");
    const coverage = buildCommercialBenefitCoverage(scenes);
    assert.equal(coverage.responsibleScenes.find((s) => s.sceneId === "s2").demonstrated, false);
    assert.ok(coverage.reasons.some((r) => r.includes("NENHUMA realmente demonstra")));
    assert.ok(coverage.unsupportedBenefits.includes("claim-1"));
  });

  // ===================== D) Comercial inteiro so de packshots =====================
  await test("D - comercial inteiro so de packshots reprova BENEFIT_VISUALIZATION (score < threshold)", async () => {
    const scenes = ["HOOK", "PRODUCT", "BENEFIT", "OFFER", "CTA"].map((purpose, i) =>
      baseScene({ sceneId: `s${i + 1}`, order: i + 1, purpose, productVisualRole: "PACKSHOT", benefitClaimId: purpose === "BENEFIT" ? "claim-1" : null }),
    );
    const result = scoreBenefitVisualization(scenes);
    assert.ok(result.score < PERSUASION_THRESHOLDS.BENEFIT_VISUALIZATION, `esperado score < ${PERSUASION_THRESHOLDS.BENEFIT_VISUALIZATION}, obtido ${result.score}`);
    assert.ok(result.coverage.packshotDominancePenalty > 0, "5/5 cenas packshot deveria acionar a penalidade de dominancia total");
  });

  // ===================== E) Boa demonstracao + offer/cta packshot legitimos =====================
  await test("E - boa demonstracao + OFFER/CTA packshot legitimos pode PASSAR (score >= threshold)", async () => {
    const scenes = [
      baseScene({ sceneId: "s1", order: 1, purpose: "HOOK", productVisualRole: "INGREDIENT_STORY", benefitClaimId: "claim-1" }),
      baseScene({ sceneId: "s2", order: 2, purpose: "PRODUCT", productVisualRole: "PACKSHOT" }),
      baseScene({ sceneId: "s3", order: 3, purpose: "BENEFIT", productVisualRole: "DEMONSTRATION", productInteraction: "APPLIED", benefitClaimId: "claim-1" }),
      baseScene({ sceneId: "s4", order: 4, purpose: "OFFER", productVisualRole: "PACKSHOT", offerRole: "REVEAL" }),
      baseScene({ sceneId: "s5", order: 5, purpose: "CTA", productVisualRole: "PACKSHOT", ctaRole: "PRIMARY" }),
    ];
    const result = scoreBenefitVisualization(scenes);
    assert.ok(result.score >= PERSUASION_THRESHOLDS.BENEFIT_VISUALIZATION, `esperado score >= ${PERSUASION_THRESHOLDS.BENEFIT_VISUALIZATION}, obtido ${result.score} - reasons=${JSON.stringify(result.reasons)}`);
  });

  // ===================== F) Claim nao suportada continua reprovando CLAIM_SAFETY =====================
  await test("F - visualizar uma claim FORBIDDEN ainda reprova CLAIM_SAFETY no gate completo (camada separada, nunca contornada)", async () => {
    const forbiddenEvidence = {
      ...GENERIC_EVIDENCE,
      forbiddenClaims: [{ id: "forbidden-1", text: "elimina rugas em 7 dias", status: "FORBIDDEN", source: "CATEGORY_INFERENCE", confidence: "LOW", reason: "fixture" }],
    };
    const storyboard = {
      label: "FIXTURE_F",
      salesAngle: "PRODUCT_DISCOVERY",
      totalDurationSecondsHint: 15,
      sceneCount: 4,
      scenes: [
        baseScene({ sceneId: "s1", order: 1, purpose: "HOOK" }),
        baseScene({ sceneId: "s2", order: 2, purpose: "BENEFIT", productVisualRole: "DEMONSTRATION", benefitClaimId: "forbidden-1" }),
        baseScene({ sceneId: "s3", order: 3, purpose: "OFFER", productVisualRole: "PACKSHOT" }),
        baseScene({ sceneId: "s4", order: 4, purpose: "CTA", productVisualRole: "PACKSHOT" }),
      ],
    };
    const scored = scoreStoryboard("FIXTURE_F", storyboard, forbiddenEvidence, GENERIC_DESIRE_PROFILE, NEUTRAL_MOTIVATION_ANSWERS);
    const claimSafetyCheck = scored.qualityGate.checks.find((c) => c.name === "CLAIM_SAFETY");
    assert.equal(claimSafetyCheck.status, "FAIL");
    // A demonstracao em si (boa cinematografia) nao deveria "comprar" o
    // CLAIM_SAFETY - mesmo com BENEFIT_VISUALIZATION alto, o gate inteiro
    // ainda reprova.
    assert.equal(scored.qualityGate.status, "FAIL");
  });

  // ===================== Regressao direta: Kokeshi GROUNDED agora deve passar BENEFIT_VISUALIZATION =====================
  await test("G - storyboard real com padrao HOOK(demo)+PRODUCT(pack)+BENEFIT(demo)x2+OFFER(pack)+CTA(pack) agora PASSA BENEFIT_VISUALIZATION", async () => {
    const scenes = [
      baseScene({ sceneId: "pv1-scene-1", order: 1, purpose: "HOOK", productVisualRole: "INGREDIENT_STORY", benefitClaimId: "packaging-0" }),
      baseScene({ sceneId: "pv1-scene-2", order: 2, purpose: "PRODUCT", productVisualRole: "PACKSHOT" }),
      baseScene({ sceneId: "pv1-scene-3", order: 3, purpose: "BENEFIT", productVisualRole: "INGREDIENT_STORY", benefitClaimId: "packaging-0" }),
      baseScene({ sceneId: "pv1-scene-4", order: 4, purpose: "BENEFIT", productVisualRole: "EXPERIENCE", benefitClaimId: "packaging-1" }),
      baseScene({ sceneId: "pv1-scene-5", order: 5, purpose: "OFFER", productVisualRole: "PACKSHOT" }),
      baseScene({ sceneId: "pv1-scene-6", order: 6, purpose: "CTA", productVisualRole: "PACKSHOT" }),
    ];
    const result = scoreBenefitVisualization(scenes);
    assert.equal(result.score, 100, `esperado 100 (cobertura total, sem dominancia de packshot), obtido ${result.score}`);
  });

  const failed = results.filter((r) => r.status === "FAIL");
  for (const r of results) {
    console.log(`${r.status === "PASS" ? "OK  " : "FAIL"} - ${r.name}${r.error ? ` :: ${r.error}` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} testes passaram. fetchCalls=${fetchCalls}`);
  if (failed.length > 0) process.exitCode = 1;
}

run();
