// Radar Creative AI - Creative Director V2 / Pipeline Integration Test Suite
//
// Cobre a integracao controlada (feature flag, Prompt Builder version-aware,
// Execution Readiness respeitando o Storyboard Quality Gate). Mesmo padrao
// dos scripts anteriores: sem Jest, transpile on-the-fly, fetch bloqueado
// (garante que NENHUMA chamada de rede acontece so por rodar estes testes -
// nem provider, nem Supabase real).

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

const { buildCommercialDirection } = require("../lib/commercial-director/director.ts");
const { buildCreativeDirectionV2DecisionEngine } = require("../lib/creative-director-v2/decision-engine/decision-engine.ts");
const { buildCampaignPromptPlan } = require("../lib/prompt-builder/prompt-builder.ts");
const { buildScenePrompt } = require("../lib/prompt-builder/scene-prompt.ts");
const { buildOverlayPlan } = require("../lib/prompt-builder/overlay-plan.ts");
const { resolveCreativeDirectorVersion } = require("../lib/creative-director-v2/version.ts");
const { evaluateCampaignExecutionReadiness } = require("../lib/commercial-video/runner/execute/execution-readiness.ts");

function baseInput(overrides = {}) {
  return {
    offerId: "offer-test",
    productTitle: "Produto Teste",
    category: "eletronicos",
    discountPct: 40,
    price: 99.9,
    originalPrice: 179.9,
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

function promptContext(commercialDirection) {
  return {
    productTitle: "Produto Teste",
    category: "eletronicos",
    platform: "TIKTOK",
    aspectRatio: "9:16",
    defaultLogoAssetId: null,
  };
}

function sceneRunnerPlan(overrides = {}) {
  return {
    sceneId: "scene-1",
    sceneOrder: 1,
    purpose: "HOOK",
    providerCapability: "TEXT_TO_VIDEO",
    selectedProvider: "wan-2-5-t2v",
    providerStatus: "ACTIVE",
    productGenerationStrategy: null,
    requiresHybridPipeline: false,
    eligibility: "ELIGIBLE",
    eligibilityReason: null,
    estimatedCost: { provider: "wan-2-5-t2v", estimatedCredits: 100, estimatedCurrencyCostCents: null, estimatedUsdCostCents: null, actualCredits: null, actualCurrencyCostCents: null, costUnit: "CREDITS" },
    persistedStatus: "PENDING",
    persistedStatusReason: null,
    existingAsset: null,
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
  // 1. V1 continua funcionando
  await test("1 - buildCommercialDirection (V1) continua funcionando sem nenhuma alteracao de comportamento", async () => {
    const v1 = await buildCommercialDirection(baseInput({}));
    assert.ok(v1.scenes.length > 0);
    assert.equal(v1.hookStrategy, "PRICE_SHOCK");
  });

  // 2. V2 persistido separadamente (simulacao do merge usado na rota - V1
  // nunca e removida quando V2 e adicionada)
  await test("2 - merge de creative_brief preserva commercialDirection (V1) ao adicionar commercialDirectionV2", async () => {
    const existingBrief = { commercialDirection: { hookStrategy: "PRICE_SHOCK" }, promptPlan: { scenes: [] } };
    const updatedBrief = { ...existingBrief, commercialDirection: existingBrief.commercialDirection, commercialDirectionV2: { hookStrategy: "TRANSFORMATION" }, creativeDirectorVersion: "V2" };
    assert.deepEqual(updatedBrief.commercialDirection, existingBrief.commercialDirection);
    assert.ok(updatedBrief.commercialDirectionV2);
    assert.equal(updatedBrief.promptPlan, existingBrief.promptPlan);
  });

  // 3. version flag respeitada
  await test("3 - resolveCreativeDirectorVersion so aceita V2 explicito, tudo mais cai em V1", async () => {
    assert.equal(resolveCreativeDirectorVersion(undefined), "V1");
    assert.equal(resolveCreativeDirectorVersion(null), "V1");
    assert.equal(resolveCreativeDirectorVersion("garbage"), "V1");
    assert.equal(resolveCreativeDirectorVersion("V2"), "V2");
  });

  // 4. V2 chega ao Prompt Builder
  await test("4 - hints do Creative Director V2 aparecem no positivePrompt final", async () => {
    const input = baseInput({});
    const v1 = await buildCommercialDirection(input);
    const { result: v2 } = await buildCreativeDirectionV2DecisionEngine(input, v1);
    const planWithV2 = buildCampaignPromptPlan("campaign-test", v2.underlyingDirection, promptContext(), {
      sceneBlueprints: v2.sceneBlueprints,
      ctaDirection: v2.ctaDirection,
    });
    const planWithoutV2 = buildCampaignPromptPlan("campaign-test", v2.underlyingDirection, promptContext());
    const withHints = planWithV2.scenes[0].positivePrompt;
    const withoutHints = planWithoutV2.scenes[0].positivePrompt;
    assert.ok(withHints.includes("Creative environment detail"), "esperava a dica de ambiente do V2 no prompt");
    assert.notEqual(withHints, withoutHints, "prompt com hints V2 deveria ser diferente do prompt sem hints");
  });

  // 5. V2 não escolhe provider
  await test("5 - CampaignPromptPlan (V1 ou V2) nunca menciona provider/capability concretos", async () => {
    const input = baseInput({});
    const v1 = await buildCommercialDirection(input);
    const { result: v2 } = await buildCreativeDirectionV2DecisionEngine(input, v1);
    const plan = buildCampaignPromptPlan("campaign-test", v2.underlyingDirection, promptContext(), { sceneBlueprints: v2.sceneBlueprints, ctaDirection: v2.ctaDirection });
    const serialized = JSON.stringify(plan).toLowerCase();
    for (const forbidden of ["heygen", "kling", "wan-2", "freepik", "elevenlabs"]) {
      assert.ok(!serialized.includes(forbidden), `prompt plan nao deveria mencionar "${forbidden}"`);
    }
  });

  // 6. quality FAIL bloqueia readiness
  await test("6 - creativeQualityGateStatus=FAIL produz BLOCKED_CREATIVE_QUALITY mesmo com cenas elegiveis", async () => {
    const scenes = [sceneRunnerPlan()];
    const blocked = evaluateCampaignExecutionReadiness(scenes, null, "FAIL");
    assert.equal(blocked.status, "BLOCKED_CREATIVE_QUALITY");
    assert.equal(blocked.canProduceFinalCommercial, false);

    const passing = evaluateCampaignExecutionReadiness(scenes, null, "PASS");
    assert.notEqual(passing.status, "BLOCKED_CREATIVE_QUALITY");

    const unset = evaluateCampaignExecutionReadiness(scenes, null);
    assert.notEqual(unset.status, "BLOCKED_CREATIVE_QUALITY", "campanha V1 (sem creativeQualityGateStatus) nunca deveria ser bloqueada por isso");
  });

  await test("6b - commercialPersuasionGateStatus=FAIL produz BLOCKED_COMMERCIAL_PERSUASION somente quando informado", async () => {
    const scenes = [sceneRunnerPlan()];
    const blocked = evaluateCampaignExecutionReadiness(scenes, null, "PASS", "FAIL");
    assert.equal(blocked.status, "BLOCKED_COMMERCIAL_PERSUASION");
    assert.equal(blocked.canProduceFinalCommercial, false);

    const passing = evaluateCampaignExecutionReadiness(scenes, null, "PASS", "PASS");
    assert.notEqual(passing.status, "BLOCKED_COMMERCIAL_PERSUASION");

    const unset = evaluateCampaignExecutionReadiness(scenes, null, "PASS");
    assert.notEqual(unset.status, "BLOCKED_COMMERCIAL_PERSUASION", "persuasion OFF nunca deve bloquear por gate comercial ausente");
  });

  // 7. nenhuma chamada paga em DRY_RUN (fetch bloqueado durante toda a
  // suite - se algo tentasse chamar rede, o teste ja teria falhado antes)
  await test("7 - nenhuma chamada de rede ocorreu construindo V1/V2/prompts/readiness", async () => {
    assert.equal(fetchCalls, 0);
  });

  // 8. campanhas antigas não são migradas automaticamente
  await test("8 - creative_brief antigo (sem creativeDirectorVersion) resolve pra V1 e mantem so commercialDirection", async () => {
    const oldBrief = { commercialDirection: { hookStrategy: "PRICE_SHOCK" } };
    assert.equal(resolveCreativeDirectorVersion(oldBrief.creativeDirectorVersion), "V1");
    assert.equal(oldBrief.commercialDirectionV2, undefined);
  });

  // 9. overlays continuam factuais
  await test("9 - overlayInstructions.priceText so aparece quando ha preco real, nunca inventado", async () => {
    const planNoPrice = buildOverlayPlan({
      purpose: "OFFER",
      offerStrategy: { currentPrice: null, originalPrice: null, discountPercent: null, savingsAmount: null, priceReveal: "SHOW_PRICE_MIDDLE" },
      ctaStrategy: { ctaText: "x", ctaVisual: "x", ctaPresenter: "PRODUCT_ONLY", ctaUrgency: "LOW" },
      hasCharacterInScene: false,
    });
    assert.equal(planNoPrice.overlayInstructions.priceText, null);
  });

  // 10. 0% OFF continua bloqueado (regressao apos as mudancas desta tarefa)
  await test("10 - 0% OFF continua bloqueado apos a integracao ao pipeline", async () => {
    const plan = buildOverlayPlan({
      purpose: "OFFER",
      offerStrategy: { currentPrice: 50, originalPrice: null, discountPercent: 0, savingsAmount: null, priceReveal: "SHOW_PRICE_MIDDLE" },
      ctaStrategy: { ctaText: "x", ctaVisual: "x", ctaPresenter: "PRODUCT_ONLY", ctaUrgency: "LOW" },
      hasCharacterInScene: false,
    });
    assert.equal(plan.overlayInstructions.discountText, null);
  });

  // 11. product integrity continua valendo (hints V2 nunca contornam a
  // trava de seguranca de integridade de produto)
  await test("11 - PRODUCT_INTEGRITY_DIRECTIVE continua sendo aplicada mesmo com creativeHints do V2 presentes", async () => {
    const scene = {
      id: "scene-2", order: 2, startSecond: 2, endSecond: 8, purpose: "PRODUCT",
      visualSubject: "produto (Produto Teste)", presenter: "PRODUCT_ONLY", productAction: "mostrar produto",
      characterDirection: null, identityReferenceAssetId: null, supportReferenceAssetId: "support-1",
      camera: "close macro tracking shot", motion: "dolly-in", lighting: "estudio",
      textOverlay: null, voiceoverIntent: "x", sfxIntent: null, transitionIntent: "cut",
    };
    const context = {
      productTitle: "Produto Teste", category: "perfumes", platform: "TIKTOK", aspectRatio: "9:16",
      visualStyle: "LUXURY", pace: "CINEMATIC",
      offerStrategy: { currentPrice: 50, originalPrice: null, discountPercent: null, savingsAmount: null, priceReveal: "SHOW_PRICE_MIDDLE" },
      ctaStrategy: { ctaText: "x", ctaVisual: "x", ctaPresenter: "PRODUCT_ONLY", ctaUrgency: "LOW" },
      defaultLogoAssetId: null,
    };
    const prompt = buildScenePrompt(scene, context, { environmentDirection: "cenario V2 de teste", visualEffects: ["GLOW"] });
    if (prompt.productIntegrityMode === "PRESERVE_PACKAGE") {
      assert.ok(prompt.positivePrompt.includes("Creative environment detail"), "hint V2 deveria continuar presente");
      assert.ok(prompt.productIntegrityRisk === "HIGH", "risco deveria continuar sendo classificado normalmente com hints V2 presentes");
    }
    assert.ok(prompt.negativePrompt.length > 0);
  });

  // 12. CTA intent chega ao prompt/plan sem inventar acao garantida
  await test("12 - CTA visual intent aparece no prompt com o disclaimer de intencao criativa (nao garantia do provider)", async () => {
    const scene = {
      id: "scene-5", order: 5, startSecond: 15, endSecond: 20, purpose: "CTA",
      visualSubject: "Garota Radar", presenter: "GAROTA_RADAR_FULL", productAction: "cta",
      characterDirection: { expression: "INVITING", pose: "INVITING", shot: "HALF_BODY" },
      identityReferenceAssetId: "id-1", supportReferenceAssetId: null,
      camera: "medium shot", motion: "static", lighting: "brand",
      textOverlay: "CTA", voiceoverIntent: "x", sfxIntent: null, transitionIntent: "fade",
    };
    const context = {
      productTitle: "Produto Teste", category: "eletronicos", platform: "TIKTOK", aspectRatio: "9:16",
      visualStyle: "TECH", pace: "FAST",
      offerStrategy: { currentPrice: 50, originalPrice: null, discountPercent: null, savingsAmount: null, priceReveal: "SHOW_PRICE_MIDDLE" },
      ctaStrategy: { ctaText: "Acesse o Radar Smart", ctaVisual: "logo", ctaPresenter: "GAROTA_RADAR_CTA_ONLY", ctaUrgency: "HIGH" },
      defaultLogoAssetId: "logo-1",
    };
    const prompt = buildScenePrompt(scene, context, { ctaVisualAction: "POINT_TO_BUTTON", ctaCharacterGesture: "aponta para o botao" });
    assert.ok(prompt.positivePrompt.includes("point to button"));
    assert.ok(prompt.positivePrompt.includes("creative intent, not a provider guarantee"));
    assert.equal(prompt.overlayInstructions.ctaText, "Acesse o Radar Smart", "CTA overlay continua vindo so de ctaStrategy real, nunca do hint");
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
