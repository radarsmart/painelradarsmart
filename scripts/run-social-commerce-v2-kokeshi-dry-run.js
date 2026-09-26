// Radar Smart - Social Commerce V2 Kokeshi dry-run.
// Read-only Supabase select, no providers, no media generation, no uploads.

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");

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

const { buildSocialCommerceV2Plan } = require("../lib/commercial-video/social-commerce-v2/index.ts");

const CAMPAIGN_ID = process.argv[2] || "660d53b5-d3dc-47a5-b031-4d035bfd97a3";
const OUT_DIR = path.join(root, "temp", "social-commerce-v2-kokeshi-visual-storyboard");
const REPORT_JSON = path.join(OUT_DIR, "report.json");
const REPORT_MD = path.join(OUT_DIR, "report.md");

const network = {
  providerCalls: 0,
  providerAttemptUrls: [],
  remoteWriteAttempts: 0,
  nonProviderNetworkCallCount: 0,
  nonProviderHosts: new Set(),
};

function installReadOnlyNetworkGuard() {
  const realFetch = global.fetch;
  const blockedProviderHostSubstrings = [
    "api.freepik.com",
    "cdn-magnific.freepik.com",
    "api.magnific.com",
    "api.heygen.com",
    "api.elevenlabs.io",
    "api.openai.com",
    "klingai.com",
    "runwayml",
    "replicate",
  ];

  global.fetch = async (input, options = {}) => {
    const url = typeof input === "string" ? input : input?.url ? input.url : String(input);
    const method = String(options.method ?? "GET").toUpperCase();
    const host = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return "";
      }
    })();

    if (blockedProviderHostSubstrings.some((blocked) => url.includes(blocked))) {
      network.providerCalls += 1;
      network.providerAttemptUrls.push(url);
      throw new Error(`BLOQUEADO: provider nao autorizado no dry-run Social Commerce V2: ${url}`);
    }

    if (!["GET", "HEAD"].includes(method)) {
      network.remoteWriteAttempts += 1;
      throw new Error(`BLOQUEADO: dry-run read-only nao permite metodo ${method} para ${url}`);
    }

    network.nonProviderNetworkCallCount += 1;
    if (host) network.nonProviderHosts.add(host);
    return realFetch(input, options);
  };
}

function ensureEnv() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase env ausente: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios para o dry-run real.");
  }
}

function toOfferInput(row) {
  return {
    id: row.id,
    title: row.title ?? "produto",
    category: row.category ?? "beleza",
    price: row.price,
    originalPrice: row.original_price,
    discountPct: row.discount_pct,
    rating: row.rating,
    reviewsCount: row.reviews_count,
    marketplace: row.marketplace,
    imageUrl: row.image_url,
  };
}

function currentScenesFromStoryboard(storyboard) {
  const scenes = Array.isArray(storyboard?.scenes) ? storyboard.scenes : [];
  return scenes.map((scene, index) => ({
    sceneId: scene.sceneId ?? `scene-${index + 1}`,
    sceneNumber: scene.sceneNumber ?? index + 1,
    purpose: scene.purpose ?? "BENEFIT",
    durationSeconds: scene.durationSeconds ?? 3,
    visual: scene.visual ?? scene.visualIntent ?? "",
    productUse: scene.productUse ?? scene.productInteraction ?? "",
    garotaRadarAppearance: scene.garotaRadarAppearance ?? "NONE",
    spokenNarration: scene.spokenNarration ?? scene.narration ?? "",
    overlay: scene.overlay ?? null,
    price: scene.price ?? null,
    cta: scene.cta ?? null,
  }));
}

function tableMarkdown(rows) {
  const header = "| Scene | Purpose | Duration | Beats | Narration | Product Experience | Presenter Shot | Audio Cue |\n|---|---:|---:|---:|---|---|---|---|";
  const body = rows.map((row) =>
    `| ${row.sceneId} | ${row.macroPurpose} | ${row.durationSeconds}s | ${row.beatCount} | ${row.narration || "-"} | ${row.productExperience} | ${row.presenterShot} | ${row.audioCue} |`,
  );
  return [header, ...body].join("\n");
}

function microbeatsMarkdown(storyboard) {
  const header = "| Scene | Beat | Goal | Presenter | Product | Shot | Camera | Action | Overlay | Audio | Duration |\n|---|---:|---|---|---|---|---|---|---|---|---:|";
  const rows = storyboard.scenes.flatMap((scene) =>
    scene.beats.map((beat) =>
      `| ${scene.sceneId} | ${beat.beatIndex} | ${beat.beatGoal} | ${beat.presenterMode} | ${beat.productMode} | ${beat.shotType} | ${beat.cameraDistance}/${beat.cameraMotion} | ${beat.visualAction} | ${beat.overlayIntent ?? "-"} | ${beat.audioEnergyIntent} | ${beat.durationSeconds}s |`,
    ),
  );
  return [header, ...rows].join("\n");
}

function reportMarkdown(report) {
  const gate = report.socialCommerceV2.socialCommerceQualityGate;
  const checks = gate.checks.map((check) => `- ${check.name}: ${check.status} (${check.score}/${check.threshold})`).join("\n");
  const comparison = report.socialCommerceV2.diagnostics.comparison
    .map((item) => `- ${item.dimension}: ${item.verdict}\n  Atual: ${item.current}\n  V2: ${item.socialCommerceV2}`)
    .join("\n");

  return [
    "# Social Commerce V2 - Kokeshi Visual Storyboard Dry-Run",
    "",
    `Campaign: ${report.campaignId}`,
    `Generated at: ${report.generatedAt}`,
    "",
    "## Executive Summary",
    "",
    report.executiveSummary,
    "",
    "## Status",
    "",
    `SOCIAL_COMMERCE_VISUAL_STORYBOARD_VALID=${report.SOCIAL_COMMERCE_VISUAL_STORYBOARD_VALID}`,
    `READY_FOR_SOCIAL_COMMERCE_VISUAL_CANARY=${report.READY_FOR_SOCIAL_COMMERCE_VISUAL_CANARY}`,
    `${gate.gateName}=${gate.status}`,
    "",
    "## Voice Casting",
    "",
    `Recommended profile: ${report.socialCommerceV2.voiceCastingSpec.profileId}`,
    `Style: ${report.socialCommerceV2.voiceCastingSpec.speakingStyle}`,
    `Energy: ${report.socialCommerceV2.voiceCastingSpec.energyLevel}`,
    "",
    "## Proposed Storyboard",
    "",
    tableMarkdown(report.socialCommerceV2.proposedStoryboardTable),
    "",
    "## Microbeats",
    "",
    microbeatsMarkdown(report.socialCommerceV2.microCutStoryboard),
    "",
    "## Garota Radar Shot Plan",
    "",
    ...report.socialCommerceV2.presenterShotPlan.assignments.map((assignment) => `- ${assignment.sceneId}: ${assignment.shotType} (${assignment.reason})`),
    "",
    "## Quality Gate",
    "",
    checks,
    "",
    "## Current vs Social Commerce V2",
    "",
    comparison,
    "",
    "## Product Experience Plan",
    "",
    ...report.socialCommerceV2.productExperiencePlan.scenes.map((scene) => `- ${scene.sceneId}: ${scene.elements.join(", ")}. ${scene.instruction}`),
    "",
    "## Audio Energy Plan",
    "",
    `Voice archetype target: ${report.socialCommerceV2.audioEnergyPlan.recommendedVoiceArchetype}`,
    `Delivery energy: ${report.socialCommerceV2.audioEnergyPlan.deliveryEnergy}`,
    `Speech rhythm: ${report.socialCommerceV2.audioEnergyPlan.speechRhythm}`,
    `Pause style: ${report.socialCommerceV2.audioEnergyPlan.pauseStyle}`,
    `SFX opportunities: ${report.socialCommerceV2.audioEnergyPlan.sfxOpportunities.join(" | ")}`,
    "",
    "## CTA Plan",
    "",
    `Final line: ${report.socialCommerceV2.ctaBehaviorPlan.finalLine}`,
    `Action beats: ${report.socialCommerceV2.ctaBehaviorPlan.actionBeats.join(" | ")}`,
    "",
    "## Cost Estimate",
    "",
    `Estimated paid provider calls for this dry-run: ${report.estimatedCosts.thisDryRunProviderCalls}`,
    `Estimated media generated for this dry-run: ${report.estimatedCosts.thisDryRunMediaGenerated}`,
    "",
    "## Safety",
    "",
    `Provider calls: ${report.providerCalls}`,
    `Media generation: ${report.mediaGeneration}`,
    `Uploads: ${report.uploads}`,
    `Remote write attempts: ${report.remoteWriteAttempts}`,
    `Database writes: ${report.databaseWrites}`,
  ].join("\n");
}

async function main() {
  ensureEnv();
  installReadOnlyNetworkGuard();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: campaign, error: campaignError } = await supabase
    .from("creative_campaigns")
    .select("id,name,offer_id,product_intelligence_id,creative_brief")
    .eq("id", CAMPAIGN_ID)
    .maybeSingle();
  if (campaignError) throw new Error(campaignError.message);
  if (!campaign) throw new Error(`Campanha ${CAMPAIGN_ID} nao encontrada.`);

  const { data: offerRow, error: offerError } = await supabase
    .from("offers")
    .select("id,title,category,price,original_price,discount_pct,rating,reviews_count,marketplace,image_url")
    .eq("id", campaign.offer_id)
    .maybeSingle();
  if (offerError) throw new Error(offerError.message);
  if (!offerRow) throw new Error("Oferta da campanha nao encontrada.");

  const storyboard = campaign.creative_brief?.commercialCreationStoryboard;
  const currentScenes = currentScenesFromStoryboard(storyboard);
  if (currentScenes.length === 0) {
    throw new Error("commercialCreationStoryboard ausente; dry-run nao vai regenerar briefing nem escrever no banco.");
  }

  const socialCommerceV2 = buildSocialCommerceV2Plan({
    campaignId: campaign.id,
    offer: toOfferInput(offerRow),
    currentScenes,
    totalDurationSeconds: currentScenes.reduce((sum, scene) => sum + scene.durationSeconds, 0),
    preferredVoiceProfile: "FRIEND_SHOWING_A_FIND",
  });

  const socialCommerceValid = socialCommerceV2.socialCommerceQualityGate.status !== "FAIL";
  const microbeatCount = socialCommerceV2.microCutStoryboard.scenes.reduce((sum, scene) => sum + scene.beats.length, 0);
  const report = {
    generatedAt: new Date().toISOString(),
    reportName: "SOCIAL_COMMERCE_V2_KOKESHI_VISUAL_STORYBOARD_DRY_RUN",
    mode: "READ_ONLY_DRY_RUN_NO_PROVIDERS_NO_MEDIA",
    executiveSummary:
      "Visual storyboard upgrade only: 5 macro scenes preserved, internal plan expanded into social-native microbeats with Garota Radar acting, reacting, demonstrating, reinforcing price and inviting action. No provider, media, upload or database write was executed.",
    campaignId: campaign.id,
    campaignName: campaign.name,
    offer: toOfferInput(offerRow),
    currentStoryboardFingerprint: storyboard?.storyboardFingerprint ?? null,
    currentStoryboardSceneCount: currentScenes.length,
    macroStructurePreserved: currentScenes.length === 5,
    microbeatCount,
    beforeVsAfter: socialCommerceV2.diagnostics.comparison,
    socialCommerceV2,
    filesCreatedOrAltered: [
      "lib/commercial-video/social-commerce-v2/types.ts",
      "lib/commercial-video/social-commerce-v2/voice-casting.ts",
      "lib/commercial-video/social-commerce-v2/shot-pack.ts",
      "lib/commercial-video/social-commerce-v2/micro-cut-storyboard.ts",
      "lib/commercial-video/social-commerce-v2/product-experience-plan.ts",
      "lib/commercial-video/social-commerce-v2/audio-energy-plan.ts",
      "lib/commercial-video/social-commerce-v2/cta-behavior-plan.ts",
      "lib/commercial-video/social-commerce-v2/quality-gate.ts",
      "lib/commercial-video/social-commerce-v2/builder.ts",
      "lib/commercial-video/social-commerce-v2/index.ts",
      "scripts/test-social-commerce-v2.js",
      "scripts/run-social-commerce-v2-kokeshi-dry-run.js",
      "temp/social-commerce-v2-kokeshi-visual-storyboard/report.json",
      "temp/social-commerce-v2-kokeshi-visual-storyboard/report.md",
    ],
    newContracts: [
      "CreativeEnergyProfile",
      "VoiceCastingSpec",
      "PresenterShotPlan",
      "MicroCutStoryboard",
      "ProductExperiencePlan",
      "AudioEnergyPlan",
      "CtaBehaviorPlan",
      "SocialCommerceQualityGate",
      "SocialCommerceV2Plan",
    ],
    providerCalls: network.providerCalls,
    mediaGeneration: 0,
    uploads: 0,
    databaseWrites: 0,
    remoteWriteAttempts: network.remoteWriteAttempts,
    nonProviderNetworkCallCount: network.nonProviderNetworkCallCount,
    nonProviderHosts: Array.from(network.nonProviderHosts),
    estimatedCosts: {
      thisDryRunProviderCalls: 0,
      thisDryRunMediaGenerated: 0,
      thisDryRunUploads: 0,
      thisDryRunRemoteWrites: 0,
      futureCanaryCosts: "not executed in this task; use existing preflight before any paid provider",
    },
    SOCIAL_COMMERCE_VISUAL_STORYBOARD_VALID: socialCommerceValid ? "YES" : "NO",
    READY_FOR_SOCIAL_COMMERCE_VISUAL_CANARY: socialCommerceValid && !socialCommerceV2.socialCommerceQualityGate.canaryBlocked ? "YES" : "NO",
    SOCIAL_COMMERCE_V2_VALID: socialCommerceValid ? "YES" : "NO",
    READY_FOR_SOCIAL_COMMERCE_CANARY: socialCommerceValid && !socialCommerceV2.socialCommerceQualityGate.canaryBlocked ? "YES" : "NO",
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(REPORT_MD, reportMarkdown(report), "utf8");

  console.log(JSON.stringify({
    SOCIAL_COMMERCE_V2_VALID: report.SOCIAL_COMMERCE_V2_VALID,
    READY_FOR_SOCIAL_COMMERCE_CANARY: report.READY_FOR_SOCIAL_COMMERCE_CANARY,
    SOCIAL_COMMERCE_VISUAL_STORYBOARD_VALID: report.SOCIAL_COMMERCE_VISUAL_STORYBOARD_VALID,
    READY_FOR_SOCIAL_COMMERCE_VISUAL_CANARY: report.READY_FOR_SOCIAL_COMMERCE_VISUAL_CANARY,
    gate: socialCommerceV2.socialCommerceQualityGate.status,
    gateName: socialCommerceV2.socialCommerceQualityGate.gateName,
    voiceProfile: socialCommerceV2.voiceCastingSpec.profileId,
    microbeats: microbeatCount,
    reportJson: path.relative(root, REPORT_JSON),
    reportMd: path.relative(root, REPORT_MD),
    providerCalls: report.providerCalls,
    remoteWriteAttempts: report.remoteWriteAttempts,
  }, null, 2));
}

main().catch((error) => {
  console.error("SOCIAL_COMMERCE_V2_DRY_RUN_FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
