// Radar Creative AI - Creative Director V2 / Validation / Test Suite
//
// Mesmo padrao dos outros scripts de teste do projeto (sem Jest/Vitest):
// transpila .ts on-the-fly, resolve alias "@/", bloqueia global.fetch. Cobre
// os 12 cenarios pedidos + 2 guardas de provider. Fixtures montadas a mao,
// sem tocar Supabase (exceto o teste 2, que roda o orquestrador completo com
// officialCharacterSlug:null, que tambem nao toca Supabase).

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

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

const { buildCommercialCreativeDirectionV2 } = require("../lib/creative-director-v2/creative-director-v2.ts");
const { buildCommercialDirection } = require("../lib/commercial-director/director.ts");
const { compareAgainstBenchmark, SHORT_FORM_PREMIUM_COMMERCE } = require("../lib/creative-director-v2/benchmark-profile.ts");
const { compareAgainstCinematicBenchmark, SHORT_FORM_CINEMATIC_COMMERCE } = require("../lib/creative-director-v2/validation/cinematic-benchmark.ts");
const { scoreCreativeDensity } = require("../lib/creative-director-v2/validation/creative-density-score.ts");
const { scoreProductFirst } = require("../lib/creative-director-v2/validation/product-first-score.ts");
const { analyzeSceneRedundancy } = require("../lib/creative-director-v2/validation/scene-redundancy.ts");
const { assessCharacterPerformance } = require("../lib/creative-director-v2/validation/character-performance.ts");
const { assessCommercialArcCoverage } = require("../lib/creative-director-v2/validation/commercial-arc.ts");
const { runCreativeValidation } = require("../lib/creative-director-v2/validation/validation-orchestrator.ts");

function scene(overrides = {}) {
  return {
    sceneId: "scene-x",
    purpose: "PRODUCT",
    creativeIntent: "x",
    visualObjective: "objetivo-x",
    subjectPriority: "PRODUCT",
    productRole: "HERO",
    productPresentationStrategy: "HERO_REVEAL",
    characterRole: { role: "NONE", reason: "x", entrance: null, line: null, emotion: null, gesture: null, durationSeconds: 5, position: "NONE" },
    motionDirection: "estatico",
    cameraDirection: "plano fixo",
    environmentDirection: "estudio",
    effectDirection: { effects: [], productSafeOnly: false },
    overlayPlan: { overlayInstructions: { priceText: null, discountText: null, ctaText: null }, safeAreaDirection: "NONE", brandOverlayRequired: false },
    narrationRole: { intent: "DESIRE", tone: "x", energy: "MEDIUM", messagePriority: "MEDIUM" },
    transitionIntent: "CUT",
    desiredDuration: 5,
    qualityTargets: { minHookStrength: null, requiresProductVisible: true, requiresCtaVisualAction: false },
    ...overrides,
  };
}

function baseInput(overrides = {}) {
  return {
    offerId: "offer-test",
    productTitle: "Produto Teste",
    category: "eletronicos",
    discountPct: 10,
    price: 99.9,
    originalPrice: 129.9,
    rating: null,
    reviewsCount: null,
    marketplace: "shopee",
    primaryPain: "produto atual nao resolve a necessidade",
    primaryDesire: "resolver a necessidade rapido",
    primaryObjection: "sera que funciona mesmo?",
    purchaseMotivation: "praticidade",
    frameworkSlug: "oferta-direta",
    angleSlug: "preco",
    officialCharacterSlug: null,
    ...overrides,
  };
}

const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (err) {
    results.push({ name, status: "FAIL", error: err.message });
  }
}

async function run() {
  // 1. benchmark antigo passando nao implica cinematic passando
  await test("1 - premium PASS 100% nao garante cinematic PASS 100%", async () => {
    const hookStrength = {
      immediateSubjectPresence: { score: 80, reason: "x" }, visualContrast: { score: 80, reason: "x" },
      motionIntensity: { score: 80, reason: "x" }, curiosity: { score: 80, reason: "x" },
      messageClarity: { score: 80, reason: "x" }, mobileReadability: { score: 80, reason: "x" },
      overallScore: 65, passesMinimum: true, weakSignals: [],
    };
    const sceneBlueprints = [
      scene({ sceneId: "scene-1", purpose: "HOOK", visualObjective: "obj-hook", subjectPriority: "CHARACTER" }),
      scene({ sceneId: "scene-2", purpose: "OFFER", visualObjective: "obj-offer" }),
      scene({ sceneId: "scene-3", purpose: "CTA", visualObjective: "obj-cta" }),
    ];
    const pacing = { style: "FAST", averageSceneDurationSeconds: 4, cutsPerMinute: 20, motionIntensity: "HIGH", informationDensity: "HIGH", reason: "x" };
    const premium = compareAgainstBenchmark(
      { hookStrength, productScaleTarget: "MEDIUM", pacing, sceneBlueprints, hasVisualOffer: true, hasClearCta: true },
      SHORT_FORM_PREMIUM_COMMERCE,
    );
    const creativeDensity = scoreCreativeDensity(sceneBlueprints);
    const sceneRedundancy = analyzeSceneRedundancy(sceneBlueprints);
    const commercialArc = assessCommercialArcCoverage({ storyStructure: "DIRECT_OFFER" }, sceneBlueprints);
    const cinematic = compareAgainstCinematicBenchmark(
      { hookStrength, productScaleTarget: "MEDIUM", pacing, creativeDensity, sceneRedundancy, characterPerformance: [], commercialArc },
      SHORT_FORM_CINEMATIC_COMMERCE,
    );
    assert.equal(premium.matchScore, 100, `premium deveria ser 100%, foi ${premium.matchScore}`);
    assert.ok(cinematic.matchScore < premium.matchScore, `cinematic (${cinematic.matchScore}%) deveria ser mais dificil que premium (${premium.matchScore}%)`);
    const hookCheck = cinematic.checks.find((c) => c.criterion === "hookImmediate");
    assert.equal(hookCheck.met, false, "hook=65 nao deveria passar no limiar cinematic de 75");
  });

  // 2. hook 55-70 passa storyboardQualityGate mas cinematic sinaliza observacao
  await test("2 - hook entre 55-70 passa gate mas reprova hookImmediate cinematic", async () => {
    const v2 = await buildCommercialCreativeDirectionV2(baseInput({ category: "eletronicos", frameworkSlug: "oferta-direta", discountPct: 40 }));
    const v1 = await buildCommercialDirection(baseInput({ category: "eletronicos", frameworkSlug: "oferta-direta", discountPct: 40 }));
    assert.ok(v2.hookStrength.overallScore >= 55 && v2.hookStrength.overallScore < 75, `esperava hook entre 55-74, foi ${v2.hookStrength.overallScore}`);
    assert.notEqual(v2.storyboardQualityGate.status, "FAIL");
    const validation = runCreativeValidation(v1, v2);
    const hookCheck = validation.cinematicBenchmark.checks.find((c) => c.criterion === "hookImmediate");
    assert.equal(hookCheck.met, false, "hook nesta faixa nao deveria bater o limiar cinematic (75)");
  });

  // 3. cena com subjectPriority ENVIRONMENT reduz creativeDensityScore
  await test("3 - subjectPriority ENVIRONMENT reduz creativeDensityScore da cena", async () => {
    const richScene = scene({ sceneId: "scene-rich", subjectPriority: "PRODUCT", motionDirection: "zoom rapido", effectDirection: { effects: ["GLOW"], productSafeOnly: true }, characterRole: { role: "EXPLAINER", reason: "x", entrance: "x", line: "x", emotion: "x", gesture: "x", durationSeconds: 5, position: "LEFT" }, transitionIntent: "ZOOM" });
    const emptyScene = scene({ sceneId: "scene-empty", subjectPriority: "ENVIRONMENT", productRole: "NONE", motionDirection: "estatico", effectDirection: { effects: [], productSafeOnly: false } });
    const density = scoreCreativeDensity([richScene, emptyScene]);
    const richResult = density.scenes.find((s) => s.sceneId === "scene-rich");
    const emptyResult = density.scenes.find((s) => s.sceneId === "scene-empty");
    assert.ok(emptyResult.score < richResult.score, `cena vazia (${emptyResult.score}) deveria pontuar menos que a rica (${richResult.score})`);
  });

  // 4. produto tardio reduz productFirstScore
  await test("4 - produto aparecendo mais tarde reduz productFirstScore", async () => {
    const heroScene = scene({ sceneId: "hero", productRole: "HERO", motionDirection: "zoom rapido" });
    const early = { underlyingDirection: { durationSeconds: 20 }, firstProductAppearanceSecond: 2, heroProductDuration: 10, productScaleTarget: "LARGE", sceneBlueprints: [heroScene] };
    const late = { underlyingDirection: { durationSeconds: 20 }, firstProductAppearanceSecond: 16, heroProductDuration: 10, productScaleTarget: "LARGE", sceneBlueprints: [heroScene] };
    const earlyScore = scoreProductFirst(early);
    const lateScore = scoreProductFirst(late);
    assert.ok(earlyScore.score > lateScore.score, `produto cedo (${earlyScore.score}) deveria pontuar mais que tarde (${lateScore.score})`);
  });

  // 5. cenas consecutivas com mesma camera/subjectPriority detectadas
  await test("5 - analyzeSceneRedundancy detecta similaridade entre cenas consecutivas", async () => {
    const sceneA = scene({ sceneId: "scene-a", cameraDirection: "plano medio", subjectPriority: "PRODUCT", environmentDirection: "estudio", productPresentationStrategy: "HERO_REVEAL" });
    const sceneB = scene({ sceneId: "scene-b", cameraDirection: "plano medio", subjectPriority: "PRODUCT", environmentDirection: "outro", productPresentationStrategy: "MACRO_DETAIL" });
    const sceneC = scene({ sceneId: "scene-c", cameraDirection: "close", subjectPriority: "CHARACTER", environmentDirection: "outro2", productPresentationStrategy: "COMPARISON" });
    const analysis = analyzeSceneRedundancy([sceneA, sceneB, sceneC]);
    assert.equal(analysis.pairs.length, 2);
    assert.equal(analysis.pairs[0].risk, "MEDIUM", "scene-a/scene-b compartilham 2 campos -> MEDIUM");
    assert.ok(analysis.pairs[0].matchedFields.includes("cameraDirection"));
  });

  // 6. CTA sem gesto/acao nao marca interactsWithCta
  await test("6 - CTA sem gesto definido nao marca interactsWithCta", async () => {
    const ctaScene = scene({ sceneId: "cta-1", purpose: "CTA", characterRole: { role: "CTA_PRESENTER", reason: "x", entrance: "x", line: "x", emotion: "INVITING", gesture: null, durationSeconds: 5, position: "LEFT" } });
    const performance = assessCharacterPerformance([ctaScene]);
    assert.equal(performance[0].interactsWithCta, false);
  });

  // 7. personagem NEUTRAL+NEUTRAL marca staticPresenceRisk
  await test("7 - emotion NEUTRAL + gesture NEUTRAL marca staticPresenceRisk", async () => {
    const staticScene = scene({ sceneId: "static-1", characterRole: { role: "EXPLAINER", reason: "x", entrance: "x", line: "x", emotion: "NEUTRAL", gesture: "NEUTRAL", durationSeconds: 5, position: "LEFT" } });
    const performance = assessCharacterPerformance([staticScene]);
    assert.equal(performance[0].staticPresenceRisk, true);
  });

  // 8. campanha sem BENEFIT/PROOF mostra DESIRE/BENEFIT como missing
  await test("8 - storyboard sem BENEFIT/PROOF deixa DESIRE/BENEFIT fora do arco", async () => {
    const scenes = [scene({ sceneId: "s1", purpose: "HOOK" }), scene({ sceneId: "s2", purpose: "OFFER" }), scene({ sceneId: "s3", purpose: "CTA" })];
    const arc = assessCommercialArcCoverage({ storyStructure: "DIRECT_OFFER" }, scenes);
    assert.ok(arc.missing.includes("DESIRE"));
    assert.ok(arc.missing.includes("BENEFIT"));
    assert.ok(arc.covered.includes("ATTENTION"));
    assert.ok(arc.covered.includes("OFFER"));
    assert.ok(arc.covered.includes("ACTION"));
  });

  // 9. productScaleTarget HERO_FULL_FRAME aumenta productFirstScore vs SMALL
  await test("9 - productScaleTarget HERO_FULL_FRAME pontua mais que SMALL", async () => {
    const heroScene = scene({ sceneId: "hero", productRole: "HERO", motionDirection: "zoom rapido" });
    const big = { underlyingDirection: { durationSeconds: 20 }, firstProductAppearanceSecond: 5, heroProductDuration: 10, productScaleTarget: "HERO_FULL_FRAME", sceneBlueprints: [heroScene] };
    const small = { underlyingDirection: { durationSeconds: 20 }, firstProductAppearanceSecond: 5, heroProductDuration: 10, productScaleTarget: "SMALL", sceneBlueprints: [heroScene] };
    assert.ok(scoreProductFirst(big).score > scoreProductFirst(small).score);
  });

  // 10. mais movimento/camera variada aumenta creativeDensityScore
  await test("10 - mais sinais de densidade (motion/efeito/overlay/character/transicao) aumentam o score", async () => {
    const dense = scene({
      sceneId: "dense", motionDirection: "corte rapido", effectDirection: { effects: ["GLOW", "BOKEH"], productSafeOnly: true },
      overlayPlan: { overlayInstructions: { priceText: "R$ 10", discountText: null, ctaText: null }, safeAreaDirection: "BOTTOM", brandOverlayRequired: false },
      characterRole: { role: "EXPLAINER", reason: "x", entrance: "x", line: "x", emotion: "x", gesture: "x", durationSeconds: 5, position: "LEFT" },
      transitionIntent: "ZOOM",
    });
    const sparse = scene({ sceneId: "sparse", motionDirection: "estatico", effectDirection: { effects: [], productSafeOnly: false }, transitionIntent: "CUT" });
    const density = scoreCreativeDensity([dense, sparse]);
    const denseResult = density.scenes.find((s) => s.sceneId === "dense");
    const sparseResult = density.scenes.find((s) => s.sceneId === "sparse");
    assert.ok(denseResult.score > sparseResult.score);
  });

  // 11. nenhum teste desta suite chama global.fetch
  await test("11 - global.fetch nunca foi chamado durante os testes de validacao", async () => {
    assert.equal(fetchCalls, 0);
  });

  // 12. nenhum campo dos novos diagnosticos referencia provider/capability
  await test("12 - nenhum campo do CreativeValidationResult referencia provider/capability", async () => {
    const v2 = await buildCommercialCreativeDirectionV2(baseInput({}));
    const v1 = await buildCommercialDirection(baseInput({}));
    const validation = runCreativeValidation(v1, v2);
    const serialized = JSON.stringify(validation).toLowerCase();
    for (const forbidden of ["heygen", "kling", "wan-2", "freepik", "elevenlabs", "\"provider\"", "\"capability\""]) {
      assert.ok(!serialized.includes(forbidden), `validation nao deveria mencionar "${forbidden}"`);
    }
  });

  const failed = results.filter((r) => r.status === "FAIL");
  for (const r of results) {
    console.log(`${r.status === "PASS" ? "OK  " : "FAIL"} - ${r.name}${r.error ? ` :: ${r.error}` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} testes passaram. fetchCalls=${fetchCalls}`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run();
