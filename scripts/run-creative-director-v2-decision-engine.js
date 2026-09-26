// Radar Creative AI - Creative Director V2 / Decision Engine (Fase 2) - DRY-RUN real
//
// Roda V1, V2-Fase1 (metadata-only, ja existente) e V2-Decision-Engine (novo,
// realmente redecide o storyboard) para a MESMA campanha real, so leitura.
// NUNCA chama provider, NUNCA integra a EXECUTE, NUNCA escreve em
// creative_campaigns/commercial_generation_jobs/Storage. Mesmo padrao de
// interceptacao de fetch dos scripts anteriores desta sessao, pra PROVAR
// (nao so documentar) que so o host do Supabase foi chamado.
//
// Uso: node scripts/run-creative-director-v2-decision-engine.js [campaignId]

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
const { buildCommercialCreativeDirectionV2 } = require("../lib/creative-director-v2/creative-director-v2.ts");
const { buildCreativeDirectionV2DecisionEngine } = require("../lib/creative-director-v2/decision-engine/decision-engine.ts");
const { buildStoryboardPreview, buildStoryboardPreviewMarkdown } = require("../lib/creative-director-v2/validation/storyboard-preview.ts");
const { runCreativeValidation } = require("../lib/creative-director-v2/validation/validation-orchestrator.ts");
const { findDryRunCampaign, buildInputForCampaign } = require("./lib/creative-director-v2-fixture.js");

function scenesTable(direction) {
  return direction.scenes.map((s) => ({
    id: s.id,
    purpose: s.purpose,
    duration: Number((s.endSecond - s.startSecond).toFixed(2)),
    camera: s.camera,
    motion: s.motion,
    lighting: s.lighting,
    hasCharacter: s.characterDirection !== null,
  }));
}

async function main() {
  const explicitId = process.argv[2] || null;
  const campaignRow = await findDryRunCampaign(supabaseAdmin, explicitId);
  const { input, offerTitle } = await buildInputForCampaign(supabaseAdmin, campaignRow);

  const v1 = await buildCommercialDirection(input);
  const v2Old = await buildCommercialCreativeDirectionV2(input);
  const decisionEngineOutput = await buildCreativeDirectionV2DecisionEngine(input, v1);
  const v2New = decisionEngineOutput.result;

  const validationOld = runCreativeValidation(v1, v2Old);
  const validationNew = runCreativeValidation(v1, v2New);

  // Criterio EXPLICITO desta tarefa (item 18 do pedido) - mais rigoroso que
  // a regra interna de runCreativeValidation() (herdada da Fase 1, que so
  // exige cinematic>=70 + outros). Reportado separado e nao mascarado -
  // este e o veredito OFICIAL desta rodada.
  const taskReadyCriteria = {
    hookScore: { value: validationNew.hookScore, min: 75, met: validationNew.hookScore >= 75 },
    productFirstScore: { value: validationNew.productFirstScore, min: 75, met: validationNew.productFirstScore >= 75 },
    creativeDensityScore: { value: validationNew.creativeDensityScore, min: 75, met: validationNew.creativeDensityScore >= 75 },
    commercialArcScore: { value: validationNew.commercialArcScore, min: 80, met: validationNew.commercialArcScore >= 80 },
    sceneRedundancyRisk: { value: validationNew.sceneRedundancyRisk, expected: "LOW", met: validationNew.sceneRedundancyRisk === "LOW" },
    genericAdRisk: { value: validationNew.genericAdRisk, expected: "LOW", met: validationNew.genericAdRisk === "LOW" },
    cinematicBenchmarkScore: { value: validationNew.cinematicBenchmarkScore, min: 75, met: validationNew.cinematicBenchmarkScore >= 75 },
  };
  const taskReadyForV2PipelineIntegration = Object.values(taskReadyCriteria).every((c) => c.met);

  const storyboardPreview = buildStoryboardPreview(v2New);
  const storyboardPreviewMarkdown = buildStoryboardPreviewMarkdown(storyboardPreview);

  const offHostCalls = networkCalls.filter((url) => {
    try {
      return new URL(url).host !== supabaseHost;
    } catch {
      return true;
    }
  });
  if (offHostCalls.length > 0) {
    throw new Error(`Decision Engine DRY-RUN violado: chamada de rede fora do Supabase detectada -> ${JSON.stringify(offHostCalls)}`);
  }

  const outDir = path.join(root, "temp");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const storyboardMdPath = path.join(outDir, "creative-director-v2-decision-engine-storyboard.md");
  const storyboardJsonPath = path.join(outDir, "creative-director-v2-decision-engine.json");
  const validationJsonPath = path.join(outDir, "creative-director-v2-decision-engine-validation.json");

  fs.writeFileSync(storyboardMdPath, storyboardPreviewMarkdown, "utf8");
  fs.writeFileSync(
    storyboardJsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        campaignId: campaignRow.id,
        campaignName: campaignRow.name,
        offerTitle,
        hookStrategyV2: decisionEngineOutput.hookStrategyV2,
        hookAttempts: decisionEngineOutput.hookAttempts,
        hookBelowTarget: decisionEngineOutput.hookBelowTarget,
        redundancyPassesApplied: decisionEngineOutput.redundancyPassesApplied,
        redundancyRiskBeforeReduction: decisionEngineOutput.redundancyRiskBeforeReduction,
        redundancyRiskAfterReduction: decisionEngineOutput.redundancyRiskAfterReduction,
        v1Scenes: scenesTable(v1),
        v2NewScenes: scenesTable(v2New.underlyingDirection),
        storyboardPreview,
        v2New,
      },
      null,
      2,
    ),
    "utf8",
  );

  const validationReport = {
    generatedAt: new Date().toISOString(),
    campaignId: campaignRow.id,
    campaignName: campaignRow.name,
    offerTitle,
    v2Old: validationOld,
    v2New: validationNew,
    comparison: {
      cinematicBenchmarkScore: { before: validationOld.cinematicBenchmarkScore, after: validationNew.cinematicBenchmarkScore },
      hookScore: { before: validationOld.hookScore, after: validationNew.hookScore },
      productFirstScore: { before: validationOld.productFirstScore, after: validationNew.productFirstScore },
      creativeDensityScore: { before: validationOld.creativeDensityScore, after: validationNew.creativeDensityScore },
      commercialArcScore: { before: validationOld.commercialArcScore, after: validationNew.commercialArcScore },
      sceneRedundancyRisk: { before: validationOld.sceneRedundancyRisk, after: validationNew.sceneRedundancyRisk },
      genericAdRisk: { before: validationOld.genericAdRisk, after: validationNew.genericAdRisk },
      readyForV2PipelineIntegration: { before: validationOld.readyForV2PipelineIntegration, after: validationNew.readyForV2PipelineIntegration },
    },
    taskReadyCriteria,
    taskReadyForV2PipelineIntegration,
    verification: {
      networkCallsTotal: networkCalls.length,
      onlySupabaseReads: offHostCalls.length === 0,
      note: "Nenhuma chamada de provider, nenhuma escrita, nenhuma integracao com EXECUTE - so leitura no Supabase do proprio projeto.",
    },
  };
  fs.writeFileSync(validationJsonPath, JSON.stringify(validationReport, null, 2), "utf8");

  console.log(`Campanha: ${campaignRow.name} (${campaignRow.id}) - oferta "${offerTitle}"`);
  console.log(`Chamadas de rede totais: ${networkCalls.length} (todas para ${supabaseHost}: ${offHostCalls.length === 0})`);

  console.log(`\nHook V2 (Fase 1, so mede): "${v2Old.hookStrategy}" - score ${v2Old.hookStrength.overallScore}/100`);
  console.log(`Hook V2 Decision Engine (redecide): "${decisionEngineOutput.hookStrategyV2}" -> V1-equiv "${v2New.hookStrategy}" - score ${v2New.hookStrength.overallScore}/100`);
  console.log(`  tentativas: ${decisionEngineOutput.hookAttempts.map((a) => `${a.strategyV2}=${a.score}`).join(", ")}`);
  console.log(`  abaixo do alvo (75)? ${decisionEngineOutput.hookBelowTarget}`);

  console.log(`\nRedundancia: antes=${decisionEngineOutput.redundancyRiskBeforeReduction}, depois=${decisionEngineOutput.redundancyRiskAfterReduction} (${decisionEngineOutput.redundancyPassesApplied} passe(s) aplicado(s))`);

  console.log("\n--- Comparacao V1 x V2-Fase1(so mede) x V2-DecisionEngine(redecide) ---");
  console.log(`Duracao total: V1=${v1.durationSeconds}s | V2-DecisionEngine=${v2New.underlyingDirection.durationSeconds}s`);
  console.log("\nCENAS V1:");
  console.table(scenesTable(v1));
  console.log("\nCENAS V2-DecisionEngine:");
  console.table(scenesTable(v2New.underlyingDirection));

  console.log("\n--- CREATIVE_VALIDATION_RESULT: antes (V2-Fase1) x depois (V2-DecisionEngine) ---");
  for (const [key, value] of Object.entries(validationReport.comparison)) {
    console.log(`${key}: ${JSON.stringify(value.before)} -> ${JSON.stringify(value.after)}`);
  }

  console.log("\n--- Criterio OFICIAL desta tarefa (item 18): READY_FOR_V2_PIPELINE_INTEGRATION ---");
  for (const [key, c] of Object.entries(taskReadyCriteria)) {
    console.log(`  ${c.met ? "OK  " : "FAIL"} - ${key}: ${c.value} (precisa ${c.min !== undefined ? `>= ${c.min}` : `== ${c.expected}`})`);
  }
  console.log(`READY_FOR_V2_PIPELINE_INTEGRATION = ${taskReadyForV2PipelineIntegration ? "YES" : "NO"}`);

  console.log(`\nArtefatos salvos em:`);
  console.log(`  - ${path.relative(root, storyboardMdPath)}`);
  console.log(`  - ${path.relative(root, storyboardJsonPath)}`);
  console.log(`  - ${path.relative(root, validationJsonPath)}`);
}

main().catch((err) => {
  console.error("Decision Engine DRY-RUN falhou:", err.message, err.stack);
  process.exitCode = 1;
});
