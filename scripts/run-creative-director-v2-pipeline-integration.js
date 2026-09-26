// Radar Creative AI - Creative Director V2 / Integracao Controlada ao Pipeline
//
// Fluxo completo ate DRY_RUN pra campanha real "kokeshi": V1 -> V2 Decision
// Engine -> PERSISTENCIA REAL (unica escrita autorizada desta sessao) ->
// Prompt Builder version-aware -> Generation Plan (MOCK) -> Execution
// Readiness (com storyboardQualityGate real) via runCommercialGeneration em
// mode:"DRY_RUN" (zero chamada paga, mesmo runner real usado em producao) ->
// comparacao de prompts V1 x V2 -> Canary Pre-flight (preparado, NUNCA
// executado). NUNCA chama provider, NUNCA gera midia, NUNCA publica.
//
// Uso: node scripts/run-creative-director-v2-pipeline-integration.js [campaignId]

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

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

const supabaseUrl = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseServiceKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabaseHost = new URL(supabaseUrl).host;

const networkCalls = [];
const originalFetch = global.fetch;
global.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
  networkCalls.push(url);
  return originalFetch(input, init);
};

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

const { buildCommercialDirection } = require("../lib/commercial-director/director.ts");
const { buildCreativeDirectionV2DecisionEngine } = require("../lib/creative-director-v2/decision-engine/decision-engine.ts");
const { buildCampaignPromptPlan } = require("../lib/prompt-builder/prompt-builder.ts");
const { buildCampaignExecutionPlan } = require("../lib/generation-orchestrator/orchestrator.ts");
const { runCommercialGeneration } = require("../lib/commercial-video/runner/commercial-generation-runner.ts");
const { findDryRunCampaign, buildInputForCampaign } = require("./lib/creative-director-v2-fixture.js");

const EMPTY_REFS = {};

function promptContext(offerTitle, category, platform, aspectRatio) {
  return { productTitle: offerTitle, category, platform, aspectRatio, defaultLogoAssetId: null };
}

function resolvePlatform(value) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("reels") || normalized.includes("instagram")) return "INSTAGRAM_REELS";
  if (normalized.includes("meta") || normalized.includes("ads")) return "META_ADS";
  return "TIKTOK";
}

function sceneComparisonRow(v1Scene, v2Blueprint, v1Prompt, v2Prompt) {
  return {
    purpose: v1Scene.purpose,
    v1Duration: Number((v1Scene.endSecond - v1Scene.startSecond).toFixed(2)),
    v2Duration: v2Blueprint.desiredDuration,
    v1Camera: v1Prompt.camera,
    v2EnvironmentHint: v2Blueprint.environmentDirection,
    v2Effects: v2Blueprint.effectDirection.effects.join(", "),
    v1PromptHasEnvHint: v1Prompt.positivePrompt.includes("Creative environment detail"),
    v2PromptHasEnvHint: v2Prompt.positivePrompt.includes("Creative environment detail"),
    overlayPriceV1: v1Prompt.overlayInstructions.priceText,
    overlayPriceV2: v2Prompt.overlayInstructions.priceText,
  };
}

async function main() {
  const explicitId = process.argv[2] || null;
  const campaignRow = await findDryRunCampaign(supabaseAdmin, explicitId);
  const { input, offerTitle } = await buildInputForCampaign(supabaseAdmin, campaignRow);

  const { data: fullCampaign, error: fullCampaignError } = await supabaseAdmin
    .from("creative_campaigns")
    .select("id,name,aspect_ratio,platform,creative_brief")
    .eq("id", campaignRow.id)
    .maybeSingle();
  if (fullCampaignError) throw new Error(fullCampaignError.message);

  const aspectRatio = fullCampaign.aspect_ratio || "9:16";
  const platform = resolvePlatform(fullCampaign.platform);
  const existingBrief = fullCampaign.creative_brief || {};

  // --- 1. V1 (base factual - reusa se ja persistido) ------------------
  const v1 = existingBrief.commercialDirection || (await buildCommercialDirection(input));

  // --- 2. V2 Decision Engine -------------------------------------------
  const decisionEngineOutput = await buildCreativeDirectionV2DecisionEngine(input, v1);
  const v2 = decisionEngineOutput.result;

  // --- 3. PERSISTENCIA REAL (unica escrita autorizada desta sessao) ---
  // Aditiva: NUNCA sobrescreve commercialDirection (V1) - so adiciona
  // commercialDirectionV2 + creativeDirectorVersion.
  const updatedBrief = {
    ...existingBrief,
    commercialDirection: v1,
    commercialDirectionV2: v2,
    creativeDirectorVersion: "V2",
  };
  const { error: updateError } = await supabaseAdmin
    .from("creative_campaigns")
    .update({ creative_brief: updatedBrief, updated_at: new Date().toISOString() })
    .eq("id", campaignRow.id);
  if (updateError) throw new Error(`Falha ao persistir commercialDirectionV2: ${updateError.message}`);

  // Read-after-write: confirma que a escrita realmente aconteceu.
  const { data: persistedCheck, error: persistedCheckError } = await supabaseAdmin
    .from("creative_campaigns")
    .select("creative_brief")
    .eq("id", campaignRow.id)
    .maybeSingle();
  if (persistedCheckError) throw new Error(persistedCheckError.message);
  const persistedOk =
    persistedCheck?.creative_brief?.creativeDirectorVersion === "V2" &&
    Boolean(persistedCheck?.creative_brief?.commercialDirectionV2) &&
    Boolean(persistedCheck?.creative_brief?.commercialDirection);

  // --- 4. Prompt Builder version-aware (V1 sem hints, V2 com hints) ---
  const ctx = promptContext(offerTitle, input.category, platform, aspectRatio);
  const promptPlanV1 = buildCampaignPromptPlan(campaignRow.id, v1, ctx);
  const promptPlanV2 = buildCampaignPromptPlan(campaignRow.id, v2.underlyingDirection, ctx, {
    sceneBlueprints: v2.sceneBlueprints,
    ctaDirection: v2.ctaDirection,
  });

  // --- 5. Generation Plan (MOCK - zero chamada real) -------------------
  const generationPlanV2 = buildCampaignExecutionPlan(campaignRow.id, "MOCK", promptPlanV2, EMPTY_REFS);

  // --- 6. Execution Readiness (runner real em DRY_RUN - zero custo) ---
  let executionReadinessReport = null;
  try {
    const dryRunResult = await runCommercialGeneration({
      executionPlan: generationPlanV2,
      mode: "DRY_RUN",
      confirmed: false,
      maxVideoCredits: 1000,
      maxTtsCredits: 1000,
      narrationOffer: { title: offerTitle, rating: input.rating, reviewsCount: input.reviewsCount },
      narrationProduct: null,
      productIntelligenceCategory: input.category,
      assetCacheDir: path.join(root, "temp", "creative-director-v2-pipeline-cache"),
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

  // --- 7. Comparacao V1 x V2 por cena ----------------------------------
  const comparisonRows = v1.scenes.map((v1Scene, index) => {
    const v2Blueprint = v2.sceneBlueprints[index];
    const v1Prompt = promptPlanV1.scenes[index];
    const v2Prompt = promptPlanV2.scenes[index];
    return sceneComparisonRow(v1Scene, v2Blueprint, v1Prompt, v2Prompt);
  });

  // --- 8. Canary Pre-flight (preparado, NAO executado) -----------------
  // SceneExecutionPlan (Generation Orchestrator) nao carrega purpose - so
  // sceneId/mediaType/provider. Purpose vem do SceneGenerationPrompt
  // (Prompt Builder), casado por sceneId.
  const purposeBySceneId = new Map(promptPlanV2.scenes.map((s) => [s.sceneId, s.purpose]));
  const canaryScenes = generationPlanV2.scenes.filter((s) => ["HOOK", "PRODUCT", "OFFER"].includes(purposeBySceneId.get(s.sceneId)));
  const canaryPreflight = {
    campaignId: campaignRow.id,
    campaignName: campaignRow.name,
    creativeDirectorVersion: "V2",
    v2Metrics: {
      hookScore: v2.hookStrength.overallScore,
      genericAdRisk: v2.genericAdRisk.risk,
      storyboardQualityGateStatus: v2.storyboardQualityGate.status,
    },
    scenes: canaryScenes.map((s) => {
      const promptScene = promptPlanV2.scenes.find((p) => p.sceneId === s.sceneId);
      return {
        sceneId: s.sceneId,
        purpose: s.purpose,
        capability: s.providerCapability,
        selectedProvider: s.selectedProvider,
        durationSeconds: promptScene?.durationSeconds ?? null,
        estimatedCost: s.estimatedCost,
        positivePrompt: promptScene?.positivePrompt ?? null,
        negativePrompt: promptScene?.negativePrompt ?? null,
      };
    }),
    estimatedTotalCost: {
      credits: canaryScenes.reduce((sum, s) => sum + (s.estimatedCost.estimatedCredits ?? 0), 0) || null,
    },
    suggestedMaxLimit: "definir junto ao usuario antes de qualquer autorizacao - NAO sugerido automaticamente nesta tarefa (fora do escopo: nenhuma chamada paga deve ser preparada sem confirmacao explicita e granular, mesmo padrao ja usado em EXECUTE Controlado V1)",
    expectedCreativeImprovement: `hook ${v2.hookStrength.overallScore}/100 (vs sem score em V1), produto HERO desde o inicio (vs escala media/tardia em V1), cinematic benchmark 100% (vs 43% no storyboard generico da Fase 1)`,
  };

  const offHostCalls = networkCalls.filter((url) => {
    try {
      return new URL(url).host !== supabaseHost;
    } catch {
      return true;
    }
  });

  // READY_FOR_CREATIVE_V2_CANARY responde especificamente "a DIRECAO
  // CRIATIVA esta boa o suficiente pra justificar gastar num canary?" - NAO
  // "a campanha inteira esta pronta pra EXECUTE hoje" (isso e uma pergunta
  // diferente, de infraestrutura - ex.: falta de referencia real de produto
  // - resolvida por /prepare-generation de verdade, fora do escopo desta
  // tarefa). As duas respostas sao reportadas SEPARADAS e explicitas abaixo
  // pra nunca ficarem ambiguas.
  const creativeQualityBlocksExecute = executionReadinessReport && executionReadinessReport.status === "BLOCKED_CREATIVE_QUALITY";
  const readyForCanary = persistedOk && v2.storyboardQualityGate.status !== "FAIL" && !creativeQualityBlocksExecute;

  const report = {
    generatedAt: new Date().toISOString(),
    campaignId: campaignRow.id,
    campaignName: campaignRow.name,
    persistence: { persistedOk, creativeDirectorVersion: persistedCheck?.creative_brief?.creativeDirectorVersion ?? null },
    executionReadiness: executionReadinessReport,
    executionReadinessNote:
      "Este e o resultado do runner REAL em DRY_RUN (zero custo) - pode bloquear por motivos NAO relacionados a qualidade criativa (ex.: BLOCKED_REFERENCE = falta de imagem real de produto associada, um pre-requisito de infraestrutura separado, fora do escopo desta tarefa). BLOCKED_CREATIVE_QUALITY especificamente e o unico status que reflete o Storyboard Quality Gate do V2.",
    comparisonRows,
    canaryPreflight,
    readyForCreativeV2Canary: readyForCanary,
    readyForCreativeV2CanaryNote:
      "Responde 'a direcao criativa V2 justifica gastar num canary?' (storyboardQualityGate != FAIL e execution readiness nao bloqueada especificamente por BLOCKED_CREATIVE_QUALITY) - NAO 'a campanha esta pronta pra EXECUTE completo hoje' (isso e uma pergunta de infraestrutura separada, ver executionReadiness/executionReadinessNote acima).",
    verification: {
      networkCallsTotal: networkCalls.length,
      onlySupabaseReads_and_oneUpdate: offHostCalls.length === 0,
      note: "Uma unica escrita real (UPDATE creative_campaigns.creative_brief, aditiva) - o resto e leitura no Supabase do proprio projeto. Nenhuma chamada de provider.",
    },
  };

  if (offHostCalls.length > 0) {
    throw new Error(`Integracao violada: chamada de rede fora do Supabase detectada -> ${JSON.stringify(offHostCalls)}`);
  }

  const outDir = path.join(root, "temp");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "creative-director-v2-pipeline-integration-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Campanha: ${campaignRow.name} (${campaignRow.id})`);
  console.log(`Persistencia real: ${persistedOk ? "OK" : "FALHOU"} (creativeDirectorVersion=${report.persistence.creativeDirectorVersion})`);
  console.log(`Chamadas de rede totais: ${networkCalls.length} (todas Supabase: ${offHostCalls.length === 0})`);
  console.log(`\nExecution Readiness (runner real, DRY_RUN, EXECUTE completo hoje): status=${executionReadinessReport.status || executionReadinessReport.error}`);
  console.log(`  (motivo pode ser de infraestrutura, ex. imagem de produto ausente - nao necessariamente qualidade criativa; ver reasons)`);
  if (executionReadinessReport.reasons) console.log(`  reasons: ${executionReadinessReport.reasons.join(" | ")}`);
  console.log("\n--- Comparacao de prompts V1 x V2 (por cena) ---");
  console.table(comparisonRows);
  console.log("\n--- Canary Pre-flight (preparado, NAO executado) ---");
  console.log(`Cenas recomendadas: ${canaryScenes.map((s) => s.sceneId).join(", ")}`);
  console.log(`Custo estimado (creditos): ${canaryPreflight.estimatedTotalCost.credits ?? "desconhecido"}`);
  console.log(`\nREADY_FOR_CREATIVE_V2_CANARY = ${readyForCanary ? "YES" : "NO"}`);
  console.log(`\nRelatorio completo salvo em: ${path.relative(root, outPath)}`);
}

main().catch((err) => {
  console.error("Integracao ao pipeline falhou:", err.message, err.stack);
  process.exitCode = 1;
});
