// Radar Creative AI - Subject-Aware Capability Routing V1 / Pre-Flight
//
// DRY_RUN 100% - NENHUMA chamada a provider pago (WAN/Kling/HeyGen/
// ElevenLabs/OpenAI/etc), NENHUMA escrita no Supabase. So leitura real
// (campanha/oferta/product intelligence) + um GET na imagem da oferta
// (mesmo uso legitimo ja feito por resolveCampaignSceneReferences/
// product-reference-quality.ts para medir dimensoes reais - nao e um
// provider de geracao).
//
// Reavalia a campanha Kokeshi (660d53b5) DEPOIS da correcao de roteamento
// (Subject-Aware Capability Routing V1) e imprime ANTES x DEPOIS para
// scene-1 (HOOK) e uma tabela com as 5 cenas - prova de que a correcao
// muda scene-1 e NAO muda scene-2..5.

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

// Blocklist (nao allowlist) - permite CDN/imagem real (offers.image_url,
// Supabase Storage) mas BLOQUEIA qualquer host conhecido de provider pago
// de geracao. Mesmo padrao ja usado nos scripts de canary anteriores.
const BLOCKED_PROVIDER_HOST_SUBSTRINGS = [
  "api.magnific.com",
  "api.freepik.com",
  "heygen",
  "elevenlabs",
  "api.openai.com",
  "klingai",
  "runwayml",
  "replicate",
];

const realFetch = global.fetch;
let blockedAttempts = 0;
let imageFetchCount = 0;
global.fetch = async (url, options) => {
  const urlString = String(url);
  if (BLOCKED_PROVIDER_HOST_SUBSTRINGS.some((host) => urlString.includes(host))) {
    blockedAttempts += 1;
    throw new Error(`BLOQUEADO (guardrail de rede): tentativa de chamar host de provider pago "${urlString}".`);
  }
  imageFetchCount += 1;
  return realFetch(url, options);
};

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { buildCommercialDirection } = require("../lib/commercial-director/director.ts");
const { buildCreativeDirectionV2DecisionEngine } = require("../lib/creative-director-v2/decision-engine/decision-engine.ts");
const { buildCampaignPromptPlan } = require("../lib/prompt-builder/prompt-builder.ts");
const { buildScenePrompt } = require("../lib/prompt-builder/scene-prompt.ts");
const { resolveCampaignSceneReferences } = require("../lib/generation-orchestrator/reference-resolver.ts");
const { buildCampaignExecutionPlan } = require("../lib/generation-orchestrator/orchestrator.ts");
const { findDryRunCampaign, buildInputForCampaign } = require("./lib/creative-director-v2-fixture.js");

const CAMPAIGN_ID = "660d53b5-d3dc-47a5-b031-4d035bfd97a3";

function resolvePlatform(value) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("reels") || normalized.includes("instagram")) return "INSTAGRAM_REELS";
  if (normalized.includes("meta") || normalized.includes("ads")) return "META_ADS";
  return "TIKTOK";
}

async function main() {
  const campaignRow = await findDryRunCampaign(supabaseAdmin, CAMPAIGN_ID);
  const { input, offerTitle } = await buildInputForCampaign(supabaseAdmin, campaignRow);

  const { data: fullCampaign, error: campaignError } = await supabaseAdmin
    .from("creative_campaigns")
    .select("id,name,offer_id,aspect_ratio,platform,creative_brief")
    .eq("id", CAMPAIGN_ID)
    .maybeSingle();
  if (campaignError) throw new Error(campaignError.message);

  const existingBrief = fullCampaign.creative_brief || {};
  const v1 = existingBrief.commercialDirection || (await buildCommercialDirection(input));
  const v2Full = existingBrief.commercialDirectionV2 || (await buildCreativeDirectionV2DecisionEngine(input, v1)).result;

  const aspectRatio = fullCampaign.aspect_ratio || "9:16";
  const platform = resolvePlatform(fullCampaign.platform);
  const ctx = { productTitle: offerTitle, category: input.category, platform, aspectRatio, defaultLogoAssetId: null };

  // --- ANTES (comportamento do CANARY real executado em 2026-08-10) -----
  // Reconstrucao FIEL do que scene-prompt.ts fazia antes desta tarefa: os
  // mesmos 4 hints antigos (environment/effects/CTA), SEM productRoleV2/
  // subjectPriorityV2 (esses campos nao existiam no roteamento ainda).
  const beforeScenes = v2Full.underlyingDirection.scenes.map((scene, index) => {
    const blueprint = v2Full.sceneBlueprints[index];
    const oldStyleHints = blueprint
      ? {
          environmentDirection: blueprint.environmentDirection,
          visualEffects: blueprint.effectDirection.effects,
          ctaVisualAction: v2Full.ctaDirection.ctaVisualAction,
          ctaCharacterGesture: v2Full.ctaDirection.ctaCharacterGesture ?? null,
        }
      : undefined;
    return buildScenePrompt(
      scene,
      {
        productTitle: ctx.productTitle,
        category: ctx.category,
        platform: ctx.platform,
        aspectRatio: ctx.aspectRatio,
        visualStyle: v2Full.underlyingDirection.visualStyle,
        pace: v2Full.underlyingDirection.pace,
        offerStrategy: v2Full.underlyingDirection.offerStrategy,
        ctaStrategy: v2Full.underlyingDirection.ctaStrategy,
        defaultLogoAssetId: ctx.defaultLogoAssetId,
      },
      oldStyleHints,
    );
  });
  const beforePromptPlan = { campaignId: CAMPAIGN_ID, commercialDirection: v2Full.underlyingDirection, scenes: beforeScenes };

  // --- DEPOIS (com a correcao Subject-Aware Capability Routing V1) ------
  const afterPromptPlan = buildCampaignPromptPlan(CAMPAIGN_ID, v2Full.underlyingDirection, ctx, {
    sceneBlueprints: v2Full.sceneBlueprints,
    ctaDirection: v2Full.ctaDirection,
  });

  // Referencias reais (1 GET real na imagem da oferta - nunca em provider
  // pago) - mesmas para ANTES/DEPOIS (a URL real nao muda).
  const resolvedRefs = await resolveCampaignSceneReferences(afterPromptPlan, fullCampaign.offer_id, input.category);

  const beforeExecutionPlan = buildCampaignExecutionPlan(CAMPAIGN_ID, "MOCK", beforePromptPlan, resolvedRefs);
  const afterExecutionPlan = buildCampaignExecutionPlan(CAMPAIGN_ID, "MOCK", afterPromptPlan, resolvedRefs);

  const report = {
    generatedAt: new Date().toISOString(),
    campaignId: CAMPAIGN_ID,
    mode: "DRY_RUN_READ_ONLY - nenhuma chamada a provider pago, nenhuma escrita no banco",
    scene1: {
      before: summarizeScene(beforeExecutionPlan.scenes[0], beforePromptPlan.scenes[0]),
      after: summarizeScene(afterExecutionPlan.scenes[0], afterPromptPlan.scenes[0]),
    },
    allScenes: afterExecutionPlan.scenes.map((scenePlan, index) => {
      const beforePlan = beforeExecutionPlan.scenes[index];
      const promptScene = afterPromptPlan.scenes[index];
      const blueprint = v2Full.sceneBlueprints[index];
      return {
        sceneId: scenePlan.sceneId,
        purpose: promptScene.purpose,
        productRoleV2: blueprint?.productRole ?? null,
        subjectPriorityV2: blueprint?.subjectPriority ?? null,
        productFidelityRequirement: scenePlan.productFidelityRequirement,
        capabilityBefore: beforePlan.providerCapability,
        capabilityAfter: scenePlan.providerCapability,
        capabilityChanged: beforePlan.providerCapability !== scenePlan.providerCapability,
        productGenerationStrategy: scenePlan.productGenerationStrategy,
        selectedProvider: scenePlan.selectedProvider,
        referenceRequired: scenePlan.productFidelityRequirement === "REQUIRED" || scenePlan.productFidelityRequirement === "STRICT",
        referenceResolved: Boolean(scenePlan.productReferenceUrl),
        estimatedCreditsBefore: beforePlan.estimatedCost.estimatedCredits,
        estimatedCreditsAfter: scenePlan.estimatedCost.estimatedCredits,
        status: scenePlan.status,
        statusReason: scenePlan.statusReason,
        capabilityFidelityBlocked: scenePlan.capabilityFidelityBlocked,
      };
    }),
    campaignTotals: {
      totalEstimatedCreditsBefore: beforeExecutionPlan.estimatedCost.totalEstimatedCredits,
      totalEstimatedCreditsAfter: afterExecutionPlan.estimatedCost.totalEstimatedCredits,
    },
    recommendedNextCanary: {
      name: "CREATIVE_V2_HOOK_FIDELITY_CANARY",
      note:
        "PREPARADO, NAO EXECUTADO. Mesmo hookStrategyV2/timing/intencao criativa do CANARY A (WAN, " +
        "2026-08-10) - so a execucao tecnica muda (capability/provider com referencia real de produto). " +
        "Requer nova autorizacao explicita antes de qualquer chamada paga.",
      scene: afterExecutionPlan.scenes[0]
        ? {
            sceneId: afterExecutionPlan.scenes[0].sceneId,
            capability: afterExecutionPlan.scenes[0].providerCapability,
            provider: afterExecutionPlan.scenes[0].selectedProvider,
            productGenerationStrategy: afterExecutionPlan.scenes[0].productGenerationStrategy,
            estimatedCredits: afterExecutionPlan.scenes[0].estimatedCost.estimatedCredits,
          }
        : null,
    },
    networkGuardrail: { blockedAttempts, imageFetchCount },
  };

  const outDir = path.join(root, "temp", "creative-v2-hook-fidelity-preflight");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "hook-fidelity-preflight-report.json"), JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nRelatorio salvo em: ${path.relative(root, path.join(outDir, "hook-fidelity-preflight-report.json"))}`);
  console.log(`Banco alterado: NAO (so leitura). blockedAttempts=${blockedAttempts} (esperado 0). imageFetchCount=${imageFetchCount}.`);
}

function summarizeScene(scenePlan, promptScene) {
  return {
    purpose: promptScene.purpose,
    mediaType: scenePlan.mediaType,
    capability: scenePlan.providerCapability,
    selectedProvider: scenePlan.selectedProvider,
    productFidelityRequirement: scenePlan.productFidelityRequirement,
    productGenerationStrategy: scenePlan.productGenerationStrategy,
    productIntegrityRisk: scenePlan.productIntegrityRisk,
    productIntegrityMode: scenePlan.productIntegrityMode,
    estimatedCredits: scenePlan.estimatedCost.estimatedCredits,
    positivePromptExcerpt: scenePlan.positivePrompt.slice(0, 220),
    status: scenePlan.status,
    statusReason: scenePlan.statusReason,
  };
}

main().catch((err) => {
  console.error("Pre-flight falhou:", err.message, err.stack);
  process.exitCode = 1;
});
