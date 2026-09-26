// Radar Smart Social Commerce V2 - structural tests.
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
  throw new Error("External calls are forbidden in Social Commerce V2 tests.");
};

const {
  buildSocialCommerceV2Plan,
  buildPresenterShotPlan,
  buildMicroCutStoryboard,
  buildProductExperiencePlan,
  buildCtaBehaviorPlan,
  buildSocialCommerceExecutionPreflight,
  getVoiceCastingSpec,
  runSocialCommerceQualityGate,
} = require("../lib/commercial-video/social-commerce-v2/index.ts");

const offer = {
  id: "offer-kokeshi",
  title: "Creme Gel Regenerador Facial Gota de Colageno Kokeshi",
  category: "beleza",
  price: 13.16,
  originalPrice: null,
  discountPct: 0,
  rating: null,
  reviewsCount: null,
  marketplace: "tiktokshop",
  imageUrl: "https://example.com/kokeshi.png",
};

const currentScenes = [
  {
    sceneId: "scene-1",
    sceneNumber: 1,
    purpose: "HOOK",
    durationSeconds: 3,
    visual: "Garota Radar",
    productUse: "sem produto visivel; hook humano cria curiosidade para o achado",
    garotaRadarAppearance: "HOOK",
    spokenNarration: "Olha esse achado por so R$ 13,16.",
    overlay: "achado de skincare",
    price: null,
    cta: null,
  },
  {
    sceneId: "scene-2",
    sceneNumber: 2,
    purpose: "PRODUCT_DEMONSTRATION",
    durationSeconds: 3,
    visual: "produto Kokeshi real",
    productUse: "produto Kokeshi real em contexto de skincare, com textura/aplicacao contextualizada",
    garotaRadarAppearance: "NONE",
    spokenNarration: "Esse e o Creme Gel Kokeshi.",
    overlay: null,
    price: null,
    cta: null,
  },
  {
    sceneId: "scene-3",
    sceneNumber: 3,
    purpose: "SALES_ARGUMENT",
    durationSeconds: 3,
    visual: "Garota Radar reage",
    productUse: "argumento curto da apresentadora sobre valor percebido",
    garotaRadarAppearance: "DEMO",
    spokenNarration: "Por esse preco, da vontade de testar.",
    overlay: "vale testar",
    price: null,
    cta: null,
  },
  {
    sceneId: "scene-4",
    sceneNumber: 4,
    purpose: "OFFER",
    durationSeconds: 3,
    visual: "oferta real de Kokeshi",
    productUse: "produto real em packshot com overlay deterministico R$ 13,16",
    garotaRadarAppearance: "NONE",
    spokenNarration: "So R$ 13,16.",
    overlay: "R$ 13,16",
    price: "R$ 13,16",
    cta: null,
  },
  {
    sceneId: "scene-5",
    sceneNumber: 5,
    purpose: "CTA",
    durationSeconds: 3,
    visual: "Garota Radar CTA",
    productUse: "CTA humano para Radar Smart e Grupo VIP",
    garotaRadarAppearance: "CTA",
    spokenNarration: "Quer achar ofertas assim? Entra no Grupo VIP da Radar Smart.",
    overlay: "Radar Smart Grupo VIP",
    price: null,
    cta: "Radar Smart Grupo VIP",
  },
];

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({ name, status: "FAIL", error: error.message });
  }
}

test("1 - voice casting profiles expose required specification only", () => {
  const energetic = getVoiceCastingSpec("ENERGETIC_CREATOR");
  assert.equal(energetic.generationAction, "SPEC_ONLY_NO_TTS");
  assert.equal(energetic.energyLevel, "HIGH");
  assert.match(energetic.brandFit, /Radar Smart/);

  const friendFind = getVoiceCastingSpec("FRIEND_SHOWING_A_FIND");
  assert.equal(friendFind.pacing, "FAST");
  assert.match(friendFind.speakingStyle, /friend showing a find/);

  const premium = getVoiceCastingSpec("PREMIUM_SOFT");
  assert.equal(premium.pacing, "CALM");
});

test("2 - presenter shot planning avoids one repeated standing shot", () => {
  const plan = buildPresenterShotPlan(currentScenes);
  assert.equal(plan.shotPackVersion, "GAROTA_RADAR_SHOT_PACK_V1");
  assert.ok(plan.availableShots.length >= 8);
  assert.deepEqual(plan.assignments.map((assignment) => assignment.shotType), [
    "FACE_CLOSE_REACTION",
    "HALF_BODY_CREATOR_DEMO",
    "CTA_INVITATION",
  ]);
  assert.ok(plan.varietyScore >= 80);
});

test("3 - micro-cut storyboard creates 16+ detailed beats inside macro scenes", () => {
  const storyboard = buildMicroCutStoryboard({ scenes: currentScenes, offer });
  assert.equal(storyboard.version, "SOCIAL_COMMERCE_MICRO_CUT_STORYBOARD_V2");
  assert.equal(storyboard.scenes.length, 5);
  assert.ok(storyboard.scenes.every((scene) => scene.beats.length >= 3));
  assert.ok(storyboard.scenes.reduce((sum, scene) => sum + scene.beats.length, 0) >= 16);
  assert.ok(storyboard.averageBeatDurationSeconds <= 1.1);
  assert.ok(storyboard.scenes[0].beats.some((beat) => beat.purpose === "PRICE_POP"));
  assert.ok(storyboard.scenes.every((scene) =>
    scene.beats.every((beat) =>
      beat.beatGoal &&
      beat.presenterMode &&
      beat.productMode &&
      beat.cameraDistance &&
      beat.cameraMotion &&
      beat.bodyAction &&
      beat.facialExpression &&
      beat.handAction &&
      beat.eyeDirection &&
      beat.productInteraction &&
      beat.visualFocus &&
      beat.emotionalIntent &&
      beat.salesIntent &&
      beat.audioEnergyIntent &&
      beat.transitionIntent,
    ),
  ));
});

test("4 - product experience gate requires tactile/context proof", () => {
  const productPlan = buildProductExperiencePlan(currentScenes);
  assert.equal(productPlan.version, "PRODUCT_EXPERIENCE_LAYER_V1");
  assert.equal(productPlan.overallStatus, "PASS");
  const scene2 = productPlan.scenes.find((scene) => scene.sceneId === "scene-2");
  assert.ok(scene2);
  assert.ok(scene2.elements.includes("HAND_INTERACTION"));
  assert.ok(scene2.elements.includes("TEXTURE_REVEAL"));
  assert.ok(scene2.elements.includes("APPLICATION_DEMO"));
});

test("5 - CTA behavior planning forces Radar Smart group invitation", () => {
  const cta = buildCtaBehaviorPlan({ finalLine: currentScenes[4].spokenNarration, objective: "GROUP" });
  assert.equal(cta.version, "CTA_BEHAVIOR_PLAN_V1");
  assert.equal(cta.destination, "RADAR_SMART_GROUP_VIP");
  assert.equal(cta.staticPresenterRisk, "LOW");
  assert.ok(cta.actionBeats.length >= 3);
  assert.match(cta.finalLine, /Radar Smart/);
});

test("6 - social commerce quality gate passes the proposed plan", () => {
  const plan = buildSocialCommerceV2Plan({ campaignId: "campaign-test", offer, currentScenes });
  assert.equal(plan.version, "SOCIAL_COMMERCE_V2");
  assert.equal(plan.socialCommerceQualityGate.status, "PASS");
  assert.equal(plan.socialCommerceQualityGate.gateName, "SOCIAL_COMMERCE_STORYBOARD_GATE");
  assert.equal(plan.socialCommerceQualityGate.canaryBlocked, false);
  assert.equal(plan.socialCommerceQualityGate.checks.length, 11);
  for (const required of [
    "SCROLL_STOP_VISUAL",
    "PRESENTER_LIVELINESS",
    "PRODUCT_EXPERIENCE",
    "SOCIAL_NATIVE_FEEL",
    "SALES_CLARITY",
    "PRICE_IMPACT",
    "CTA_STRENGTH",
    "REPETITION_RISK",
    "GENERIC_AD_RISK",
    "DESIRE_SIGNAL",
    "PRODUCT_CONTEXT_RELEVANCE",
  ]) {
    assert.ok(plan.socialCommerceQualityGate.checks.some((check) => check.name === required), `${required} missing`);
  }
});

test("7 - quality gate blocks weak packshot/static plans", () => {
  const storyboard = buildMicroCutStoryboard({ scenes: currentScenes.slice(0, 2), offer });
  const presenterShotPlan = buildPresenterShotPlan(currentScenes.slice(0, 1));
  const weakProductPlan = {
    version: "PRODUCT_EXPERIENCE_LAYER_V1",
    scenes: [{
      sceneId: "scene-2",
      purpose: "PRODUCT",
      required: true,
      elements: [],
      packshotOnly: true,
      instruction: "packshot only",
      gateStatus: "FAIL",
      reasons: ["packshot only"],
    }],
    packshotDominanceRisk: "HIGH",
    overallStatus: "FAIL",
  };
  const ctaBehaviorPlan = buildCtaBehaviorPlan({});
  const audioEnergyPlan = {
    version: "AUDIO_ENERGY_PLAN_V1",
    narrationEnergy: "FRIEND_SHOWING_A_FIND",
    recommendedVoiceArchetype: "FRIEND_SHOWING_A_FIND",
    deliveryEnergy: "MEDIUM_HIGH",
    speechRhythm: "COMPACT_CONVERSATIONAL",
    hookIntensity: "HIGH",
    ctaIntensity: "HIGH",
    pauseStyle: "MINIMAL",
    backgroundMusicIntent: "music",
    sfxMoments: [],
    sfxOpportunities: [],
    emphasisWords: [],
    transitionsOnBeat: false,
    silenceRisk: "HIGH",
    generationAction: "PLAN_ONLY_NO_AUDIO",
  };
  const gate = runSocialCommerceQualityGate({ storyboard, presenterShotPlan, productExperiencePlan: weakProductPlan, audioEnergyPlan, ctaBehaviorPlan });
  assert.equal(gate.status, "FAIL");
  assert.equal(gate.canaryBlocked, true);
  assert.ok(gate.blockingReasons.some((reason) => reason.includes("PRODUCT_EXPERIENCE")));
});

test("8 - Kokeshi dry-run shape is ready without fetch/provider calls", () => {
  const plan = buildSocialCommerceV2Plan({ campaignId: "660d53b5-d3dc-47a5-b031-4d035bfd97a3", offer, currentScenes });
  assert.equal(plan.campaignId, "660d53b5-d3dc-47a5-b031-4d035bfd97a3");
  assert.equal(plan.voiceCastingSpec.profileId, "FRIEND_SHOWING_A_FIND");
  assert.ok(plan.proposedStoryboardTable.length === 5);
  assert.ok(plan.diagnostics.comparison.some((item) => item.dimension === "experiencia do produto" && item.verdict === "IMPROVED"));
  assert.equal(fetchCalls, 0);
});

test("9 - offer never becomes a dead fake-discount card", () => {
  const plan = buildSocialCommerceV2Plan({ campaignId: "campaign-test", offer, currentScenes });
  const offerScene = plan.microCutStoryboard.scenes.find((scene) => scene.macroPurpose === "OFFER");
  assert.ok(offerScene);
  assert.ok(offerScene.beats.some((beat) => beat.shotType === "GRAPHIC_PRICE_CARD"));
  assert.ok(offerScene.beats.some((beat) => beat.productMode === "PRICE_ANCHOR"));
  assert.ok(!offerScene.beats.some((beat) => /0%\s*off|desconto/i.test(`${beat.overlayFragment ?? ""} ${beat.visualAction}`)));
});

test("10 - dry-run builder is pure: no network and no database writes", () => {
  const writes = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (!["GET", "HEAD"].includes(String(options.method ?? "GET").toUpperCase())) writes.push({ url, method: options.method });
    throw new Error("network blocked");
  };
  const plan = buildSocialCommerceV2Plan({ campaignId: "campaign-test", offer, currentScenes });
  global.fetch = originalFetch;
  assert.equal(plan.socialCommerceQualityGate.status, "PASS");
  assert.deepEqual(writes, []);
});

test("11 - execution preflight blocks full-body-only presenter and missing product demo references", () => {
  const plan = buildSocialCommerceV2Plan({ campaignId: "campaign-test", offer, currentScenes });
  const preflight = buildSocialCommerceExecutionPreflight({
    campaignId: "campaign-test",
    plan,
    presenterReferences: [{
      id: "asset-primary-full-body",
      name: "Garota Radar primary",
      fileUrl: "https://example.com/garota-full-body.png",
      metadata: { referenceType: "PRIMARY", isPrimary: true, shot: "FULL_BODY", expression: "NEUTRAL", pose: "NEUTRAL" },
    }],
    productReferences: {
      packshotReferenceUrl: offer.imageUrl,
      demoReferenceUrls: [],
      handInteractionReferenceUrls: [],
      skincareContextReferenceUrls: [],
      benefitContextReferenceUrls: [],
      textureReferenceUrls: [],
      applicationReferenceUrls: [],
      notes: [],
    },
    voiceCandidate: { voiceId: "qUqXzKPs4b4NRdbYKPx7", model: "eleven_multilingual_v2" },
  });

  assert.equal(preflight.version, "SOCIAL_COMMERCE_EXECUTION_PREFLIGHT_V1");
  assert.equal(preflight.totals.TOTAL_MICROBEATS, 17);
  assert.equal(preflight.result.MICROBEAT_EXECUTION_EFFICIENCY, "PASS");
  assert.equal(preflight.result.PRESENTER_VISUAL_VARIETY_READY, "NO");
  assert.equal(preflight.result.PRODUCT_EXPERIENCE_EXECUTABLE, "NO");
  assert.equal(preflight.result.AUDIO_ENERGY_EXECUTABLE, "YES");
  assert.equal(preflight.result.SOCIAL_COMMERCE_EXECUTION_PREFLIGHT, "FAIL");
  assert.equal(preflight.result.READY_FOR_PAID_SOCIAL_COMMERCE_CANARY, "NO");
  assert.equal(preflight.feasibility.HEYGEN_PRESENTER_FEASIBILITY, "LOW");
  assert.equal(preflight.feasibility.KLING_PRODUCT_EXPERIENCE_FEASIBILITY, "LOW");
  assert.equal(preflight.safety.providersCalled, 0);
  assert.ok(preflight.gaps.PRESENTER_REFERENCE_GAPS.some((gap) => /crop ajuda enquadramento/.test(gap)));
  assert.ok(preflight.gaps.PRODUCT_REFERENCE_GAPS.some((gap) => /HAND_INTERACTION_REFERENCE_READY=NO/.test(gap)));
});

test("12 - execution preflight can pass when presenter and product references are support-grounded", () => {
  const plan = buildSocialCommerceV2Plan({ campaignId: "campaign-test", offer, currentScenes });
  const preflight = buildSocialCommerceExecutionPreflight({
    campaignId: "campaign-test",
    plan,
    presenterReferences: [
      {
        id: "shot-a",
        name: "Garota Radar hook close",
        fileUrl: "https://example.com/shot-a.png",
        metadata: { referenceType: "EXPRESSION", shot: "CLOSE_UP", expression: "EXCITED", pose: "LEANING" },
      },
      {
        id: "shot-b",
        name: "Garota Radar argument",
        fileUrl: "https://example.com/shot-b.png",
        metadata: { referenceType: "HALF_BODY", shot: "HALF_BODY", expression: "CONFIDENT", pose: "PRESENTING" },
      },
      {
        id: "shot-c",
        name: "Garota Radar CTA",
        fileUrl: "https://example.com/shot-c.png",
        metadata: { referenceType: "EXPRESSION", shot: "CLOSE_UP", expression: "INVITING", pose: "INVITING" },
      },
    ],
    productReferences: {
      packshotReferenceUrl: offer.imageUrl,
      demoReferenceUrls: ["https://example.com/demo.png"],
      handInteractionReferenceUrls: ["https://example.com/product-in-hands.png"],
      skincareContextReferenceUrls: ["https://example.com/skincare-context.png"],
      benefitContextReferenceUrls: ["https://example.com/copaiba-benefit-context.png"],
      textureReferenceUrls: [],
      applicationReferenceUrls: [],
      notes: [],
    },
    voiceCandidate: { voiceId: "qUqXzKPs4b4NRdbYKPx7", model: "eleven_multilingual_v2" },
  });

  assert.equal(preflight.result.SOCIAL_COMMERCE_EXECUTION_PREFLIGHT, "PASS");
  assert.equal(preflight.result.READY_FOR_PAID_SOCIAL_COMMERCE_CANARY, "YES");
  assert.equal(preflight.totals.HEYGEN_CALLS_PLANNED, 3);
  assert.equal(preflight.totals.KLING_CALLS_PLANNED, 1);
  assert.equal(preflight.totals.ELEVENLABS_CALLS_PLANNED, 1);
  assert.equal(preflight.estimatedCosts.WAN.numberOfGenerationCalls, 0);
  assert.equal(preflight.productExperienceReadiness.TEXTURE_REFERENCE_READY, "NO");
  assert.equal(preflight.productExperienceReadiness.APPLICATION_REFERENCE_READY, "NO");
  assert.equal(preflight.productExperienceReadiness.REAL_PRODUCT_INTERACTION_READY, "YES");
  assert.ok(preflight.totals.EDITORIAL_ONLY_BEATS + preflight.totals.REUSED_BEATS > preflight.totals.NEW_PROVIDER_ASSETS_REQUIRED);
});

const failed = results.filter((result) => result.status === "FAIL");
for (const result of results) {
  console.log(`${result.status} ${result.name}${result.error ? ` - ${result.error}` : ""}`);
}

console.log(`SOCIAL_COMMERCE_V2_TESTS_PASS=${failed.length === 0 ? "YES" : "NO"}`);
console.log(`FETCH_CALLS=${fetchCalls}`);

if (failed.length > 0) {
  process.exitCode = 1;
}
