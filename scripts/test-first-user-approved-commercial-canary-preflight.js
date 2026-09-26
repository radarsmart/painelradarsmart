// Unit tests for the read-only canary preflight helpers.
// No Supabase calls, no providers, no media.

const assert = require("node:assert/strict");

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

const {
  checkPromptPlanMatchesStoryboard,
} = require("./run-first-user-approved-commercial-canary-preflight.js");

function storyboardFixture() {
  return {
    scenes: [
      {
        sceneId: "scene-1",
        purpose: "HOOK",
        durationSeconds: 3,
        spokenNarration: "Olha esse achado.",
        overlay: "achado de skincare",
        price: null,
        cta: null,
        garotaRadarAppearance: "HOOK",
        estimatedCapability: "CHARACTER_VIDEO",
      },
      {
        sceneId: "scene-2",
        purpose: "PRODUCT_DEMONSTRATION",
        durationSeconds: 3,
        spokenNarration: "Esse e o produto.",
        overlay: null,
        price: null,
        cta: null,
        garotaRadarAppearance: "NONE",
        estimatedCapability: "PRODUCT_VIDEO",
      },
      {
        sceneId: "scene-3",
        purpose: "SALES_ARGUMENT",
        durationSeconds: 3,
        spokenNarration: "Por esse preco, vale experimentar.",
        overlay: "vale conhecer",
        price: null,
        cta: null,
        garotaRadarAppearance: "DEMO",
        estimatedCapability: "CHARACTER_VIDEO",
      },
      {
        sceneId: "scene-4",
        purpose: "OFFER",
        durationSeconds: 3,
        spokenNarration: "E olha o preco: so R$ 13,16.",
        overlay: "R$ 13,16",
        price: "R$ 13,16",
        cta: null,
        garotaRadarAppearance: "NONE",
        estimatedCapability: "PRODUCT_VIDEO",
      },
      {
        sceneId: "scene-5",
        purpose: "CTA",
        durationSeconds: 3,
        spokenNarration: "Acesse a Radar Smart.",
        overlay: "Radar Smart + Grupo VIP",
        price: null,
        cta: "Acesse a Radar Smart e entre no Grupo VIP",
        garotaRadarAppearance: "CTA",
        estimatedCapability: "CHARACTER_VIDEO",
      },
    ],
  };
}

function promptScene(sceneId, purpose, mediaType, voiceoverIntent, overrides = {}) {
  const isCharacter = mediaType === "CHARACTER_VIDEO";
  const isProduct = mediaType === "PRODUCT_VIDEO";
  return {
    sceneId,
    purpose,
    mediaType,
    durationSeconds: 3,
    textOverlay: overrides.textOverlay ?? null,
    voiceoverIntent,
    identityReferenceAssetId: isCharacter ? "asset-primary" : null,
    productFidelityRequirement: isProduct ? "REQUIRED" : "NONE",
    providerHints: {
      requiresProductReference: isProduct,
      requiresIdentityReference: isCharacter,
    },
    overlayInstructions: {
      priceText: null,
      discountText: null,
      ctaText: null,
      ...(overrides.overlayInstructions ?? {}),
    },
  };
}

function promptPlanFixture() {
  return {
    scenes: [
      promptScene("scene-1", "HOOK", "CHARACTER_VIDEO", "Olha esse achado.", {
        textOverlay: "achado de skincare",
      }),
      promptScene("scene-2", "PRODUCT", "PRODUCT_VIDEO", "Esse e o produto."),
      promptScene("scene-3", "BENEFIT", "CHARACTER_VIDEO", "Por esse preco, vale experimentar.", {
        textOverlay: "vale conhecer",
      }),
      promptScene("scene-4", "OFFER", "PRODUCT_VIDEO", "E olha o preco: so R$ 13,16.", {
        textOverlay: "R$ 13,16",
        overlayInstructions: { priceText: "R$ 13,16" },
      }),
      promptScene("scene-5", "CTA", "CHARACTER_VIDEO", "Acesse a Radar Smart.", {
        textOverlay: "Radar Smart + Grupo VIP",
        overlayInstructions: { ctaText: "Acesse a Radar Smart e entre no Grupo VIP" },
      }),
    ],
  };
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

test("prompt plan compativel com storyboard -> true", () => {
  const result = checkPromptPlanMatchesStoryboard(storyboardFixture(), promptPlanFixture());
  assert.equal(result.ok, true);
  assert.deepEqual(result.reasons, []);
});

test("narracao divergente -> false", () => {
  const promptPlan = promptPlanFixture();
  promptPlan.scenes[0].voiceoverIntent = "Texto mudou.";
  const result = checkPromptPlanMatchesStoryboard(storyboardFixture(), promptPlan);
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /scene-1/);
});

test("overlay divergente -> false", () => {
  const promptPlan = promptPlanFixture();
  promptPlan.scenes[3].overlayInstructions.priceText = "R$ 99,90";
  const result = checkPromptPlanMatchesStoryboard(storyboardFixture(), promptPlan);
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /scene-4/);
});

test("cena ausente -> false", () => {
  const promptPlan = promptPlanFixture();
  promptPlan.scenes = promptPlan.scenes.filter((scene) => scene.sceneId !== "scene-3");
  const result = checkPromptPlanMatchesStoryboard(storyboardFixture(), promptPlan);
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /scene-3/);
});

test("undefined/missing data -> fail closed", () => {
  assert.equal(checkPromptPlanMatchesStoryboard(undefined, promptPlanFixture()).ok, false);
  assert.equal(checkPromptPlanMatchesStoryboard(storyboardFixture(), undefined).ok, false);
  assert.equal(checkPromptPlanMatchesStoryboard({}, {}).ok, false);
});

const failed = results.filter((result) => result.status === "FAIL");
for (const result of results) {
  console.log(`${result.status} ${result.name}${result.error ? ` - ${result.error}` : ""}`);
}

console.log(`FIRST_USER_APPROVED_COMMERCIAL_CANARY_PREFLIGHT_TESTS_PASS=${failed.length === 0 ? "YES" : "NO"}`);

if (failed.length > 0) {
  process.exitCode = 1;
}
