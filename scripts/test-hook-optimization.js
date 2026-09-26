// Radar Creative AI - SCROLL-STOP HOOK OPTIMIZATION V1 - Test Suite
//
// Mesmo padrao dos scripts anteriores. Cobre: geracao das 4 variantes,
// avaliacao via swap-and-score (mesmo scorer), e o motor de decisao
// (nunca troca por bonus mecanico, nunca forca PASS, tie-break prefere
// nao-apresentadora).

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

const {
  generateHookVariantConcepts,
  evaluateHookVariant,
  decideHookOptimization,
  MIN_SCROLL_STOP_DELTA_FOR_MATERIAL_IMPROVEMENT,
  MIN_DIMENSIONS_IMPROVED_OR_KEPT,
} = require("../lib/commercial-video/persuasion/hook-optimization.ts");
const { buildPersuasionStoryboard } = require("../lib/commercial-video/persuasion/persuasion-storyboard-builder.ts");
const { generateSalesAngleCandidates, selectWinningSalesAngle } = require("../lib/commercial-video/persuasion/sales-angle-engine.ts");
const { GENERIC_EVIDENCE, GENERIC_DESIRE_PROFILE, NEUTRAL_MOTIVATION_ANSWERS, FIXTURE_B_EVIDENCE } = require("../lib/commercial-video/persuasion/anti-gaming-fixtures.ts");
const { buildBenefitVisualizationPlans } = require("../lib/commercial-video/persuasion/benefit-visualization.ts");

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (err) {
    results.push({ name, status: "FAIL", error: err.message });
  }
}

function fakeEval(variantId, overrides) {
  const baseMetrics = {
    hookPersuasion: 80, scrollStopPower: 69, desireContribution: 70, productRelevance: 75, firstSecondClarity: 70,
    specificity: 75, priceCuriosity: 80, humanInterest: 35, visualInterrupt: 70, genericAdRisk: "LOW", claimSafety: "PASS",
    characterIntegration: 92, contextRelevance: 90,
  };
  return {
    variantId,
    label: variantId,
    scene: { sceneId: variantId, characterNarrativeRole: variantId === "D_PRESENTER_CONTROL" ? "HOOK_PRESENTER" : "NONE" },
    metrics: { ...baseMetrics, ...overrides },
    whyViewerWouldStop: "fixture",
    whyViewerWouldKeepWatching: "fixture",
    whatTheyWantToKnowNext: "fixture",
    firstSecondSignal: "fixture",
    weak: false,
    scoredStoryboard: {},
  };
}

async function run() {
  // ===================== Geracao de variantes =====================
  const evidence = FIXTURE_B_EVIDENCE;
  const desireProfile = GENERIC_DESIRE_PROFILE;
  const benefitPlans = buildBenefitVisualizationPlans(evidence, desireProfile);
  const salesAngle = selectWinningSalesAngle(generateSalesAngleCandidates(evidence, desireProfile));
  const { storyboard } = buildPersuasionStoryboard({ evidence, desireProfile, salesAngle, benefitPlans, useCharacter: true });
  const baselineHookScene = storyboard.scenes[0];

  let variants;
  await test("1 - generateHookVariantConcepts produz exatamente as 4 variantes pedidas", async () => {
    variants = generateHookVariantConcepts(baselineHookScene, evidence, desireProfile, benefitPlans);
    assert.deepEqual(variants.map((v) => v.variantId), ["A_CURRENT", "B_PRODUCT_HUMAN_CONTEXT", "C_PRICE_DISCOVERY", "D_PRESENTER_CONTROL"]);
  });

  await test("2 - HOOK A e byte-identico ao HOOK real do storyboard (baseline nunca reescrito)", async () => {
    const hookA = variants.find((v) => v.variantId === "A_CURRENT");
    assert.deepEqual(hookA.scene, baselineHookScene);
  });

  await test("3 - HOOK B nunca usa apresentadora completa (so DEMONSTRATOR, mao/produto)", async () => {
    const hookB = variants.find((v) => v.variantId === "B_PRODUCT_HUMAN_CONTEXT");
    assert.equal(hookB.scene.characterNarrativeRole, "DEMONSTRATOR");
  });

  await test("4 - HOOK C explora preco real sem inventar desconto (discountPercent nao mencionado)", async () => {
    const hookC = variants.find((v) => v.variantId === "C_PRICE_DISCOVERY");
    assert.equal(hookC.scene.characterNarrativeRole, "NONE");
    assert.equal(hookC.scene.offerRole, "SETUP");
    assert.ok(!hookC.scene.suggestedNarration.toLowerCase().includes("desconto"));
  });

  await test("5 - HOOK D (apresentadora controle) tem relacao concreta com o produto (nunca so presenca)", async () => {
    const hookD = variants.find((v) => v.variantId === "D_PRESENTER_CONTROL");
    assert.equal(hookD.scene.characterNarrativeRole, "HOOK_PRESENTER");
    assert.equal(hookD.scene.characterPerformanceIntent.productInteractionIntent, "APPLIED");
    assert.notEqual(hookD.scene.productInteraction, "NONE");
  });

  // ===================== Avaliacao via swap-and-score (scorer real) =====================
  let evaluations;
  await test("6 - evaluateHookVariant usa o MESMO scorer (scoreStoryboard) - metrics batem com o scored real", async () => {
    evaluations = variants.map((variant) => evaluateHookVariant({ variant, baselineStoryboard: storyboard, evidence, desireProfile, motivationAnswers: NEUTRAL_MOTIVATION_ANSWERS }));
    for (const ev of evaluations) {
      assert.equal(ev.metrics.scrollStopPower, ev.scoredStoryboard.scrollStop.score);
      assert.equal(ev.metrics.hookPersuasion, ev.scoredStoryboard.hookPersuasion.score);
      assert.equal(ev.metrics.desireContribution, ev.scoredStoryboard.desireScore);
    }
  });

  await test("7 - evaluateHookVariant so troca a cena de HOOK - o resto do storyboard fica identico", async () => {
    const evB = evaluations.find((e) => e.variantId === "B_PRODUCT_HUMAN_CONTEXT");
    assert.deepEqual(evB.scoredStoryboard.storyboard.scenes.slice(1), storyboard.scenes.slice(1));
  });

  await test("8 - HOOK A avaliado bate exatamente com o storyboard original (sem troca)", async () => {
    const evA = evaluations.find((e) => e.variantId === "A_CURRENT");
    assert.deepEqual(evA.scoredStoryboard.storyboard.scenes, storyboard.scenes);
  });

  await test("9 - firstSecondSignal nunca fica vazio, marca weak=true quando so ha estetica", async () => {
    const fakeScene = { characterNarrativeRole: "NONE", productInteraction: "NONE", benefitClaimId: null, offerRole: "NONE", whyContinueWatching: "produto bonito" };
    const fakeVariant = { variantId: "A_CURRENT", label: "x", scene: fakeScene, rationale: "x" };
    const ev = evaluateHookVariant({ variant: fakeVariant, baselineStoryboard: storyboard, evidence, desireProfile, motivationAnswers: NEUTRAL_MOTIVATION_ANSWERS });
    assert.equal(ev.weak, true);
    assert.ok(ev.firstSecondSignal.includes("fraco"));
  });

  // ===================== Motor de decisao =====================
  await test("10 - decideHookOptimization NUNCA troca por delta pequeno (bonus mecanico de personagem, +3)", async () => {
    const baseline = fakeEval("A_CURRENT", { scrollStopPower: 69 });
    const candidateD = fakeEval("D_PRESENTER_CONTROL", { scrollStopPower: 72, humanInterest: 65 }); // delta=3, abaixo do minimo
    const decision = decideHookOptimization([baseline, candidateD]);
    assert.equal(decision.selectedVariant, "A_CURRENT");
    assert.equal(decision.materialImprovement, false);
  });

  await test("11 - decideHookOptimization troca quando ha melhora material real (delta >= 5 + dimensoes mantidas)", async () => {
    const baseline = fakeEval("A_CURRENT", { scrollStopPower: 69, hookPersuasion: 80, desireContribution: 70, contextRelevance: 90 });
    const candidateB = fakeEval("B_PRODUCT_HUMAN_CONTEXT", { scrollStopPower: 78, hookPersuasion: 85, desireContribution: 75, contextRelevance: 92 });
    const decision = decideHookOptimization([baseline, candidateB]);
    assert.equal(decision.selectedVariant, "B_PRODUCT_HUMAN_CONTEXT");
    assert.equal(decision.materialImprovement, true);
    assert.equal(decision.scoreDelta, 9);
  });

  await test("12 - decideHookOptimization NUNCA seleciona quando ha regressao de GenericAiAdRisk/ClaimSafety mesmo com delta alto", async () => {
    const baseline = fakeEval("A_CURRENT", { scrollStopPower: 69 });
    const risky = fakeEval("D_PRESENTER_CONTROL", { scrollStopPower: 85, genericAdRisk: "HIGH" });
    const decision = decideHookOptimization([baseline, risky]);
    assert.equal(decision.selectedVariant, "A_CURRENT");
    assert.equal(decision.materialImprovement, false);
  });

  await test("13 - tie-break: entre B e D com deltas dentro da margem, B (sem apresentadora) vence, nunca D", async () => {
    const baseline = fakeEval("A_CURRENT", { scrollStopPower: 69, hookPersuasion: 80, desireContribution: 70, contextRelevance: 90 });
    const candidateB = fakeEval("B_PRODUCT_HUMAN_CONTEXT", { scrollStopPower: 78, hookPersuasion: 82, desireContribution: 71, contextRelevance: 91 });
    const candidateD = fakeEval("D_PRESENTER_CONTROL", { scrollStopPower: 79, hookPersuasion: 82, desireContribution: 71, contextRelevance: 91 }); // 1 ponto acima de B, dentro da margem de 2
    const decision = decideHookOptimization([baseline, candidateB, candidateD]);
    assert.equal(decision.selectedVariant, "B_PRODUCT_HUMAN_CONTEXT", "quando dentro da margem de empate, nunca escolher a apresentadora so por 1 ponto a mais");
  });

  await test("14 - tie-break NUNCA troca B por D fora da margem (D genuinamente melhor por mais que a margem)", async () => {
    const baseline = fakeEval("A_CURRENT", { scrollStopPower: 69, hookPersuasion: 80, desireContribution: 70, contextRelevance: 90 });
    const candidateB = fakeEval("B_PRODUCT_HUMAN_CONTEXT", { scrollStopPower: 76, hookPersuasion: 82, desireContribution: 71, contextRelevance: 91 });
    const candidateD = fakeEval("D_PRESENTER_CONTROL", { scrollStopPower: 90, hookPersuasion: 90, desireContribution: 85, contextRelevance: 95 }); // muito melhor, fora da margem
    const decision = decideHookOptimization([baseline, candidateB, candidateD]);
    assert.equal(decision.selectedVariant, "D_PRESENTER_CONTROL");
    assert.ok(decision.tradeoffs.length > 0);
  });

  await test("15 - thresholds sao os documentados (fixados antes do DRY_RUN, nunca ajustados depois)", async () => {
    assert.equal(MIN_SCROLL_STOP_DELTA_FOR_MATERIAL_IMPROVEMENT, 5);
    assert.equal(MIN_DIMENSIONS_IMPROVED_OR_KEPT, 3);
  });

  await test("16 - determinismo: mesma entrada produz a mesma decisao", async () => {
    const baseline = fakeEval("A_CURRENT", { scrollStopPower: 69 });
    const candidateB = fakeEval("B_PRODUCT_HUMAN_CONTEXT", { scrollStopPower: 78, desireContribution: 75, contextRelevance: 92 });
    const d1 = decideHookOptimization([baseline, candidateB]);
    const d2 = decideHookOptimization([baseline, candidateB]);
    assert.deepEqual(d1, d2);
  });

  const failed = results.filter((r) => r.status === "FAIL");
  for (const r of results) {
    console.log(`${r.status === "PASS" ? "OK  " : "FAIL"} - ${r.name}${r.error ? ` :: ${r.error}` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} testes passaram. fetchCalls=${fetchCalls}`);
  if (failed.length > 0) process.exitCode = 1;
}

run();
