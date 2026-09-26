// Radar Creative AI - SCROLL-STOP ENGINE V2 - Calibration + Monotonicity Tests
//
// Mesmo padrao dos scripts anteriores. Cobre os 8 fixtures de calibracao
// pedidos (item 17) + testes de monotonicidade (item 18) + determinismo
// (item 19) + headroom real acima do teto V1 (~72).

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

const { scoreScrollStop } = require("../lib/commercial-video/persuasion/scroll-stop-engine.ts");
const { GENERIC_EVIDENCE, FIXTURE_C_EVIDENCE } = require("../lib/commercial-video/persuasion/anti-gaming-fixtures.ts");

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (err) {
    results.push({ name, status: "FAIL", error: err.message });
  }
}

const CHEAP_EVIDENCE = { ...GENERIC_EVIDENCE, price: 13.16 };

function baseScene(overrides) {
  return {
    sceneId: "fixture-hook",
    order: 1,
    purpose: "HOOK",
    durationSecondsHint: 2,
    arcStage: "ATTENTION",
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
    whyContinueWatching: "Conheca o produto.",
    narrationIntent: "generico",
    suggestedNarration: "Conheca o produto.",
    visualConcept: "produto em destaque",
    consumerState: "neutro",
    persuasionObjective: "mostrar o produto",
    ...overrides,
  };
}

function performanceIntent(role, productInteractionIntent) {
  return {
    narrativeRole: role,
    sceneObjective: "fixture",
    relationshipToProduct: "fixture",
    eyeDirection: "fixture",
    gestureIntent: "fixture",
    productInteractionIntent,
    emotionalTone: "fixture",
    transitionContribution: "fixture",
  };
}

// --- Fixtures de calibracao A-H ---------------------------------------------

const FIXTURE_A_STATIC_PRODUCT = baseScene({ productVisualRole: "PACKSHOT", productInteraction: "NONE" });

const FIXTURE_B_BEAUTIFUL_GENERIC_REVEAL = baseScene({
  productVisualRole: "FLOATING_HERO",
  productInteraction: "NONE",
  environmentRelevance: "UNRELATED_ASPIRATIONAL",
  whyContinueWatching: "Um produto surpreendente.",
});

const FIXTURE_C_HUMAN_HOLDING_PASSIVELY = baseScene({
  productVisualRole: "PACKSHOT",
  productInteraction: "HELD",
  characterNarrativeRole: "DEMONSTRATOR",
  characterPerformanceIntent: performanceIntent("DEMONSTRATOR", "HELD"),
});

const FIXTURE_D_PRODUCT_APPLICATION = baseScene({
  productVisualRole: "DEMONSTRATION",
  productInteraction: "APPLIED",
  characterNarrativeRole: "DEMONSTRATOR",
  characterPerformanceIntent: performanceIntent("DEMONSTRATOR", "APPLIED"),
  benefitClaimId: "claim-textura",
});

const FIXTURE_E_PRICE_CURIOSITY = baseScene({
  productVisualRole: "PACKSHOT",
  productInteraction: "HELD",
  offerRole: "SETUP",
  whyContinueWatching: "Quanto sera que custa isso?",
});

const FIXTURE_F_CHAOTIC_MOTION = baseScene({
  productVisualRole: "PACKSHOT",
  productInteraction: "DEMONSTRATED",
  characterNarrativeRole: "NONE",
  benefitClaimId: null,
  offerRole: "NONE",
});

const FIXTURE_G_STRONG_PATTERN_INTERRUPT = baseScene({
  productVisualRole: "DEMONSTRATION",
  productInteraction: "APPLIED",
  characterNarrativeRole: "DEMONSTRATOR",
  characterPerformanceIntent: performanceIntent("DEMONSTRATOR", "APPLIED"),
  benefitClaimId: "claim-textura",
  offerRole: "SETUP",
  environmentRelevance: "PRODUCT_NATIVE_CONTEXT",
  whyContinueWatching: "Por que esse creme custa tao pouco?",
});

// H usa a MESMA cena forte de G, mas evidence com claim forbidden (ClaimSafety
// e responsabilidade de outra camada, nunca do ScrollStop).
const FIXTURE_H_CLICKBAIT_UNSUPPORTED_SCENE = FIXTURE_G_STRONG_PATTERN_INTERRUPT;

async function run() {
  // ===================== Fixtures de calibracao =====================
  let scoreA, scoreB, scoreC, scoreD, scoreE, scoreF, scoreG;

  await test("A - STATIC_PRODUCT: score baixo/medio (produto parado, sem sinal)", async () => {
    scoreA = scoreScrollStop(FIXTURE_A_STATIC_PRODUCT, CHEAP_EVIDENCE);
    assert.ok(scoreA.score < 55, `esperado <55, obtido ${scoreA.score}`);
  });

  await test("B - BEAUTIFUL_GENERIC_REVEAL: NAO ganha score alto so pela estetica/ambiente aspiracional", async () => {
    scoreB = scoreScrollStop(FIXTURE_B_BEAUTIFUL_GENERIC_REVEAL, CHEAP_EVIDENCE);
    assert.ok(scoreB.score < 50, `esperado <50, obtido ${scoreB.score}`);
    assert.ok(scoreB.score <= scoreA.score + 5, "generico flutuante nao deveria superar materialmente o produto estatico simples");
  });

  await test("C - HUMAN_HOLDING_PRODUCT_PASSIVELY: humanInterest limitado (nao maximo so por presenca)", async () => {
    scoreC = scoreScrollStop(FIXTURE_C_HUMAN_HOLDING_PASSIVELY, CHEAP_EVIDENCE);
    assert.ok(scoreC.components.humanInterest < 65, `esperado humanInterest<65 (nao maximo), obtido ${scoreC.components.humanInterest}`);
    assert.ok(scoreC.components.humanInterest > 30, "ainda deveria ser > que 'sem personagem'");
  });

  await test("D - PRODUCT_APPLICATION: score MAIOR que C (interacao ativa real > passiva)", async () => {
    scoreD = scoreScrollStop(FIXTURE_D_PRODUCT_APPLICATION, CHEAP_EVIDENCE);
    assert.ok(scoreD.score > scoreC.score, `esperado D(${scoreD.score}) > C(${scoreC.score})`);
    assert.equal(scoreD.components.humanInterest, 85);
  });

  await test("E - PRICE_CURIOSITY: priceCuriosity/curiosityGap altos quando preco e referenciado e coerente", async () => {
    scoreE = scoreScrollStop(FIXTURE_E_PRICE_CURIOSITY, CHEAP_EVIDENCE);
    assert.ok(scoreE.components.priceCuriosity >= 80, `esperado priceCuriosity>=80, obtido ${scoreE.components.priceCuriosity}`);
    assert.ok(scoreE.components.curiosityGap >= 50, `esperado curiosityGap>=50, obtido ${scoreE.components.curiosityGap}`);
  });

  await test("F - CHAOTIC_MOTION: motion sozinho (sem outros sinais) NAO infla o score total indevidamente", async () => {
    scoreF = scoreScrollStop(FIXTURE_F_CHAOTIC_MOTION, GENERIC_EVIDENCE);
    assert.equal(scoreF.components.motionInterest, 85, "motionInterest deveria estar maximo (productInteraction=DEMONSTRATED)");
    assert.ok(scoreF.score < 55, `mesmo com motionInterest maximo, score total deveria ficar moderado/baixo sem os outros sinais - obtido ${scoreF.score}`);
  });

  await test("G - STRONG_PATTERN_INTERRUPT: score alto (>=80), combinacao real de acao+especificidade+curiosidade", async () => {
    scoreG = scoreScrollStop(FIXTURE_G_STRONG_PATTERN_INTERRUPT, CHEAP_EVIDENCE);
    assert.ok(scoreG.score >= 80, `esperado >=80, obtido ${scoreG.score}`);
  });

  await test("H - CLICKBAIT_UNSUPPORTED: ScrollStop alto, mas ClaimSafety continua sendo responsabilidade de outra camada (nao contornada aqui)", async () => {
    const scoreH = scoreScrollStop(FIXTURE_H_CLICKBAIT_UNSUPPORTED_SCENE, FIXTURE_C_EVIDENCE);
    assert.ok(scoreH.score >= 75, "ScrollStop deveria continuar alto - essa camada nunca deve saber/decidir sobre claim safety");
    assert.ok(FIXTURE_C_EVIDENCE.forbiddenClaims.length > 0, "fixture de evidencia usada tem claim FORBIDDEN real - CLAIM_SAFETY deve reprovar em outra camada (commercial-persuasion-quality-gate.ts), nunca aqui");
  });

  // ===================== Headroom real acima do teto V1 (~72) =====================
  await test("Headroom - fixture G supera o teto matematico provado do V1 (~72)", async () => {
    assert.ok(scoreG.score > 72, `V1 tinha teto provado de ~72 - V2 deveria superar isso com uma combinacao real forte, obtido ${scoreG.score}`);
  });

  await test("Headroom - existe distancia real entre STATIC (A) e STRONG_PATTERN_INTERRUPT (G)", async () => {
    assert.ok(scoreG.score - scoreA.score >= 30, `esperado gap >=30 entre A e G, obtido ${scoreG.score - scoreA.score}`);
  });

  // ===================== Monotonicidade =====================
  await test("Monotonicidade - HELD -> APPLIED nunca reduz o score (ganha interacao, nao perde nada)", async () => {
    const held = scoreScrollStop(baseScene({ productVisualRole: "DEMONSTRATION", productInteraction: "HELD", characterNarrativeRole: "DEMONSTRATOR", characterPerformanceIntent: performanceIntent("DEMONSTRATOR", "HELD"), benefitClaimId: "c1" }), CHEAP_EVIDENCE);
    const applied = scoreScrollStop(baseScene({ productVisualRole: "DEMONSTRATION", productInteraction: "APPLIED", characterNarrativeRole: "DEMONSTRATOR", characterPerformanceIntent: performanceIntent("DEMONSTRATOR", "APPLIED"), benefitClaimId: "c1" }), CHEAP_EVIDENCE);
    assert.ok(applied.score >= held.score, `applied(${applied.score}) deveria ser >= held(${held.score})`);
  });

  await test("Monotonicidade - adicionar pergunta explicita no gancho nunca reduz curiosityGap", async () => {
    const semPergunta = scoreScrollStop(baseScene({ whyContinueWatching: "Descubra este produto." }), GENERIC_EVIDENCE);
    const comPergunta = scoreScrollStop(baseScene({ whyContinueWatching: "Por que esse produto e diferente?" }), GENERIC_EVIDENCE);
    assert.ok(comPergunta.components.curiosityGap >= semPergunta.components.curiosityGap);
  });

  await test("Monotonicidade - FLOATING_HERO nunca supera PACKSHOT/DEMONSTRATION em productRelevance/visualInterrupt (mesmos outros campos)", async () => {
    const floating = scoreScrollStop(baseScene({ productVisualRole: "FLOATING_HERO" }), GENERIC_EVIDENCE);
    const packshot = scoreScrollStop(baseScene({ productVisualRole: "PACKSHOT" }), GENERIC_EVIDENCE);
    assert.ok(packshot.components.productRelevance >= floating.components.productRelevance);
    assert.ok(packshot.components.visualInterrupt >= floating.components.visualInterrupt);
  });

  await test("Monotonicidade - perder productRelevance/contexto nao deveria ser compensado so por mais motion", async () => {
    const relevantLowMotion = scoreScrollStop(baseScene({ productVisualRole: "DEMONSTRATION", productInteraction: "HELD" }), GENERIC_EVIDENCE);
    const irrelevantHighMotion = scoreScrollStop(baseScene({ productVisualRole: "FLOATING_HERO", productInteraction: "DEMONSTRATED" }), GENERIC_EVIDENCE);
    assert.ok(relevantLowMotion.components.productRelevance > irrelevantHighMotion.components.productRelevance, "productVisualRole ainda deve dominar productRelevance, independente de motion");
  });

  // ===================== Determinismo =====================
  await test("Determinismo - mesma entrada produz o mesmo score e breakdown", async () => {
    const r1 = scoreScrollStop(FIXTURE_G_STRONG_PATTERN_INTERRUPT, CHEAP_EVIDENCE);
    const r2 = scoreScrollStop(FIXTURE_G_STRONG_PATTERN_INTERRUPT, CHEAP_EVIDENCE);
    assert.deepEqual(r1, r2);
  });

  // ===================== Anti-double-counting estrutural =====================
  await test("Anti-double-counting - visualInterrupt e humanInterest sao explicaveis por sourceDecision distintos (nunca o mesmo unico campo)", async () => {
    const r = scoreScrollStop(FIXTURE_G_STRONG_PATTERN_INTERRUPT, CHEAP_EVIDENCE);
    const visualInterrupt = r.breakdown.components.find((c) => c.name === "visualInterrupt");
    const humanInterest = r.breakdown.components.find((c) => c.name === "humanInterest");
    assert.notEqual(visualInterrupt.sourceDecision, humanInterest.sourceDecision);
  });

  await test("Explainability - todo componente tem maxScore, reason, sourceDecision e improvableBy", async () => {
    const r = scoreScrollStop(FIXTURE_A_STATIC_PRODUCT, GENERIC_EVIDENCE);
    for (const c of r.breakdown.components) {
      assert.ok(c.maxScore > 0);
      assert.ok(c.reason.length > 0);
      assert.ok(c.sourceDecision.length > 0);
      assert.ok(Array.isArray(c.improvableBy));
    }
    assert.equal(r.breakdown.headroom, 100 - r.breakdown.total);
    assert.equal(r.breakdown.strongestDrivers.length, 3);
    assert.equal(r.breakdown.weakestDrivers.length, 3);
  });

  const failed = results.filter((r) => r.status === "FAIL");
  for (const r of results) {
    console.log(`${r.status === "PASS" ? "OK  " : "FAIL"} - ${r.name}${r.error ? ` :: ${r.error}` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} testes passaram. fetchCalls=${fetchCalls}`);
  console.log(`\nScores de calibracao: A=${scoreA.score} B=${scoreB.score} C=${scoreC.score} D=${scoreD.score} E=${scoreE.score} F=${scoreF.score} G=${scoreG.score}`);
  if (failed.length > 0) process.exitCode = 1;
}

run();
