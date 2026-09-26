// Radar Creative AI - Creative Director V2 / Canary Pre-flight (real reference resolution)
//
// SOMENTE LEITURA - resolve a referencia REAL do produto (mesmo fluxo de
// /prepare-generation) e reavalia o GenerationPlan/Execution Readiness pra
// campanha kokeshi, SEM persistir nada (a rota real grava
// creative_brief.generationPlan - esta tarefa PARA antes dessa escrita e so
// reporta o que seria gravado, por pedido explicito do usuario). NUNCA
// chama provider pago - a unica chamada de rede fora do Supabase e um GET
// na imagem publica do produto (offers.image_url, CDN do marketplace), pra
// medir dimensoes reais - interceptado e logado abaixo, com bloqueio
// explicito de qualquer host de provider conhecido.
//
// Uso: node scripts/run-creative-director-v2-canary-preflight.js [campaignId]

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

// Blocklist de hosts de PROVIDER reais (extraidos dos adapters em
// lib/generation-orchestrator/adapters/** e lib/ugc/audio.ts) - qualquer
// chamada pra um destes e um erro de programacao nesta tarefa (deveria ser
// impossivel, ja que nunca importamos nenhum adapter/executor real), mas
// interceptamos e lancamos MESMO ASSIM como guardrail defensivo. Chamadas
// pra qualquer OUTRO host (Supabase, CDN de imagem do marketplace) sao
// permitidas e logadas para o relatorio.
const BLOCKED_PROVIDER_HOST_SUBSTRINGS = ["heygen", "magnific", "freepik", "elevenlabs", "openai", "klingai", "runwayml", "replicate"];

const networkCalls = [];
const originalFetch = global.fetch;
global.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
  const lower = url.toLowerCase();
  const blockedMatch = BLOCKED_PROVIDER_HOST_SUBSTRINGS.find((needle) => lower.includes(needle));
  if (blockedMatch) {
    throw new Error(`BLOQUEADO: tentativa de chamada a host de provider ("${blockedMatch}") - ${url}`);
  }
  networkCalls.push({ url, method: (init && init.method) || "GET" });
  return originalFetch(input, init);
};

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

const supabaseUrl = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseServiceKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabaseHost = new URL(supabaseUrl).host;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

const { buildCommercialDirection } = require("../lib/commercial-director/director.ts");
const { buildCreativeDirectionV2DecisionEngine } = require("../lib/creative-director-v2/decision-engine/decision-engine.ts");
const { buildCampaignPromptPlan } = require("../lib/prompt-builder/prompt-builder.ts");
const { buildCampaignExecutionPlan } = require("../lib/generation-orchestrator/orchestrator.ts");
const { resolveCampaignSceneReferences } = require("../lib/generation-orchestrator/reference-resolver.ts");
const { runCommercialGeneration } = require("../lib/commercial-video/runner/commercial-generation-runner.ts");
const { listJobs } = require("../lib/commercial-video/jobs/commercial-job-repository.ts");
const { findDryRunCampaign, buildInputForCampaign } = require("./lib/creative-director-v2-fixture.js");

function resolvePlatform(value) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("reels") || normalized.includes("instagram")) return "INSTAGRAM_REELS";
  if (normalized.includes("meta") || normalized.includes("ads")) return "META_ADS";
  return "TIKTOK";
}

function formatCost(estimatedCost) {
  if (estimatedCost.costUnit === "CREDITS") return `${estimatedCost.estimatedCredits} creditos`;
  if (estimatedCost.costUnit === "USD") return `US$ ${(estimatedCost.estimatedUsdCostCents / 100).toFixed(2)}`;
  if (estimatedCost.costUnit === "FREE") return "gratis (mock)";
  return "UNKNOWN (custo nao pode ser calculado - nunca assumido zero)";
}

function sumByCurrency(scenes) {
  const totals = { credits: 0, hasCredits: false, usdCents: 0, hasUsd: false, unknown: [] };
  for (const s of scenes) {
    const c = s.estimatedCost;
    if (c.costUnit === "CREDITS" && c.estimatedCredits !== null) {
      totals.credits += c.estimatedCredits;
      totals.hasCredits = true;
    } else if (c.costUnit === "USD" && c.estimatedUsdCostCents !== null) {
      totals.usdCents += c.estimatedUsdCostCents;
      totals.hasUsd = true;
    } else if (c.costUnit === "UNKNOWN") {
      totals.unknown.push(s.sceneId);
    }
  }
  return {
    credits: totals.hasCredits ? totals.credits : null,
    usd: totals.hasUsd ? `US$ ${(totals.usdCents / 100).toFixed(2)}` : null,
    unknownScenes: totals.unknown,
  };
}

async function main() {
  const explicitId = process.argv[2] || null;
  const campaignRow = await findDryRunCampaign(supabaseAdmin, explicitId);
  const { input, offerTitle } = await buildInputForCampaign(supabaseAdmin, campaignRow);

  const { data: fullCampaign, error: fullCampaignError } = await supabaseAdmin
    .from("creative_campaigns")
    .select("id,name,offer_id,aspect_ratio,platform,creative_brief")
    .eq("id", campaignRow.id)
    .maybeSingle();
  if (fullCampaignError) throw new Error(fullCampaignError.message);

  const { data: offerRow, error: offerError } = await supabaseAdmin
    .from("offers")
    .select("id,title,image_url,marketplace,price,original_price,discount_pct,product_url,affiliate_url")
    .eq("id", fullCampaign.offer_id)
    .maybeSingle();
  if (offerError) throw new Error(offerError.message);

  // Mesmos dados reais que commercial-jobs/route.ts#loadNarrationInputs usa
  // - key_benefits reais do Product Intelligence, nunca null por atalho
  // (null faria o Narration Script Builder tratar como "sem beneficio
  // conhecido", o que pode bloquear candidatos de copy sem motivo real).
  const { data: piRow } = await supabaseAdmin
    .from("product_intelligence")
    .select("key_benefits")
    .eq("offer_id", fullCampaign.offer_id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const narrationProduct = piRow ? { keyBenefits: piRow.key_benefits || [] } : null;

  const aspectRatio = fullCampaign.aspect_ratio || "9:16";
  const platform = resolvePlatform(fullCampaign.platform);
  const existingBrief = fullCampaign.creative_brief || {};

  // --- 1. Produto real (so leitura, nada inferido) ---------------------
  const productAudit = {
    campaignId: campaignRow.id,
    offerId: fullCampaign.offer_id,
    productTitle: offerRow.title,
    marketplace: offerRow.marketplace,
    price: offerRow.price,
    originalPrice: offerRow.original_price,
    discountPct: offerRow.discount_pct,
    productUrl: offerRow.product_url,
    imageUrl: offerRow.image_url,
  };

  // --- 2/3. V1 + V2 (reusa o que ja esta persistido - NAO redecide nada) ---
  const v1 = existingBrief.commercialDirection || (await buildCommercialDirection(input));
  const decisionEngineOutput = existingBrief.commercialDirectionV2
    ? { result: existingBrief.commercialDirectionV2, hookStrategyV2: null, hookAttempts: [], hookBelowTarget: false }
    : await buildCreativeDirectionV2DecisionEngine(input, v1);
  const v2 = decisionEngineOutput.result;

  const ctx = { productTitle: offerTitle, category: input.category, platform, aspectRatio, defaultLogoAssetId: null };
  const promptPlanV1 = buildCampaignPromptPlan(campaignRow.id, v1, ctx);
  const promptPlanV2 = buildCampaignPromptPlan(campaignRow.id, v2.underlyingDirection, ctx, {
    sceneBlueprints: v2.sceneBlueprints,
    ctaDirection: v2.ctaDirection,
  });

  // --- 4. Product Reference Resolution REAL (mesmo fluxo de /prepare-generation) ---
  const resolvedRefsV2 = await resolveCampaignSceneReferences(promptPlanV2, fullCampaign.offer_id, input.category);
  const resolvedRefsV1 = await resolveCampaignSceneReferences(promptPlanV1, fullCampaign.offer_id, input.category);

  const referenceReport = promptPlanV2.scenes.map((scene) => {
    const refs = resolvedRefsV2[scene.sceneId];
    return {
      sceneId: scene.sceneId,
      purpose: scene.purpose,
      productReferenceUrl: refs.productReferenceUrl,
      productReferenceQuality: refs.productReferenceQuality,
      identityReferenceUrl: refs.identityReferenceUrl,
      supportReferenceAssetId: refs.supportReferenceAssetId,
      supportReferenceUrl: refs.supportReferenceUrl,
      supportReferenceError: refs.supportReferenceError,
    };
  });

  const anyMissingProductRef = referenceReport.some((r) => r.productReferenceUrl === null);
  const referenceStatus = anyMissingProductRef ? "BLOCKED" : "READY";

  // --- 5. Generation Plan real (MOCK, sem persistir) -------------------
  const generationPlanV2 = buildCampaignExecutionPlan(campaignRow.id, "MOCK", promptPlanV2, resolvedRefsV2);
  const generationPlanV1 = buildCampaignExecutionPlan(campaignRow.id, "MOCK", promptPlanV1, resolvedRefsV1);

  const generationPlanReport = generationPlanV2.scenes.map((s) => {
    const promptScene = promptPlanV2.scenes.find((p) => p.sceneId === s.sceneId);
    return {
      sceneId: s.sceneId,
      purpose: promptScene?.purpose,
      capability: s.providerCapability,
      productGenerationStrategy: s.productGenerationStrategy,
      provider: s.selectedProvider,
      visualDurationSeconds: promptScene?.durationSeconds ?? null,
      estimatedCost: s.estimatedCost,
      estimatedCostFormatted: formatCost(s.estimatedCost),
      statusReason: s.statusReason,
    };
  });

  // --- 6. Execution Readiness real (runner real, DRY_RUN, zero custo) --
  let executionReadinessReport = null;
  try {
    const dryRunResult = await runCommercialGeneration({
      executionPlan: generationPlanV2,
      mode: "DRY_RUN",
      confirmed: false,
      maxVideoCredits: 5000,
      maxTtsCredits: 1000,
      narrationOffer: { title: offerTitle, rating: input.rating, reviewsCount: input.reviewsCount },
      narrationProduct,
      productIntelligenceCategory: input.category,
      assetCacheDir: path.join(root, "temp", "creative-director-v2-canary-preflight-cache"),
      creativeQualityGateStatus: v2.storyboardQualityGate.status,
    });
    executionReadinessReport = {
      status: dryRunResult.executionReadiness.status,
      canProduceFinalCommercial: dryRunResult.executionReadiness.canProduceFinalCommercial,
      reasons: dryRunResult.executionReadiness.reasons,
      scenes: dryRunResult.executionReadiness.scenes,
    };
  } catch (err) {
    executionReadinessReport = { error: err.message };
  }

  const executionReadinessStatus =
    executionReadinessReport && !executionReadinessReport.error && executionReadinessReport.canProduceFinalCommercial ? "READY" : "BLOCKED";

  // --- 7. V1 x V2 por cena candidata a canary ---------------------------
  const purposeBySceneId = new Map(promptPlanV2.scenes.map((s) => [s.sceneId, s.purpose]));
  const comparisonBySceneId = v1.scenes.map((v1Scene, index) => {
    const v2Blueprint = v2.sceneBlueprints[index];
    const v1Prompt = promptPlanV1.scenes[index];
    const v2Prompt = promptPlanV2.scenes[index];
    return {
      sceneId: v1Scene.id,
      purpose: v1Scene.purpose,
      v1: { hookStrategy: v1.hookStrategy, camera: v1Scene.camera, motion: v1Scene.motion, environment: v1Prompt.environment, productRole: null, subjectPriority: null, prompt: v1Prompt.positivePrompt },
      v2: {
        hookStrategyV2: decisionEngineOutput.hookStrategyV2,
        camera: v2.underlyingDirection.scenes[index].camera,
        motion: v2.underlyingDirection.scenes[index].motion,
        environmentDirection: v2Blueprint.environmentDirection,
        productScale: v2Blueprint.productRole !== "NONE" ? v2.productScaleTarget : "n/a",
        productRole: v2Blueprint.productRole,
        subjectPriority: v2Blueprint.subjectPriority,
        prompt: v2Prompt.positivePrompt,
      },
    };
  });

  // --- 8. Provider selection (independente do V2 - so purpose->capability->provider) ---
  const providerSelectionReport = generationPlanV2.scenes.map((s) => ({
    sceneId: s.sceneId,
    capability: s.providerCapability,
    selectedProvider: s.selectedProvider,
    fallbackProviders: s.fallbackProviders,
  }));

  // --- 10. Reuse (jobs EXECUTE anteriores da campanha) ------------------
  const previousExecuteJobs = await listJobs({ campaignId: campaignRow.id, mode: "EXECUTE", limit: 5 });
  const reuseReport =
    previousExecuteJobs.length === 0
      ? { status: "NO_PREVIOUS_EXECUTE_JOB", candidates: [], note: "Nenhum job EXECUTE anterior desta campanha - nada para reusar, toda cena elegivel seria GENERATE." }
      : { status: "PREVIOUS_JOBS_FOUND", jobIds: previousExecuteJobs.map((j) => j.id), note: "Ver runner_result de cada job pra fingerprint - nao expandido nesta auditoria (fora do escopo: nao executar nada)." };

  // --- 11. Opcoes de canary (minimo x estendido) ------------------------
  const hookScene = generationPlanReport.find((s) => s.purpose === "HOOK");
  const productOrOfferScene = generationPlanReport.find((s) => s.purpose === "PRODUCT") || generationPlanReport.find((s) => s.purpose === "OFFER");

  const minimumCanaryScenes = [hookScene].filter(Boolean);
  const extendedCanaryScenes = [hookScene, productOrOfferScene].filter(Boolean);

  const minimumCanaryCost = sumByCurrency(minimumCanaryScenes.map((s) => ({ sceneId: s.sceneId, estimatedCost: s.estimatedCost })));
  const extendedCanaryCost = sumByCurrency(extendedCanaryScenes.map((s) => ({ sceneId: s.sceneId, estimatedCost: s.estimatedCost })));

  const blockedInCandidateSet = (scenes) => scenes.some((s) => s.estimatedCost.costUnit === "UNKNOWN" || (s.provider && s.provider === "mock"));

  const report = {
    generatedAt: new Date().toISOString(),
    campaignId: campaignRow.id,
    campaignName: fullCampaign.name,
    productAudit,
    referenceReport,
    referenceStatus,
    generationPlanReport,
    comparisonBySceneId,
    providerSelectionReport,
    reuseReport,
    canaryOptions: {
      optionA_minimum: {
        scenes: minimumCanaryScenes,
        cost: minimumCanaryCost,
        note: "Menor canary util: so HOOK - a cena onde a maior mudanca criativa (novo hook, produto HERO desde t=0) e mais visivel.",
        wouldBeBlocked: blockedInCandidateSet(minimumCanaryScenes),
      },
      optionB_extended: {
        scenes: extendedCanaryScenes,
        cost: extendedCanaryCost,
        note: "HOOK + PRODUCT/OFFER - adiciona validacao de fidelidade do produto real (embalagem/marca) alem do hook.",
        wouldBeBlocked: blockedInCandidateSet(extendedCanaryScenes),
      },
    },
    executionReadiness: executionReadinessReport,
    referenceResolutionStatus: referenceStatus,
    executionReadinessStatus,
    readyForCreativeV2CanaryExecute: referenceStatus === "READY" && executionReadinessStatus === "READY",
    verification: {
      networkCallsTotal: networkCalls.length,
      networkCallsByHost: networkCalls.reduce((acc, c) => {
        try {
          const h = new URL(c.url).host;
          acc[h] = (acc[h] || 0) + 1;
        } catch {
          acc.invalid = (acc.invalid || 0) + 1;
        }
        return acc;
      }, {}),
      onlySupabaseAndPublicImageCdn: networkCalls.every((c) => {
        try {
          const h = new URL(c.url).host;
          return h === supabaseHost || h === new URL(offerRow.image_url || "https://none").host;
        } catch {
          return false;
        }
      }),
      note: "Nenhuma chamada de provider pago (bloqueado ativamente, ver BLOCKED_PROVIDER_HOST_SUBSTRINGS). Nenhuma escrita no banco - so leitura, incluindo o GET na imagem publica do produto pra medir dimensoes reais.",
    },
    databaseWrites: "NENHUMA - esta tarefa e somente leitura por pedido explicito. /prepare-generation real persistiria creative_brief.generationPlan (o objeto em generationPlanReport acima) - essa escrita NAO foi feita.",
  };

  const outDir = path.join(root, "temp");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "creative-director-v2-canary-preflight-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Campanha: ${fullCampaign.name} (${campaignRow.id})`);
  console.log(`Produto: "${productAudit.productTitle}" (${productAudit.marketplace}), preco R$ ${productAudit.price}, imagem: ${productAudit.imageUrl ? "presente" : "AUSENTE"}`);
  console.log(`\nChamadas de rede: ${networkCalls.length} -> ${JSON.stringify(report.verification.networkCallsByHost)}`);
  console.log(`Somente Supabase + CDN publica da imagem do produto: ${report.verification.onlySupabaseAndPublicImageCdn}`);

  console.log("\n--- Referencia de produto (real) ---");
  for (const r of referenceReport) {
    console.log(`  ${r.sceneId} (${r.purpose}): productRef=${r.productReferenceUrl ? "OK" : "AUSENTE"}${r.productReferenceQuality ? `, resolutionRisk=${r.productReferenceQuality.resolutionRisk}, fidelityRisk=${r.productReferenceQuality.fidelityRisk}, ${r.productReferenceQuality.width}x${r.productReferenceQuality.height}` : ""}${r.supportReferenceError ? `, supportError=${r.supportReferenceError}` : ""}`);
  }
  console.log(`CREATIVE_V2_CANARY_REFERENCE_STATUS = ${referenceStatus}`);

  console.log("\n--- Generation Plan (real, MOCK, nao persistido) ---");
  console.table(generationPlanReport.map((s) => ({ sceneId: s.sceneId, purpose: s.purpose, capability: s.capability, strategy: s.productGenerationStrategy, provider: s.provider, cost: s.estimatedCostFormatted })));

  console.log(`\nExecution Readiness (runner real, DRY_RUN): status=${executionReadinessReport.status || executionReadinessReport.error}`);
  if (executionReadinessReport.reasons) console.log(`  reasons: ${executionReadinessReport.reasons.join(" | ")}`);
  console.log(`CREATIVE_V2_CANARY_EXECUTION_READINESS = ${executionReadinessStatus}`);

  console.log("\n--- Reuse ---");
  console.log(`  ${reuseReport.status}: ${reuseReport.note}`);

  console.log("\n--- OPTION A (minimum canary) ---");
  console.log(`  cenas: ${minimumCanaryScenes.map((s) => `${s.sceneId}(${s.purpose})`).join(", ") || "nenhuma"}`);
  console.log(`  custo: creditos=${minimumCanaryCost.credits ?? "n/a"}, USD=${minimumCanaryCost.usd ?? "n/a"}${minimumCanaryCost.unknownScenes.length ? `, UNKNOWN em: ${minimumCanaryCost.unknownScenes.join(",")}` : ""}`);

  console.log("\n--- OPTION B (extended canary) ---");
  console.log(`  cenas: ${extendedCanaryScenes.map((s) => `${s.sceneId}(${s.purpose})`).join(", ") || "nenhuma"}`);
  console.log(`  custo: creditos=${extendedCanaryCost.credits ?? "n/a"}, USD=${extendedCanaryCost.usd ?? "n/a"}${extendedCanaryCost.unknownScenes.length ? `, UNKNOWN em: ${extendedCanaryCost.unknownScenes.join(",")}` : ""}`);

  console.log(`\nREADY_FOR_CREATIVE_V2_CANARY_EXECUTE = ${report.readyForCreativeV2CanaryExecute ? "YES" : "NO"}`);
  console.log(`Banco alterado: NAO (${report.databaseWrites})`);
  console.log(`\nRelatorio completo salvo em: ${path.relative(root, outPath)}`);
}

main().catch((err) => {
  console.error("Canary pre-flight falhou:", err.message, err.stack);
  process.exitCode = 1;
});
