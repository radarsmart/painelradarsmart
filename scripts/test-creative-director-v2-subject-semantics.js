// Radar Creative AI - Creative Director V2 / Decision Engine / Subject Semantics Test Suite
//
// Cobre a correcao semantica de "product-centric" (SceneSubjectDirection,
// isProductCentricSceneV2, computeFirstProductAppearanceV2) - garante que a
// classificacao vem do STAGING REAL da estrategia (nao do ScenePurpose
// sozinho) e que a correcao e so de METRICA, nunca de storyboard (camera/
// motion/timing/hookStrategy/CTA continuam identicos). Mesmo padrao dos
// scripts de teste anteriores (sem Jest, transpile on-the-fly, fetch
// bloqueado).

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

const {
  isProductCentricSceneV2,
  deriveHookSceneSubjectDirection,
  computeFirstProductAppearanceV2,
} = require("../lib/creative-director-v2/decision-engine/scene-subject-direction.ts");
const { buildCommercialDirection } = require("../lib/commercial-director/director.ts");
const { buildCreativeDirectionV2DecisionEngine } = require("../lib/creative-director-v2/decision-engine/decision-engine.ts");
const { computeFirstProductAppearance } = require("../lib/creative-director-v2/product-presentation.ts");
const { scoreCreativeDensity } = require("../lib/creative-director-v2/validation/creative-density-score.ts");

function baseInput(overrides = {}) {
  return {
    offerId: "offer-test",
    productTitle: "Produto Teste",
    category: "casa",
    discountPct: 5,
    price: 99.9,
    originalPrice: 129.9,
    rating: null,
    reviewsCount: null,
    marketplace: "shopee",
    primaryPain: "produto atual nao resolve a necessidade",
    primaryDesire: "resolver a necessidade rapido",
    primaryObjection: "sera que funciona mesmo?",
    purchaseMotivation: "praticidade",
    frameworkSlug: "demonstracao-curta",
    angleSlug: "beneficio",
    officialCharacterSlug: null,
    ...overrides,
  };
}

function scene(overrides = {}) {
  return { id: "scene-1", order: 1, startSecond: 0, endSecond: 2, purpose: "HOOK", ...overrides };
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
  // 1. HOOK hero product conta product-centric
  await test("1 - HOOK com HERO_PRODUCT_REVEAL conta como product-centric", async () => {
    const subject = deriveHookSceneSubjectDirection("HERO_PRODUCT_REVEAL", false);
    assert.equal(subject.productPresence, "HERO");
    assert.equal(isProductCentricSceneV2(subject), true);
  });

  // 2. HOOK environment não conta
  await test("2 - HOOK com CURIOSITY_REVEAL (sem produto claro) nao conta como product-centric", async () => {
    const subject = deriveHookSceneSubjectDirection("CURIOSITY_REVEAL", false);
    assert.equal(subject.primarySubject, "ENVIRONMENT");
    assert.equal(isProductCentricSceneV2(subject), false);
  });

  // 3. HOOK character-only não conta
  await test("3 - HOOK com CHARACTER_DIRECT_HOOK nao conta como product-centric", async () => {
    const subject = deriveHookSceneSubjectDirection("CHARACTER_DIRECT_HOOK", true);
    assert.equal(subject.characterPresence, "PRIMARY");
    assert.equal(subject.productPresence, "NONE");
    assert.equal(isProductCentricSceneV2(subject), false);
  });

  // 4. PRODUCT purpose com produto conta (via funcao V1 reusada, nao alterada)
  await test("4 - cena de purpose PRODUCT conta via computeFirstProductAppearance (Fase 1, reusada)", async () => {
    const scenes = [scene({ purpose: "HOOK", startSecond: 0, endSecond: 2 }), scene({ id: "scene-2", purpose: "PRODUCT", startSecond: 2, endSecond: 8 })];
    const first = computeFirstProductAppearance(scenes);
    assert.equal(first, 2);
  });

  // 5. OFFER pode ou não ser product-centric conforme blueprint (aqui: OFFER
  // sempre e purpose product-centric em V1/Fase1, entao continua contando -
  // a correcao desta tarefa so adiciona HOOK, nunca retira o que ja era
  // correto)
  await test("5 - OFFER continua contando como product-centric (Fase 1 intocada)", async () => {
    const scenes = [scene({ purpose: "HOOK" }), scene({ id: "scene-2", purpose: "OFFER", startSecond: 2, endSecond: 4 })];
    assert.equal(computeFirstProductAppearance(scenes), 2);
  });

  // 6. firstProductAppearance usa presença real (V2 so antecipa quando HOOK
  // de fato carrega produto - senao cai no calculo Fase 1 inalterado)
  await test("6 - computeFirstProductAppearanceV2 antecipa so quando HOOK e product-centric de verdade", async () => {
    const scenes = [scene({ purpose: "HOOK", startSecond: 0, endSecond: 2 }), scene({ id: "scene-2", purpose: "PRODUCT", startSecond: 2, endSecond: 8 })];
    const heroSubject = deriveHookSceneSubjectDirection("HERO_PRODUCT_REVEAL", false);
    const nonHeroSubject = deriveHookSceneSubjectDirection("CURIOSITY_REVEAL", false);
    assert.equal(computeFirstProductAppearanceV2(scenes, heroSubject), 0, "HOOK product-centric deveria antecipar pra 0s");
    assert.equal(computeFirstProductAppearanceV2(scenes, nonHeroSubject), 2, "HOOK nao product-centric deveria cair no calculo Fase 1 (2s)");
  });

  // 7. density usa subject real (productRole/subjectPriority corrigidos
  // aumentam o score, mas so quando o override e aplicado)
  await test("7 - creativeDensityScore aumenta quando productRole/subjectPriority do HOOK sao corrigidos", async () => {
    const baseBlueprint = {
      sceneId: "scene-1",
      purpose: "HOOK",
      subjectPriority: "TEXT_OVERLAY",
      productRole: "NONE",
      motionDirection: "reveal rapido com push-in no produto",
      effectDirection: { effects: ["GLOW"], productSafeOnly: false },
      overlayPlan: { overlayInstructions: { priceText: null, discountText: null, ctaText: null }, safeAreaDirection: "NONE", brandOverlayRequired: false },
      characterRole: { role: "NONE" },
      transitionIntent: "WHIP",
    };
    const beforeScore = scoreCreativeDensity([baseBlueprint]).scenes[0].score;
    const afterScore = scoreCreativeDensity([{ ...baseBlueprint, subjectPriority: "PRODUCT", productRole: "HERO" }]).scenes[0].score;
    assert.ok(afterScore > beforeScore, `esperava score aumentar (${beforeScore} -> ${afterScore})`);
  });

  // 8. V1 não muda
  await test("8 - buildCommercialDirection (V1) nao e afetado pela correcao semantica do Decision Engine", async () => {
    const input = baseInput({});
    const v1a = await buildCommercialDirection(input);
    await buildCreativeDirectionV2DecisionEngine(input, v1a);
    const v1b = await buildCommercialDirection(input);
    assert.deepEqual(v1a.scenes, v1b.scenes, "V1 deveria continuar identico antes/depois de rodar o Decision Engine");
  });

  // 9. storyboard permanece estruturalmente equivalente (determinismo: mesma
  // entrada produz exatamente a mesma camera/motion/timing/hookStrategy)
  await test("9 - Decision Engine e deterministico (mesma entrada -> mesmo storyboard)", async () => {
    const input = baseInput({});
    const v1 = await buildCommercialDirection(input);
    const { result: r1 } = await buildCreativeDirectionV2DecisionEngine(input, v1);
    const { result: r2 } = await buildCreativeDirectionV2DecisionEngine(input, v1);
    const strip = (scenes) => scenes.map((s) => ({ camera: s.camera, motion: s.motion, startSecond: s.startSecond, endSecond: s.endSecond }));
    assert.deepEqual(strip(r1.underlyingDirection.scenes), strip(r2.underlyingDirection.scenes));
    assert.equal(r1.hookStrategy, r2.hookStrategy);
  });

  // 10. thresholds não mudam (HOOK_STRENGTH_TARGET_V2 continua 75, importado
  // do mesmo benchmark cinematic, nao redeclarado)
  await test("10 - HOOK_STRENGTH_TARGET_V2 continua igual a SHORT_FORM_CINEMATIC_COMMERCE.minHookScore", async () => {
    const { HOOK_STRENGTH_TARGET_V2 } = require("../lib/creative-director-v2/decision-engine/hook-decision-engine.ts");
    const { SHORT_FORM_CINEMATIC_COMMERCE } = require("../lib/creative-director-v2/validation/cinematic-benchmark.ts");
    assert.equal(HOOK_STRENGTH_TARGET_V2, SHORT_FORM_CINEMATIC_COMMERCE.minHookScore);
    assert.equal(HOOK_STRENGTH_TARGET_V2, 75);
  });

  // 11. nenhum provider
  await test("11 - nenhum campo referencia provider/capability apos a correcao semantica", async () => {
    const input = baseInput({});
    const v1 = await buildCommercialDirection(input);
    const output = await buildCreativeDirectionV2DecisionEngine(input, v1);
    const serialized = JSON.stringify(output).toLowerCase();
    for (const forbidden of ["heygen", "kling", "wan-2", "freepik", "elevenlabs", "\"provider\"", "\"capability\""]) {
      assert.ok(!serialized.includes(forbidden), `nao deveria mencionar "${forbidden}"`);
    }
  });

  // 12. nenhuma escrita
  await test("12 - nenhum arquivo novo desta correcao importa/menciona supabase", async () => {
    const filePath = path.join(root, "lib", "creative-director-v2", "decision-engine", "scene-subject-direction.ts");
    const src = fs.readFileSync(filePath, "utf8");
    assert.ok(!src.includes("supabase"));
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
