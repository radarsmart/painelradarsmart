// Radar Creative AI - Creative Director V2 / Validation & Storyboard Preview
//
// Roda V1 + V2 + toda a camada de validacao (lib/creative-director-v2/validation/**)
// para a MESMA campanha real usada no dry-run anterior, so leitura. NUNCA
// chama provider, NUNCA integra ao EXECUTE, NUNCA escreve em
// creative_campaigns/commercial_generation_jobs/Storage. Mesmo padrao de
// interceptacao de fetch do dry-run anterior, pra PROVAR (nao so documentar)
// que so o host do Supabase foi chamado.
//
// Uso: node scripts/run-creative-director-v2-validation.js [campaignId]

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
const { buildStoryboardPreview, buildStoryboardPreviewMarkdown } = require("../lib/creative-director-v2/validation/storyboard-preview.ts");
const { runCreativeValidation } = require("../lib/creative-director-v2/validation/validation-orchestrator.ts");
const { findDryRunCampaign, buildInputForCampaign } = require("./lib/creative-director-v2-fixture.js");

async function main() {
  const explicitId = process.argv[2] || null;
  const campaignRow = await findDryRunCampaign(supabaseAdmin, explicitId);
  const { input, offerTitle } = await buildInputForCampaign(supabaseAdmin, campaignRow);

  const v1 = await buildCommercialDirection(input);
  const v2 = await buildCommercialCreativeDirectionV2(input);

  const storyboardPreview = buildStoryboardPreview(v2);
  const storyboardPreviewMarkdown = buildStoryboardPreviewMarkdown(storyboardPreview);
  const validation = runCreativeValidation(v1, v2);

  const offHostCalls = networkCalls.filter((url) => {
    try {
      return new URL(url).host !== supabaseHost;
    } catch {
      return true;
    }
  });
  if (offHostCalls.length > 0) {
    throw new Error(`Validacao violada: chamada de rede fora do Supabase detectada -> ${JSON.stringify(offHostCalls)}`);
  }

  const outDir = path.join(root, "temp");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const storyboardJsonPath = path.join(outDir, "creative-director-v2-storyboard-preview.json");
  const storyboardMdPath = path.join(outDir, "creative-director-v2-storyboard-preview.md");
  const validationReportPath = path.join(outDir, "creative-director-v2-validation-report.json");

  fs.writeFileSync(storyboardJsonPath, JSON.stringify(storyboardPreview, null, 2), "utf8");
  fs.writeFileSync(storyboardMdPath, storyboardPreviewMarkdown, "utf8");

  const validationReport = {
    generatedAt: new Date().toISOString(),
    mode: "VALIDATION_DRY_RUN",
    campaignId: campaignRow.id,
    campaignName: campaignRow.name,
    offerTitle,
    result: validation,
    verification: {
      networkCallsTotal: networkCalls.length,
      networkCallsOffSupabaseHost: offHostCalls,
      onlySupabaseReads: offHostCalls.length === 0,
      note: "Nenhuma chamada de provider - so leitura no Supabase do proprio projeto. Nenhuma escrita, nenhuma integracao com EXECUTE.",
    },
  };
  fs.writeFileSync(validationReportPath, JSON.stringify(validationReport, null, 2), "utf8");

  console.log(`Campanha: ${campaignRow.name} (${campaignRow.id}) - oferta "${offerTitle}"`);
  console.log(`Chamadas de rede totais: ${networkCalls.length} (todas para ${supabaseHost}: ${offHostCalls.length === 0})`);
  console.log("\n--- CREATIVE_VALIDATION_RESULT ---");
  console.log(`V1_SCORE (capacidade de planejamento, tautologico): ${validation.v1Score}`);
  console.log(`V2_SCORE (capacidade de planejamento, tautologico): ${validation.v2Score}`);
  console.log(`PREMIUM_BENCHMARK_SCORE: ${validation.premiumBenchmarkScore}% (${validation.benchmarkStrengthAudit.overallAuditVerdict})`);
  console.log(`CINEMATIC_BENCHMARK_SCORE: ${validation.cinematicBenchmarkScore}%`);
  console.log(`HOOK_SCORE: ${validation.hookScore}/100`);
  console.log(`PRODUCT_FIRST_SCORE: ${validation.productFirstScore}/100`);
  console.log(`CREATIVE_DENSITY_SCORE: ${validation.creativeDensityScore}/100`);
  console.log(`COMMERCIAL_ARC_SCORE: ${validation.commercialArcScore}/100 (faltando: ${validation.commercialArc.missing.join(", ") || "nenhum"})`);
  console.log(`GENERIC_AD_RISK: ${validation.genericAdRisk}`);
  console.log(`SCENE_REDUNDANCY_RISK: ${validation.sceneRedundancyRisk}`);
  console.log(`\nREADY_FOR_V2_PIPELINE_INTEGRATION: ${validation.readyForV2PipelineIntegration ? "YES" : "NO"}`);
  for (const reason of validation.readyForV2PipelineIntegrationReasons) {
    console.log(`  - ${reason}`);
  }
  console.log(`\nArtefatos salvos em:`);
  console.log(`  - ${path.relative(root, storyboardJsonPath)}`);
  console.log(`  - ${path.relative(root, storyboardMdPath)}`);
  console.log(`  - ${path.relative(root, validationReportPath)}`);
}

main().catch((err) => {
  console.error("Validacao falhou:", err.message);
  process.exitCode = 1;
});
