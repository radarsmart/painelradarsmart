// Radar Creative AI - Creative Director V2 / Test Suite
//
// Mesmo padrao de scripts/test-commercial-quality-gate.js: sem Jest/Vitest
// (nao existe no projeto), transpila .ts on-the-fly via ts.transpileModule,
// resolve alias "@/" manualmente, e bloqueia qualquer chamada de rede
// (global.fetch) para garantir ZERO custo/chamada externa. Nenhum teste
// aqui toca Supabase - todo fixture usa officialCharacterSlug:null (o unico
// ponto de I/O de buildCommercialDirection so roda quando a persona oficial
// esta setada) ou chama funcoes puras do V2 diretamente com fixtures
// montadas a mao.

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
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
};

let fetchCalls = 0;
global.fetch = async () => {
  fetchCalls += 1;
  throw new Error("External calls are forbidden in this test.");
};

// lib/supabase.ts roda env-check.ts na hora do import (mesmo sem nenhuma
// chamada real) - director.ts importa isso indiretamente via
// lib/brand-character/character-pack.ts. Valores dummy, nunca usados de
// fato porque todo fixture deste script usa officialCharacterSlug:null.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

const { buildCommercialCreativeDirectionV2 } = require("../lib/creative-director-v2/creative-director-v2.ts");
const { compareCreativeDirections } = require("../lib/creative-director-v2/compare-v1-v2.ts");
const { assessGenericAdRisk } = require("../lib/creative-director-v2/generic-ad-risk.ts");
const { buildCharacterRoleDirection } = require("../lib/creative-director-v2/character-role-director.ts");
const { buildCtaDirectionV2 } = require("../lib/creative-director-v2/cta-director.ts");
const { evaluateHookStrength, HOOK_STRENGTH_MIN_SCORE } = require("../lib/creative-director-v2/hook-engine.ts");
const { runCreativeStoryboardQualityGate } = require("../lib/creative-director-v2/storyboard-quality-gate.ts");
const { buildCommercialDirection } = require("../lib/commercial-director/director.ts");

const V2_SOURCE_DIR = path.join(root, "lib", "creative-director-v2");

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
  // 1 + 3. product-centric nunca gera hook vazio sem motivo / hook score fraco e sinalizado
  await test("1/3 - hook fraco (sem character, categoria generica) e sinalizado como EMPTY_OPENING_SECONDS + WEAK_HOOK_SCORE", async () => {
    const v2 = await buildCommercialCreativeDirectionV2(
      baseInput({ category: "geral", discountPct: 10, rating: null, reviewsCount: null, frameworkSlug: "grupo-secreto-nao-mapeado" }),
    );
    assert.equal(v2.hookStrength.passesMinimum, false, `esperava hook fraco, score=${v2.hookStrength.overallScore}`);
    assert.ok(v2.genericAdRisk.reasons.includes("WEAK_HOOK_SCORE"), "esperava WEAK_HOOK_SCORE em genericAdRisk.reasons");
    assert.ok(v2.genericAdRisk.reasons.includes("EMPTY_OPENING_SECONDS"), "esperava EMPTY_OPENING_SECONDS em genericAdRisk.reasons");
    assert.notEqual(v2.storyboardQualityGate.status, "PASS", "storyboard com hook fraco nunca deveria ser considerado PASS limpo");
  });

  // 2. produto aparece cedo em campanha product-centric
  await test("2 - estrutura DEMONSTRATION (product-centric) mostra o produto cedo", async () => {
    const v2 = await buildCommercialCreativeDirectionV2(
      baseInput({ category: "casa", frameworkSlug: "demonstracao-curta", discountPct: 5, rating: null, reviewsCount: null }),
    );
    assert.equal(v2.underlyingDirection.sellingArgument, "PRACTICAL_BENEFIT");
    assert.ok(v2.firstProductAppearanceSecond !== null, "produto deveria aparecer em algum segundo");
    assert.ok(
      v2.firstProductAppearanceSecond <= v2.underlyingDirection.durationSeconds * 0.4,
      `produto apareceu tarde demais: ${v2.firstProductAppearanceSecond}s de ${v2.underlyingDirection.durationSeconds}s`,
    );
    assert.ok(!v2.genericAdRisk.reasons.includes("PRODUCT_TOO_LATE"));
  });

  // 4. visual variety avaliada (unit-level: forca 3 blueprints com mesma camera)
  await test("4 - REPETITIVE_COMPOSITION e detectado quando todas as cenas compartilham a mesma camera", async () => {
    const fakeDirection = {
      sellingArgument: "CONVENIENCE",
      durationSeconds: 15,
      offerStrategy: { currentPrice: 50, originalPrice: null, discountPercent: null, savingsAmount: null, priceReveal: "SHOW_PRICE_MIDDLE" },
      scenes: [
        { purpose: "HOOK" },
        { purpose: "PRODUCT" },
        { purpose: "CTA" },
      ],
    };
    const sameCamera = (purpose) => ({
      sceneId: `scene-${purpose}`,
      purpose,
      creativeIntent: "x",
      visualObjective: `objetivo-${purpose}`,
      subjectPriority: "PRODUCT",
      productRole: "HERO",
      productPresentationStrategy: null,
      characterRole: { role: "NONE", reason: "x", entrance: null, line: null, emotion: null, gesture: null, durationSeconds: 5, position: "NONE" },
      motionDirection: "estatico",
      cameraDirection: "plano fixo identico",
      environmentDirection: "x",
      effectDirection: { effects: [], productSafeOnly: false },
      overlayPlan: { overlayInstructions: { priceText: null, discountText: null, ctaText: null }, safeAreaDirection: "NONE", brandOverlayRequired: false },
      narrationRole: { intent: "DISCOVERY", tone: "x", energy: "LOW", messagePriority: "MEDIUM" },
      transitionIntent: "CUT",
      desiredDuration: 5,
      qualityTargets: { minHookStrength: null, requiresProductVisible: true, requiresCtaVisualAction: false },
    });
    const sceneBlueprints = ["HOOK", "PRODUCT", "CTA"].map(sameCamera);
    const hookStrength = {
      immediateSubjectPresence: { score: 80, reason: "x" },
      visualContrast: { score: 80, reason: "x" },
      motionIntensity: { score: 80, reason: "x" },
      curiosity: { score: 80, reason: "x" },
      messageClarity: { score: 80, reason: "x" },
      mobileReadability: { score: 80, reason: "x" },
      overallScore: 80,
      passesMinimum: true,
      weakSignals: [],
    };
    const offerPresentation = { pricePriority: "MEDIUM", discountPriority: "NONE", urgencyAllowed: false, comparisonAllowed: false, ctaPriority: "HIGH" };
    const ctaDirection = {
      ctaText: "x", ctaVisual: "x", ctaPresenter: "PRODUCT_ONLY", ctaUrgency: "LOW",
      ctaSecondary: null, ctaVisualAction: "NONE", ctaCharacterGesture: null,
      ctaOverlayLayout: { overlayInstructions: { priceText: null, discountText: null, ctaText: "x" }, safeAreaDirection: "NONE", brandOverlayRequired: true },
      ctaDuration: 5,
    };
    const risk = assessGenericAdRisk({ direction: fakeDirection, sceneBlueprints, hookStrength, firstProductAppearanceSecond: 0, offerPresentation, ctaDirection });
    assert.ok(risk.reasons.includes("REPETITIVE_COMPOSITION"), "esperava REPETITIVE_COMPOSITION quando todas as cenas tem a mesma camera");
  });

  // 5. CTA obrigatorio quando estrategia pedir (apresentadora com funcao de CTA)
  await test("5 - ctaVisualAction nunca fica NONE quando ha CTA_PRESENTER", async () => {
    const direction = {
      scenes: [{ id: "scene-3", purpose: "CTA", startSecond: 10, endSecond: 15 }],
      ctaStrategy: { ctaText: "Radar Smart", ctaVisual: "logo", ctaPresenter: "GAROTA_RADAR_CTA_ONLY", ctaUrgency: "HIGH" },
      offerStrategy: { currentPrice: 50, originalPrice: null, discountPercent: null, savingsAmount: null, priceReveal: "SHOW_PRICE_MIDDLE" },
    };
    const characterRole = { role: "CTA_PRESENTER", reason: "x", entrance: "camera", line: "fala", emotion: "INVITING", gesture: "INVITING", durationSeconds: 5, position: "LEFT" };
    const ctaDirection = buildCtaDirectionV2(direction, characterRole);
    assert.notEqual(ctaDirection.ctaVisualAction, "NONE");
    assert.ok(ctaDirection.ctaCharacterGesture !== null);
  });

  // 6. preco usa valor persistido
  await test("6 - offerPresentation reflete o preco real recebido", async () => {
    const v2 = await buildCommercialCreativeDirectionV2(baseInput({ price: 249.5, originalPrice: 300, discountPct: 15 }));
    assert.equal(v2.underlyingDirection.offerStrategy.currentPrice, 249.5);
    assert.notEqual(v2.offerPresentation.pricePriority, "NONE");
  });

  // 7. desconto inexistente nunca aparece
  await test("7 - discountPriority e NONE quando nao ha desconto real", async () => {
    const v2 = await buildCommercialCreativeDirectionV2(baseInput({ discountPct: null, price: 50, originalPrice: null }));
    assert.equal(v2.underlyingDirection.offerStrategy.discountPercent, null);
    assert.equal(v2.offerPresentation.discountPriority, "NONE");
  });

  // 8. Garota Radar nao entra sem funcao (sem persona oficial -> nunca aparece)
  await test("8 - sem officialCharacterSlug, personagem nunca aparece em nenhuma cena", async () => {
    const v2 = await buildCommercialCreativeDirectionV2(baseInput({ officialCharacterSlug: null }));
    assert.equal(v2.characterRoleSummary.appears, false);
    for (const blueprint of v2.sceneBlueprints) {
      assert.equal(blueprint.characterRole.role, "NONE");
    }
  });

  // 9. characterRole estruturado (unit-level, fixture com characterDirection)
  await test("9 - buildCharacterRoleDirection mapeia role por proposito quando ha character na cena", async () => {
    const direction = {
      offerStrategy: { currentPrice: 50, originalPrice: null, discountPercent: null, savingsAmount: null, priceReveal: "SHOW_PRICE_MIDDLE" },
      ctaStrategy: { ctaText: "x", ctaVisual: "x", ctaPresenter: "GAROTA_RADAR_CTA_ONLY", ctaUrgency: "LOW" },
    };
    const scene = {
      purpose: "PROOF",
      startSecond: 5,
      endSecond: 10,
      presenter: "GAROTA_RADAR_FULL",
      characterDirection: { expression: "CONFIDENT", pose: "NEUTRAL", shot: "HALF_BODY" },
      voiceoverIntent: "citar a prova real disponivel",
      camera: "plano medio",
    };
    const role = buildCharacterRoleDirection(scene, direction);
    assert.equal(role.role, "SOCIAL_PROOF_PRESENTER");
    assert.equal(role.durationSeconds, 5);
    assert.equal(role.emotion, "CONFIDENT");
  });

  // 10. provider nao e escolhido pelo Creative Director (estrutural)
  await test("10 - nenhum campo do V2 referencia provider/capability", async () => {
    const v2 = await buildCommercialCreativeDirectionV2(baseInput({}));
    const serialized = JSON.stringify(v2).toLowerCase();
    for (const forbidden of ["heygen", "kling", "wan-2", "freepik", "elevenlabs", "\"provider\"", "\"capability\""]) {
      assert.ok(!serialized.includes(forbidden), `V2 nao deveria mencionar "${forbidden}"`);
    }
  });

  // 11. GenericAdRisk alto bloqueia (nivel storyboardQualityGate = FAIL)
  await test("11 - risco HIGH (3+ motivos) marca storyboardQualityGate como FAIL", async () => {
    const risk = { risk: "HIGH", reasons: ["WEAK_HOOK_SCORE", "REPETITIVE_COMPOSITION", "WEAK_CTA"], details: ["a", "b", "c"] };
    const hookStrength = {
      immediateSubjectPresence: { score: 30, reason: "x" }, visualContrast: { score: 30, reason: "x" },
      motionIntensity: { score: 30, reason: "x" }, curiosity: { score: 30, reason: "x" },
      messageClarity: { score: 30, reason: "x" }, mobileReadability: { score: 30, reason: "x" },
      overallScore: 30, passesMinimum: false, weakSignals: ["fraco"],
    };
    const gateResult = runCreativeStoryboardQualityGate({
      direction: { offerStrategy: { currentPrice: 10, originalPrice: null, discountPercent: null, savingsAmount: null, priceReveal: "SHOW_PRICE_MIDDLE" } },
      hookStrength,
      sceneBlueprints: [{ purpose: "HOOK", qualityTargets: { requiresProductVisible: false } }],
      pacing: { style: "FAST", averageSceneDurationSeconds: 3, cutsPerMinute: 20, motionIntensity: "HIGH", informationDensity: "HIGH", reason: "x" },
      offerPresentation: { pricePriority: "MEDIUM", discountPriority: "NONE", urgencyAllowed: false, comparisonAllowed: false, ctaPriority: "HIGH" },
      ctaDirection: { ctaOverlayLayout: { brandOverlayRequired: true, overlayInstructions: { priceText: null, discountText: null, ctaText: "x" }, safeAreaDirection: "NONE" } },
      characterRoleSummary: { appears: false, rolesUsed: [], reason: "x" },
      genericAdRisk: risk,
    });
    assert.equal(gateResult.status, "FAIL");
  });

  // 12. PREMIUM_SLOW funciona (categoria perfumes forca CINEMATIC -> PREMIUM_SLOW)
  await test("12 - categoria perfumes produz pacingStyle PREMIUM_SLOW", async () => {
    const v2 = await buildCommercialCreativeDirectionV2(baseInput({ category: "perfumes", frameworkSlug: "review-curto", discountPct: 5 }));
    assert.equal(v2.underlyingDirection.pace, "CINEMATIC");
    assert.equal(v2.pacingStyle.style, "PREMIUM_SLOW");
  });

  // 13. FAST funciona (DIRECT_OFFER fora de perfumes -> FAST)
  await test("13 - estrutura DIRECT_OFFER fora de perfumes produz pacingStyle FAST", async () => {
    const v2 = await buildCommercialCreativeDirectionV2(baseInput({ category: "eletronicos", frameworkSlug: "oferta-direta", discountPct: 40 }));
    assert.equal(v2.underlyingDirection.pace, "FAST");
    assert.equal(v2.pacingStyle.style, "FAST");
  });

  // 14. product integrity respeitada (rotulo productSafeOnly correto)
  await test("14 - effectDirection.productSafeOnly e true so em cenas product-centric", async () => {
    const v2 = await buildCommercialCreativeDirectionV2(baseInput({ frameworkSlug: "demonstracao-curta", category: "casa" }));
    for (const blueprint of v2.sceneBlueprints) {
      const expected = ["PRODUCT", "BENEFIT", "OFFER", "CTA"].includes(blueprint.purpose);
      assert.equal(blueprint.effectDirection.productSafeOnly, expected, `purpose=${blueprint.purpose}`);
    }
  });

  // 15. HYBRID/compositor nunca e reimplementado pelo V2 (estrutural - nenhum import cruzado)
  // So verifica statements de import/require reais - comentarios que CITAM esses
  // modulos (documentando "nao reimplementar isto") sao esperados e corretos.
  await test("15 - nenhum arquivo do V2 IMPORTA lib/compositor ou lib/product-cutout (nao reimplementa integridade de produto)", async () => {
    const files = fs.readdirSync(V2_SOURCE_DIR).filter((f) => f.endsWith(".ts"));
    const importPattern = /(?:from|require\()\s*["']@\/lib\/(compositor|product-cutout)/;
    for (const file of files) {
      const src = fs.readFileSync(path.join(V2_SOURCE_DIR, file), "utf8");
      assert.ok(!importPattern.test(src), `${file} nao deveria IMPORTAR lib/compositor ou lib/product-cutout`);
    }
  });

  // 16. narrationIntent nao duplica o Narration Script Builder
  await test("16 - nenhum arquivo do V2 IMPORTA lib/commercial-video/narration", async () => {
    const files = fs.readdirSync(V2_SOURCE_DIR).filter((f) => f.endsWith(".ts"));
    const importPattern = /(?:from|require\()\s*["']@\/lib\/commercial-video\/narration/;
    for (const file of files) {
      const src = fs.readFileSync(path.join(V2_SOURCE_DIR, file), "utf8");
      assert.ok(!importPattern.test(src), `${file} nao deveria IMPORTAR o Narration Script Builder`);
    }
  });

  // 17. logo nunca vai para provider generativo (fica em overlay, nao em prompt)
  await test("17 - CTA sempre marca brandOverlayRequired e V2 nunca produz positivePrompt/negativePrompt", async () => {
    const v2 = await buildCommercialCreativeDirectionV2(baseInput({}));
    assert.equal(v2.ctaDirection.ctaOverlayLayout.brandOverlayRequired, true);
    const serialized = JSON.stringify(v2);
    assert.ok(!serialized.includes("positivePrompt"));
    assert.ok(!serialized.includes("negativePrompt"));
  });

  // 18. storyboard quality gate sempre retorna um status valido com 11 checks
  await test("18 - storyboardQualityGate tem status valido e 11 checks", async () => {
    const v2 = await buildCommercialCreativeDirectionV2(baseInput({}));
    assert.ok(["PASS", "PASS_WITH_OBSERVATIONS", "FAIL"].includes(v2.storyboardQualityGate.status));
    assert.equal(v2.storyboardQualityGate.checks.length, 11);
  });

  // 19. comparador V1xV2 produz diff estruturado (cobertura real de campanha fica no dry-run script)
  await test("19 - compareCreativeDirections produz entradas para todos os campos pedidos", async () => {
    const v2 = await buildCommercialCreativeDirectionV2(baseInput({}));
    const v1 = await buildCommercialDirection(baseInput({}));
    const comparison = compareCreativeDirections(v1, v2);
    const fields = comparison.entries.map((e) => e.field);
    for (const expected of ["hook", "firstProductAppearance", "sceneCount", "pacing", "productPresence", "offerHierarchy", "cta", "characterRole", "genericAdRisk"]) {
      assert.ok(fields.includes(expected), `comparacao deveria incluir o campo "${expected}"`);
    }
  });

  // 20. nenhuma API externa chamada durante toda a suite
  await test("20 - global.fetch nunca foi chamado durante os testes", async () => {
    assert.equal(fetchCalls, 0);
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
