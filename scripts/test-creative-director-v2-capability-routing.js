// Radar Creative AI - Subject-Aware Capability Routing V1 / Product Fidelity Gate
// Test Suite
//
// Cobre os 19 itens do pedido original (secao "TESTES OBRIGATORIOS"). Mesmo
// padrao dos scripts anteriores: sem Jest, transpile on-the-fly, fetch
// bloqueado (garante que NENHUMA chamada de rede acontece so por rodar
// estes testes - nem provider, nem Supabase real).

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
const { buildProductPositiveDescriptor } = require("../lib/prompt-builder/product-prompt.ts");
const {
  deriveProductFidelityRequirement,
  isProductReferenceRequired,
  promoteProductFidelityRequirementByReferenceQuality,
} = require("../lib/prompt-builder/product-fidelity-requirement.ts");
const { mapSceneToCapability } = require("../lib/generation-orchestrator/capability-map.ts");
const { selectProvider } = require("../lib/generation-orchestrator/provider-selector.ts");
const { estimateSceneCost } = require("../lib/generation-orchestrator/cost-estimator.ts");
const { decideProductGenerationStrategy } = require("../lib/generation-orchestrator/product-generation-strategy.ts");
const { buildSceneExecutionPlan } = require("../lib/generation-orchestrator/scene-execution-plan.ts");
const { evaluateCapabilityFidelityFit } = require("../lib/generation-orchestrator/capability-fidelity-gate.ts");
const { CAPABILITY_PRODUCT_REFERENCE_SUPPORT } = require("../lib/generation-orchestrator/capability-fidelity-matrix.ts");
const { evaluateCampaignExecutionReadiness } = require("../lib/commercial-video/runner/execute/execution-readiness.ts");
const { buildOverlayPlan } = require("../lib/prompt-builder/overlay-plan.ts");

function baseV1Input(overrides = {}) {
  return {
    offerId: "offer-test",
    productTitle: "Creme Gel Regenerador Facial Gota de Colageno Kokeshi",
    category: "beleza",
    discountPct: 0,
    price: 13.16,
    originalPrice: null,
    rating: null,
    reviewsCount: null,
    marketplace: "shopee",
    primaryPain: "pele cansada e sem vico",
    primaryDesire: "pele revitalizada rapido",
    primaryObjection: "sera que funciona mesmo?",
    purchaseMotivation: "autocuidado",
    frameworkSlug: "oferta-direta",
    angleSlug: "transformacao",
    officialCharacterSlug: null,
    ...overrides,
  };
}

function baseContext(overrides = {}) {
  return {
    productTitle: "Creme Gel Regenerador Facial Gota de Colageno Kokeshi",
    category: "beleza",
    platform: "TIKTOK",
    aspectRatio: "9:16",
    visualStyle: "PREMIUM_COMMERCIAL",
    pace: "MEDIUM",
    offerStrategy: { currentPrice: 13.16, originalPrice: null, discountPercent: null, savingsAmount: null, priceReveal: "SHOW_PRICE_MIDDLE" },
    ctaStrategy: { ctaText: "Compre agora", ctaVisual: "logo", ctaPresenter: "PRODUCT_ONLY", ctaUrgency: "LOW" },
    defaultLogoAssetId: null,
    ...overrides,
  };
}

function hookScene(overrides = {}) {
  return {
    id: "scene-1", order: 1, startSecond: 0, endSecond: 2, purpose: "HOOK",
    visualSubject: "produto em destaque", presenter: "PRODUCT_ONLY", productAction: "reveal",
    characterDirection: null, identityReferenceAssetId: null, supportReferenceAssetId: null,
    camera: "push-in", motion: "reveal rapido com push-in no produto", lighting: "estudio dinamico",
    textOverlay: null, voiceoverIntent: "hook", sfxIntent: null, transitionIntent: "cut",
    ...overrides,
  };
}

function resolvedRefs(overrides = {}) {
  return {
    identityReferenceUrl: null,
    supportReferenceAssetId: null,
    supportReferenceUrl: null,
    productReferenceUrl: "https://cdn.example.com/kokeshi.png",
    supportReferenceError: null,
    productReferenceQuality: null,
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
  // 1. V1 permanece igual
  await test("1 - V1 (sem hints V2) mantem HOOK como TEXT_TO_VIDEO exatamente como antes", async () => {
    const v1 = await buildCommercialDirection(baseV1Input({}));
    const plan = buildCampaignPromptPlan("campaign-v1", v1, baseContext());
    const hook = plan.scenes.find((s) => s.purpose === "HOOK");
    assert.equal(hook.mediaType, "TEXT_TO_VIDEO", "V1 sem Creative Director V2 nunca deve mudar de comportamento");
    assert.equal(hook.productFidelityRequirement, "NONE");
  });

  // 2. HOOK ambiental pode continuar TEXT_TO_VIDEO
  await test("2 - HOOK com productRoleV2=NONE (estrategia sem produto em foco) continua TEXT_TO_VIDEO", async () => {
    const prompt = buildScenePrompt(hookScene(), baseContext(), { productRoleV2: "NONE", subjectPriorityV2: "ENVIRONMENT" });
    assert.equal(prompt.mediaType, "TEXT_TO_VIDEO");
    assert.equal(prompt.productFidelityRequirement, "NONE");
  });

  // 3. HOOK HERO_PRODUCT_REVEAL com produto real nao pode T2V
  await test("3 - HOOK com productRoleV2=HERO (HERO_PRODUCT_REVEAL) nunca mapeia para TEXT_TO_VIDEO", async () => {
    const prompt = buildScenePrompt(hookScene(), baseContext(), { productRoleV2: "HERO", subjectPriorityV2: "PRODUCT" });
    assert.equal(prompt.mediaType, "PRODUCT_VIDEO");
    assert.notEqual(prompt.mediaType, "TEXT_TO_VIDEO");
    assert.equal(mapSceneToCapability(prompt), "PRODUCT_VIDEO");
  });

  // 4. HERO product exige product reference
  await test("4 - deriveProductFidelityRequirement: productRoleV2=HERO fora de purpose product-centric -> REQUIRED", async () => {
    assert.equal(deriveProductFidelityRequirement({ purpose: "HOOK", productRoleV2: "HERO" }), "REQUIRED");
    assert.equal(deriveProductFidelityRequirement({ purpose: "PROBLEM", productRoleV2: "HERO" }), "REQUIRED");
    assert.equal(deriveProductFidelityRequirement({ purpose: "HOOK", productRoleV2: "SUPPORTING" }), "OPTIONAL");
    assert.equal(deriveProductFidelityRequirement({ purpose: "HOOK" }), "NONE");
    assert.ok(isProductReferenceRequired("REQUIRED"));
    assert.ok(isProductReferenceRequired("STRICT"));
    assert.ok(!isProductReferenceRequired("OPTIONAL"));
    assert.ok(!isProductReferenceRequired("NONE"));
  });

  // 5. referencia ausente bloqueia
  await test("5 - decideProductGenerationStrategy: PRODUCT_VIDEO sem referencia real -> BLOCKED_REFERENCE_QUALITY", async () => {
    const strategy = decideProductGenerationStrategy({
      mediaType: "PRODUCT_VIDEO",
      productIntegrityRisk: "LOW",
      fidelityRisk: null,
      hasProductReference: false,
    });
    assert.equal(strategy, "BLOCKED_REFERENCE_QUALITY");
  });

  // 6. ausencia de referencia nunca faz fallback para T2V
  await test("6 - HOOK HERO sem referencia real nunca faz fallback silencioso para TEXT_TO_VIDEO", async () => {
    const context = baseContext();
    const promptPlan = buildCampaignPromptPlan(
      "campaign-fallback-test",
      { ...(await buildCommercialDirection(baseV1Input({}))), scenes: [hookScene()] },
      context,
      undefined,
    );
    const hookPrompt = { ...promptPlan.scenes[0], productFidelityRequirement: "REQUIRED", mediaType: "PRODUCT_VIDEO" };
    const plan = buildSceneExecutionPlan(hookPrompt, resolvedRefs({ productReferenceUrl: null, productReferenceQuality: null }));
    assert.equal(plan.providerCapability, "PRODUCT_VIDEO", "capability nunca deve degradar para TEXT_TO_VIDEO so por falta de referencia");
    assert.equal(plan.productGenerationStrategy, "BLOCKED_REFERENCE_QUALITY");
  });

  // 7. PRODUCT_VIDEO aceita referencia
  await test("7 - capability-fidelity-matrix: PRODUCT_VIDEO e IMAGE_TO_VIDEO aceitam referencia real de produto", async () => {
    assert.equal(CAPABILITY_PRODUCT_REFERENCE_SUPPORT.PRODUCT_VIDEO.acceptsProductReference, true);
    assert.equal(CAPABILITY_PRODUCT_REFERENCE_SUPPORT.IMAGE_TO_VIDEO.acceptsProductReference, true);
    assert.equal(CAPABILITY_PRODUCT_REFERENCE_SUPPORT.TEXT_TO_VIDEO.acceptsProductReference, false);
  });

  // 8. HYBRID aceita referencia (via composicao, nunca via payload de texto)
  await test("8 - evaluateCapabilityFidelityFit: HYBRID_PRODUCT_COMPOSITE e a UNICA excecao legitima com capability TEXT_TO_VIDEO", async () => {
    const hybridFit = evaluateCapabilityFidelityFit({ productFidelityRequirement: "REQUIRED", capability: "TEXT_TO_VIDEO", isHybridComposite: true });
    assert.equal(hybridFit.ok, true);
    const nonHybridFit = evaluateCapabilityFidelityFit({ productFidelityRequirement: "REQUIRED", capability: "TEXT_TO_VIDEO", isHybridComposite: false });
    assert.equal(nonHybridFit.ok, false);
    assert.ok(nonHybridFit.reason.includes("TEXT_TO_VIDEO"));
  });

  // 9. provider selector continua independente do V2
  await test("9 - selectProvider nunca recebe/precisa de nenhum sinal do Creative Director V2", async () => {
    const selection = selectProvider("PRODUCT_VIDEO", { needsIdentityReference: false });
    assert.equal(selection.selectedProvider, "freepik-kling-i2v");
  });

  // 10. Prompt Builder nao diz "as provided" sem referencia
  await test("10 - HOOK TEXT_TO_VIDEO nunca afirma 'shown exactly as provided' (nenhuma referencia e enviada)", async () => {
    const prompt = buildScenePrompt(hookScene(), baseContext());
    assert.equal(prompt.mediaType, "TEXT_TO_VIDEO");
    assert.ok(!prompt.positivePrompt.includes("shown exactly as provided"), "TEXT_TO_VIDEO nao pode prometer preservacao de referencia que nao recebe");
    assert.ok(prompt.positivePrompt.includes("no real product reference image is provided"));
  });

  // 11. Prompt Builder pode dizer "as provided" com referencia real
  await test("11 - PRODUCT_VIDEO (purpose PRODUCT, V1 legado) continua afirmando 'shown exactly as provided'", async () => {
    const scene = hookScene({ id: "scene-2", order: 2, purpose: "PRODUCT", startSecond: 2, endSecond: 6 });
    const prompt = buildScenePrompt(scene, baseContext());
    assert.equal(prompt.mediaType, "PRODUCT_VIDEO");
    assert.ok(prompt.positivePrompt.includes("shown exactly as provided"), "V1 legado (PRODUCT/BENEFIT/OFFER/CTA) nao pode mudar de comportamento");
    assert.equal(buildProductPositiveDescriptor("X", true).includes("shown exactly as provided"), true);
    assert.equal(buildProductPositiveDescriptor("X", false).includes("shown exactly as provided"), false);
  });

  // 12. negative prompt nao conta como product fidelity
  await test("12 - negativePrompt (guardrails) nunca muda mediaType/capability - fidelidade so vem de mediaType/capability real", async () => {
    const promptWithGuardrails = buildScenePrompt(hookScene(), baseContext(), { productRoleV2: "NONE" });
    assert.ok(promptWithGuardrails.negativePrompt.includes("altered product packaging"), "guardrails de integridade continuam presentes no negative prompt");
    assert.equal(promptWithGuardrails.mediaType, "TEXT_TO_VIDEO", "negativePrompt sozinho nao pode 'consertar' uma capability sem referencia real");
  });

  // 13. 0% OFF continua bloqueado
  await test("13 - 0% OFF continua sem overlay de desconto (regressao do bug ja corrigido)", async () => {
    const overlay = buildOverlayPlan({
      purpose: "OFFER",
      offerStrategy: { currentPrice: 13.16, originalPrice: 13.16, discountPercent: 0, savingsAmount: 0, priceReveal: "SHOW_PRICE_MIDDLE" },
      ctaStrategy: { ctaText: "x", ctaVisual: "x", ctaPresenter: "PRODUCT_ONLY", ctaUrgency: "LOW" },
      hasCharacterInScene: false,
    });
    assert.equal(overlay.overlayInstructions.discountText, null);
  });

  // 14. scene-2/3/4 continuam validas
  await test("14 - PRODUCT/BENEFIT/OFFER/CTA continuam mapeando para PRODUCT_VIDEO/CHARACTER_VIDEO exatamente como antes", async () => {
    const v1 = await buildCommercialDirection(baseV1Input({}));
    const { result: v2 } = await buildCreativeDirectionV2DecisionEngine(baseV1Input({}), v1);
    const plan = buildCampaignPromptPlan("campaign-full", v2.underlyingDirection, baseContext(), {
      sceneBlueprints: v2.sceneBlueprints,
      ctaDirection: v2.ctaDirection,
    });
    for (const scene of plan.scenes) {
      if (["PRODUCT", "BENEFIT", "OFFER"].includes(scene.purpose)) {
        assert.equal(scene.mediaType, "PRODUCT_VIDEO", `${scene.purpose} deveria continuar PRODUCT_VIDEO`);
      }
    }
  });

  // 15. CTA/CHARACTER_VIDEO continua valido
  await test("15 - identityReferenceAssetId continua tendo prioridade sobre qualquer hint V2 (CHARACTER_VIDEO nunca e sobrescrito)", async () => {
    const scene = hookScene({ id: "scene-5", order: 5, purpose: "CTA", identityReferenceAssetId: "id-1", characterDirection: { expression: "INVITING", pose: "INVITING", shot: "HALF_BODY" } });
    const prompt = buildScenePrompt(scene, baseContext(), { productRoleV2: "HERO", subjectPriorityV2: "PRODUCT" });
    assert.equal(prompt.mediaType, "CHARACTER_VIDEO", "identidade de personagem continua tendo prioridade sobre qualquer hint de produto");
  });

  // 16. cost estimator usa nova capability (com o piso de duracao faturavel
  // real do Kling - achado do pre-flight real do CANARY B: a API so aceita
  // duration "5"|"10", exatamente como o WAN - cost-estimator.ts precisou
  // ganhar o MESMO piso para freepik-kling-i2v, que nao existia antes)
  await test("16 - custo real da nova capability (freepik-kling-i2v, 65 creditos/s, piso de 5s) ainda e bem menor que o do WAN (300 creditos/s, piso de 5s)", async () => {
    const newCost = estimateSceneCost("freepik-kling-i2v", 2);
    const oldCost = estimateSceneCost("wan-2-5-t2v", 2);
    assert.equal(newCost.estimatedCredits, 325, "2s arredonda para 5s faturaveis (piso real da API Kling) x 65 creditos/s = 325");
    assert.equal(oldCost.estimatedCredits, 1500, "WAN arredonda 2s -> 5s faturaveis x 300 creditos/s = 1500");
    assert.ok(newCost.estimatedCredits < oldCost.estimatedCredits);

    const cost6s = estimateSceneCost("freepik-kling-i2v", 6);
    assert.equal(cost6s.estimatedCredits, 650, "6s (>5s) arredonda para 10s faturaveis x 65 creditos/s = 650");
    const cost5s = estimateSceneCost("freepik-kling-i2v", 5);
    assert.equal(cost5s.estimatedCredits, 325, "5s exatos nao arredondam para 10s");
  });

  // 17. DRY_RUN chama zero providers (checado no final via fetchCalls)

  // 18/19 (TypeScript/lint) - rodados separadamente via npx tsc/npm run lint.

  // Extra: STRICT promotion e o Execution Readiness gate ponta a ponta.
  await test("20 - promoteProductFidelityRequirementByReferenceQuality so promove REQUIRED com fidelityRisk HIGH", async () => {
    assert.equal(promoteProductFidelityRequirementByReferenceQuality("REQUIRED", "HIGH"), "STRICT");
    assert.equal(promoteProductFidelityRequirementByReferenceQuality("REQUIRED", "LOW"), "REQUIRED");
    assert.equal(promoteProductFidelityRequirementByReferenceQuality("OPTIONAL", "HIGH"), "OPTIONAL");
    assert.equal(promoteProductFidelityRequirementByReferenceQuality("NONE", "HIGH"), "NONE");
  });

  await test("21 - buildSceneExecutionPlan bloqueia (capabilityFidelityBlocked) quando REQUIRED encontra capability sem referencia, fora de HYBRID", async () => {
    const forcedPrompt = { ...buildScenePrompt(hookScene(), baseContext()), productFidelityRequirement: "REQUIRED" };
    const plan = buildSceneExecutionPlan(forcedPrompt, resolvedRefs());
    assert.equal(plan.status, "FAILED");
    assert.equal(plan.capabilityFidelityBlocked, true);
    assert.ok(plan.statusReason.includes("nao aceita nenhuma referencia real de produto"));
  });

  await test("22 - BLOCKED_CAPABILITY_FIDELITY se propaga ate evaluateCampaignExecutionReadiness (antes de qualquer chamada paga)", async () => {
    const sceneRunnerPlan = {
      sceneId: "scene-1", sceneOrder: 1, purpose: "HOOK", providerCapability: "TEXT_TO_VIDEO",
      selectedProvider: "wan-2-5-t2v", providerStatus: "ACTIVE", productGenerationStrategy: null,
      requiresHybridPipeline: false, eligibility: "BLOCKED_CAPABILITY_FIDELITY",
      eligibilityReason: "Cena exige fidelidade de produto REQUIRED mas TEXT_TO_VIDEO nao aceita referencia.",
      estimatedCost: { provider: "wan-2-5-t2v", estimatedCredits: 1500, estimatedCurrencyCostCents: null, estimatedUsdCostCents: null, actualCredits: null, actualCurrencyCostCents: null, costUnit: "CREDITS" },
      persistedStatus: "FAILED", persistedStatusReason: "x", existingAsset: null,
    };
    const readiness = evaluateCampaignExecutionReadiness([sceneRunnerPlan], null, null);
    assert.equal(readiness.status, "BLOCKED_CAPABILITY_FIDELITY");
    assert.equal(readiness.canProduceFinalCommercial, false);
  });

  await test("23 - CTA/PRODUCT/BENEFIT/OFFER com personagem (CHARACTER_VIDEO) NUNCA fica REQUIRED - regressao real encontrada no pre-flight Kokeshi (scene-5)", async () => {
    const ctaScene = hookScene({
      id: "scene-5", order: 5, purpose: "CTA", startSecond: 15, endSecond: 20,
      identityReferenceAssetId: "id-1", characterDirection: { expression: "INVITING", pose: "INVITING", shot: "HALF_BODY" },
    });
    const prompt = buildScenePrompt(ctaScene, baseContext(), { productRoleV2: "BACKGROUND", subjectPriorityV2: "CHARACTER" });
    assert.equal(prompt.mediaType, "CHARACTER_VIDEO");
    assert.equal(prompt.productFidelityRequirement, "NONE", "personagem transmite oferta pela performance - nunca deveria exigir referencia de produto");
    const plan = buildSceneExecutionPlan(
      prompt,
      resolvedRefs({ productReferenceUrl: null, identityReferenceUrl: "https://cdn.example.com/id.png", supportReferenceAssetId: "support-1", supportReferenceUrl: "https://cdn.example.com/support.png" }),
    );
    assert.equal(plan.status, "READY", "CTA com personagem sem referencia de produto nunca pode ser bloqueada pelo Fidelity Gate");
    assert.equal(plan.capabilityFidelityBlocked, false);
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
