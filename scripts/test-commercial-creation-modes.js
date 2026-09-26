// Radar Smart Commercial Creation Modes V1 - structural tests.
// No network, no providers, no media generation.

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

const { buildCommercialCreationModePreview } = require("../lib/commercial-video/creation-modes/storyboard-builder.ts");
const {
  recomputeCommercialStoryboardFingerprint,
  resolveCommercialCreationApprovalValidation,
} = require("../lib/commercial-video/creation-modes/approval-state.ts");
const { buildReferenceFixtureDna, evaluateCreativeRemixGuard } = require("../lib/commercial-video/creation-modes/reference-dna.ts");
const { estimateSpeechSeconds } = require("../lib/commercial-video/narration/narration-duration-budget.ts");

const offer = {
  id: "offer-kokeshi",
  title: "Creme Gel Regenerador Facial Gota de Colageno Kokeshi",
  category: "beleza",
  price: 13.16,
  originalPrice: null,
  discountPct: 0,
  rating: null,
  reviewsCount: null,
  marketplace: "shopee",
  imageUrl: "https://cdn.example.com/kokeshi.png",
};

const productIntelligence = {
  category: "beleza",
  painPoints: ["pele cansada e sem vico"],
  desires: ["rotina de autocuidado simples"],
  objections: ["sera que vale o preco?"],
  purchaseMotivations: ["achado barato para testar"],
  keyBenefits: ["textura leve", "uso facil"],
  emotionalBenefits: ["sensacao de cuidado"],
  functionalBenefits: ["hidrata visualmente a pele"],
  summary: "Produto facial de autocuidado com preco baixo.",
};

function contract(mode, overrides = {}) {
  return {
    productId: offer.id,
    campaignId: "campaign-test",
    creationMode: mode,
    userPrompt: "Comercial direto, com produto real, preco real e CTA para Radar Smart.",
    targetDuration: 15,
    tone: "direto e persuasivo",
    visualStyle: "Radar Smart premium",
    primaryObjective: "SALES",
    callToActions: ["Ver oferta no Radar Smart", "Entrar no Grupo VIP Radar Smart"],
    mustShow: ["produto real", "preco real"],
    mustSay: ["textura leve"],
    mustAvoid: ["desconto inventado", "promessa de resultado garantido"],
    presenterPreference: "AUTO",
    productUsagePreference: "DEMONSTRATE_USE",
    referenceVideo: null,
    ...overrides,
  };
}

function build(mode, overrides = {}) {
  return buildCommercialCreationModePreview({
    contract: contract(mode, overrides),
    offer,
    productIntelligence,
    presenterAssetIds: {
      identityReferenceAssetId: "asset-primary",
      supportReferenceAssetId: "asset-support",
    },
  });
}

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({ name, status: "FAIL", error: error.message });
  }
}

test("1 - four creation modes produce reviewable storyboard previews", () => {
  for (const mode of ["PRODUCT_COMMERCIAL", "PRESENTER_UGC", "HYBRID_SALES", "TREND_REFERENCE_REMIX"]) {
    const preview = build(mode, mode === "TREND_REFERENCE_REMIX" ? {
      referenceVideo: {
        sourceUrl: "https://example.com/ref-video",
        sourceLabel: "REFERENCE",
        preserveStructure: true,
        preservePacing: true,
        preserveHookMechanism: true,
        preserveCameraLanguage: false,
        preserveProductPresentationMechanism: true,
        preserveCtaMechanism: true,
      },
    } : {});
    assert.equal(preview.approvalState, "READY_FOR_REVIEW");
    assert.ok(preview.scenes.length >= 3);
    assert.equal(preview.dryRunGenerationPlanReady, true);
    assert.equal(preview.generationPlan.mode, "MOCK");
    assert.ok(preview.scenes.every((scene) => scene.whyThisSceneExists && scene.whyViewerKeepsWatching));
  }
});

test("2 - user prompt becomes the creative contract without provider calls", () => {
  const preview = build("HYBRID_SALES", { userPrompt: "Comecar com Garota Radar e depois demo fiel do Kokeshi." });
  assert.match(preview.contract.userPrompt, /Garota Radar/);
  assert.equal(fetchCalls, 0);
});

test("3 - PRODUCT_COMMERCIAL stays product-first and does not force presenter", () => {
  const preview = build("PRODUCT_COMMERCIAL");
  const characterScenes = preview.promptPlan.scenes.filter((scene) => scene.mediaType === "CHARACTER_VIDEO");
  assert.equal(characterScenes.length, 0);
  assert.equal(preview.commercialDirection.presenterStrategy, "PRODUCT_ONLY");
});

test("4 - presenter modes do not turn every scene into character video automatically", () => {
  const preview = build("HYBRID_SALES");
  const characterScenes = preview.promptPlan.scenes.filter((scene) => scene.mediaType === "CHARACTER_VIDEO");
  assert.ok(characterScenes.length > 0);
  assert.ok(characterScenes.length < preview.promptPlan.scenes.length);
});

test("4b - HYBRID_SALES persists end-to-end with presenter-product-presenter-product-presenter", () => {
  const preview = build("HYBRID_SALES", { targetDuration: 15, primaryObjective: "PRODUCT_SALE" });
  assert.equal(preview.creationTrace.requestedCreationMode, "HYBRID_SALES");
  assert.equal(preview.creationTrace.resolvedCreationMode, "HYBRID_SALES");
  assert.equal(preview.commercialDirection.presenterStrategy, "GAROTA_RADAR_RECOMMENDATION");
  assert.deepEqual(
    preview.scenes.map((scene) => scene.garotaRadarAppearance === "NONE" ? "PRODUCT" : "PRESENTER"),
    ["PRESENTER", "PRODUCT", "PRESENTER", "PRODUCT", "PRESENTER"],
  );
  assert.deepEqual(preview.scenes.map((scene) => scene.durationSeconds), [3, 3, 3, 3, 3]);
});

test("5 - real offer price is used and discount is not invented", () => {
  const preview = build("HYBRID_SALES");
  const offerScene = preview.scenes.find((scene) => scene.purpose === "OFFER");
  assert.ok(offerScene);
  assert.equal(offerScene.price, "R$ 13,16");
  assert.equal(preview.commercialDirection.offerStrategy.discountPercent, 0);
  assert.ok(!JSON.stringify(preview).includes("0% OFF"));
});

test("6 - CTA is normalized to Radar Smart", () => {
  const preview = build("PRODUCT_COMMERCIAL", { callToActions: ["Clique para ver"] });
  assert.match(preview.contract.callToActions[0], /Radar Smart/);
  assert.match(preview.commercialDirection.ctaStrategy.ctaText, /Radar Smart/);
});

test("6b - user CTA survives builder and includes Grupo VIP when requested", () => {
  const preview = build("HYBRID_SALES", {
    callToActions: ["Acesse a Radar Smart", "Entre no Grupo VIP"],
  });
  const ctaScene = preview.scenes.find((scene) => scene.sceneId === "scene-5");
  assert.ok(ctaScene);
  assert.match(ctaScene.cta || "", /Radar Smart/);
  assert.match(ctaScene.cta || "", /Grupo VIP/);
  assert.match(ctaScene.spokenNarration, /Grupo VIP/);
});

test("7 - reference fixtures expose required CreativeDNA fields", () => {
  for (const source of ["REFERENCE_A", "REFERENCE_B"]) {
    const dna = buildReferenceFixtureDna(source);
    assert.ok(dna.durationSeconds > 0);
    assert.ok(dna.hookMechanism);
    assert.ok(dna.shotSequence.length);
    assert.ok(dna.cameraSequence.length);
    assert.ok(dna.narrativePattern);
  }
});

test("8 - remix guard preserves mechanics but replaces specifics", () => {
  const guard = evaluateCreativeRemixGuard({
    sourceUrl: "https://example.com/reference",
    sourceLabel: "reference",
    preserveStructure: true,
    preservePacing: true,
    preserveHookMechanism: true,
    preserveCameraLanguage: true,
    preserveProductPresentationMechanism: true,
    preserveCtaMechanism: true,
  });
  assert.ok(guard);
  assert.equal(guard.status, "PASS_WITH_OBSERVATIONS");
  assert.ok(guard.preservedMechanics.includes("structure"));
  assert.ok(guard.replacedSpecifics.includes("product"));
  assert.ok(guard.replacedSpecifics.includes("brand identity"));
  assert.ok(guard.blockedCloneRisks.length > 0);
});

test("9 - Desire Engine conflicts are reported, not silently applied", () => {
  const preview = buildCommercialCreationModePreview({
    contract: contract("PRODUCT_COMMERCIAL", {
      mustSay: ["resultado garantido em poucos dias"],
    }),
    offer,
    productIntelligence: { ...productIntelligence, category: "suplementos" },
    presenterAssetIds: {
      identityReferenceAssetId: "asset-primary",
      supportReferenceAssetId: "asset-support",
    },
  });
  assert.ok(preview.optimizerAudit.conflicts.length > 0);
  assert.equal(preview.optimizerAudit.appliedWithinContract, false);
});

test("10 - cost preview keeps credits, BRL, and USD separate", () => {
  const preview = build("HYBRID_SALES");
  assert.ok("estimatedVideoCredits" in preview.totals);
  assert.ok("estimatedTtsCredits" in preview.totals);
  assert.ok("estimatedCurrencyCostCents" in preview.totals);
  assert.ok("estimatedUsdCostCents" in preview.totals);
  assert.ok(preview.scenes.every((scene) => "estimatedUsdCostCents" in scene.cost));
});

test("11 - all creation modes persist requested/resolved trace", () => {
  for (const mode of ["PRODUCT_COMMERCIAL", "PRESENTER_UGC", "HYBRID_SALES", "TREND_REFERENCE_REMIX"]) {
    const preview = build(mode, mode === "TREND_REFERENCE_REMIX" ? {
      referenceVideo: {
        sourceUrl: "https://example.com/ref-video",
        sourceLabel: "REFERENCE",
        preserveStructure: true,
        preservePacing: true,
        preserveHookMechanism: true,
        preserveCameraLanguage: false,
        preserveProductPresentationMechanism: true,
        preserveCtaMechanism: true,
      },
    } : {});
    assert.equal(preview.creationTrace.requestedCreationMode, mode);
    assert.equal(preview.creationTrace.resolvedCreationMode, mode);
    assert.ok(preview.storyboardFingerprint.startsWith("ccm-v1-"));
  }
});

test("12 - storyboard fingerprint is deterministic, non-null, and recomputable after reload", () => {
  const first = build("HYBRID_SALES");
  const second = build("HYBRID_SALES");
  assert.ok(first.storyboardFingerprint);
  assert.ok(first.storyboardFingerprint.startsWith("ccm-v1-"));
  assert.equal(first.storyboardFingerprint, second.storyboardFingerprint);
  assert.equal(recomputeCommercialStoryboardFingerprint(first), first.storyboardFingerprint);
});

test("13 - approve persists current fingerprint and reload preserves approval validity", () => {
  const preview = build("HYBRID_SALES");
  const persistedBrief = {
    commercialCreationStatus: "APPROVED_FOR_GENERATION",
    commercialCreationStoryboard: { ...preview, approvalState: "APPROVED_FOR_GENERATION" },
    commercialCreationApprovedFingerprint: preview.storyboardFingerprint,
    commercialCreationApprovedAt: "2026-08-11T12:00:00.000Z",
  };
  const reloadedStoryboard = persistedBrief.commercialCreationStoryboard;
  const validation = resolveCommercialCreationApprovalValidation({
    approvalStatus: persistedBrief.commercialCreationStatus,
    currentStoryboardFingerprint: reloadedStoryboard.storyboardFingerprint,
    approvedStoryboardFingerprint: persistedBrief.commercialCreationApprovedFingerprint,
  });
  assert.equal(validation.approvalValid, true);
  assert.equal(validation.resolvedApprovalState, "APPROVED_FOR_GENERATION");
  assert.equal(validation.staleReason, null);
});

test("14 - changed storyboard invalidates prior approval fingerprint", () => {
  const first = build("HYBRID_SALES", { userPrompt: "Versao A" });
  const second = build("HYBRID_SALES", { userPrompt: "Versao B" });
  assert.notEqual(first.storyboardFingerprint, second.storyboardFingerprint);
  assert.equal(second.approvalState, "READY_FOR_REVIEW");
  const validation = resolveCommercialCreationApprovalValidation({
    approvalStatus: "APPROVED_FOR_GENERATION",
    currentStoryboardFingerprint: second.storyboardFingerprint,
    approvedStoryboardFingerprint: first.storyboardFingerprint,
  });
  assert.equal(validation.approvalValid, false);
  assert.equal(validation.resolvedApprovalState, "READY_FOR_REVIEW");
  assert.match(validation.staleReason || "", /precisa ser aprovado novamente/);
});

test("15 - null fingerprints never produce a valid approval", () => {
  const nullNull = resolveCommercialCreationApprovalValidation({
    approvalStatus: "APPROVED_FOR_GENERATION",
    currentStoryboardFingerprint: null,
    approvedStoryboardFingerprint: null,
  });
  assert.equal(nullNull.approvalValid, false);
  assert.equal(nullNull.resolvedApprovalState, "DRAFT");
  assert.match(nullNull.staleReason || "", /precisa ser aprovado novamente/);

  const legacyApprovedNull = resolveCommercialCreationApprovalValidation({
    approvalStatus: "APPROVED_FOR_GENERATION",
    currentStoryboardFingerprint: "",
    approvedStoryboardFingerprint: "",
  });
  assert.equal(legacyApprovedNull.approvalValid, false);
});

test("16 - non-material UI-only changes do not alter storyboard fingerprint", () => {
  const preview = build("HYBRID_SALES");
  const withUiOnlyState = {
    ...preview,
    uiExpandedSceneId: "scene-2",
    scenes: preview.scenes.map((scene) => ({ ...scene, uiCollapsed: false })),
  };
  assert.equal(recomputeCommercialStoryboardFingerprint(withUiOnlyState), preview.storyboardFingerprint);
});

test("17 - scene instruction never becomes spoken narration", () => {
  const preview = build("HYBRID_SALES");
  for (const scene of preview.scenes) {
    assert.ok(scene.sceneInstruction);
    assert.ok(scene.spokenNarration);
    assert.notEqual(scene.sceneInstruction, scene.spokenNarration);
    assert.doesNotMatch(scene.spokenNarration, /Mostra o produto real|Reforca o beneficio principal|direto ao ponto/i);
  }
});

test("17b - Kokeshi HYBRID_SALES uses final approved narration copy", () => {
  const preview = build("HYBRID_SALES");
  assert.deepEqual(
    preview.scenes.map((scene) => scene.spokenNarration),
    [
      "Olha esse achado por só R$ 13,16.",
      "Esse é o Creme Gel Kokeshi.",
      "Por esse preço, vale conhecer.",
      "Só R$ 13,16.",
      "Entre no Grupo VIP da Radar Smart.",
    ],
  );
  assert.match(preview.scenes[1].productUse, /produto Kokeshi real/);
  assert.match(preview.scenes[1].productUse, /contexto de skincare/);
  assert.match(preview.scenes[1].productUse, /textura\/aplicacao/);
  assert.match(preview.scenes[1].productUse, /product fidelity obrigatoria/);
  assert.match(preview.scenes[1].productUse, /sem promessa de resultado/);
  assert.match(preview.scenes[1].productUse, /sem produto flutuando/);
  assert.match(preview.scenes[3].productUse, /discountText null/);
});

test("17c - Kokeshi HYBRID_SALES compressed narration fits 3s scene slots", () => {
  const preview = build("HYBRID_SALES");
  for (const scene of preview.scenes) {
    const estimatedSpeechSeconds = estimateSpeechSeconds([...scene.spokenNarration].length);
    const tailMargin = scene.durationSeconds - estimatedSpeechSeconds;
    assert.ok(tailMargin >= 0.25, `${scene.sceneId} tail margin ${tailMargin.toFixed(3)}s`);
  }
});

test("18 - product-required hook cannot route to reference-less TEXT_TO_VIDEO", () => {
  const preview = build("PRODUCT_COMMERCIAL");
  const hook = preview.promptPlan.scenes.find((scene) => scene.purpose === "HOOK");
  assert.ok(hook);
  assert.equal(hook.mediaType, "PRODUCT_VIDEO");
  assert.equal(hook.productFidelityRequirement, "REQUIRED");
});

test("19 - legacy copy is not used by Commercial Creation Mode", () => {
  const preview = build("HYBRID_SALES");
  assert.equal(preview.creationTrace.legacyCopySourcesUsed, false);
  assert.ok(!JSON.stringify(preview.scenes).includes("praticidade no consumo diario"));
});

const failed = results.filter((result) => result.status === "FAIL");
for (const result of results) {
  console.log(`${result.status} ${result.name}${result.error ? ` - ${result.error}` : ""}`);
}

console.log(`COMMERCIAL_CREATION_MODES_TESTS_PASS=${failed.length === 0 ? "YES" : "NO"}`);
console.log(`FETCH_CALLS=${fetchCalls}`);

if (failed.length > 0) {
  process.exitCode = 1;
}
