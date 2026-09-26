// Radar Creative AI - Creative Director V2 / DRY-RUN real
//
// Roda V1 (buildCommercialDirection) e V2 (buildCommercialCreativeDirectionV2)
// EM MEMORIA para UMA campanha real ja existente, so leitura. NUNCA chama
// provider, NUNCA escreve em creative_campaigns/commercial_generation_jobs,
// NUNCA altera Storage. Confirma isso de fato interceptando global.fetch e
// validando que toda chamada de rede feita durante o script tem como destino
// o proprio host do Supabase do projeto (nunca um host de provider).
//
// Uso: node scripts/run-creative-director-v2-dry-run.js [campaignId]

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

// Intercepta TODA chamada de rede feita durante o script (inclusive as que
// o supabase-js/buildCommercialDirection fazem por baixo dos panos) so pra
// PROVAR, nao so documentar, que nada saiu do host do Supabase - nenhum
// provider (WAN/Kling/HeyGen/ElevenLabs/Freepik) foi chamado.
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
const { compareCreativeDirections } = require("../lib/creative-director-v2/compare-v1-v2.ts");
const { findDryRunCampaign, buildInputForCampaign } = require("./lib/creative-director-v2-fixture.js");

async function main() {
  const explicitId = process.argv[2] || null;
  const campaignRow = await findDryRunCampaign(supabaseAdmin, explicitId);
  const { input, offerTitle } = await buildInputForCampaign(supabaseAdmin, campaignRow);

  const v1 = await buildCommercialDirection(input);
  const v2 = await buildCommercialCreativeDirectionV2(input);
  const comparison = compareCreativeDirections(v1, v2);

  const offHostCalls = networkCalls.filter((url) => {
    try {
      return new URL(url).host !== supabaseHost;
    } catch {
      return true;
    }
  });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "DRY_RUN",
    campaignId: campaignRow.id,
    campaignName: campaignRow.name,
    offerTitle,
    input,
    v1CommercialDirection: v1,
    v2CommercialCreativeDirection: v2,
    comparison,
    verification: {
      networkCallsTotal: networkCalls.length,
      networkCallsOffSupabaseHost: offHostCalls,
      onlySupabaseReads: offHostCalls.length === 0,
      note: "Nenhuma chamada de provider (WAN/Kling/HeyGen/ElevenLabs/Freepik) - so leitura no Supabase do proprio projeto. Nenhuma escrita (insert/update/upsert/delete) foi executada por este script.",
    },
  };

  if (offHostCalls.length > 0) {
    throw new Error(`DRY-RUN violado: chamada de rede fora do Supabase detectada -> ${JSON.stringify(offHostCalls)}`);
  }

  const outDir = path.join(root, "temp");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "creative-director-v2-dry-run-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Campanha: ${report.campaignName} (${report.campaignId}) - oferta "${offerTitle}"`);
  console.log(`Chamadas de rede totais: ${networkCalls.length} (todas para ${supabaseHost}: ${offHostCalls.length === 0})`);
  console.log("\n--- Comparacao V1 x V2 ---");
  for (const entry of comparison.entries) {
    console.log(`- ${entry.field}: V1="${entry.v1Value}" | V2="${entry.v2Value}" | melhorou=${entry.improved}`);
  }
  console.log(`\nStoryboard Quality Gate V2: ${v2.storyboardQualityGate.status}`);
  console.log(`Generic Ad Risk V2: ${v2.genericAdRisk.risk} (${v2.genericAdRisk.reasons.join(", ") || "nenhum motivo"})`);
  console.log(`Benchmark match (${v2.benchmarkComparison.benchmarkSlug}): ${v2.benchmarkComparison.matchScore}%`);
  console.log(`\nRelatorio completo salvo em: ${path.relative(root, outPath)}`);
}

main().catch((err) => {
  console.error("DRY-RUN falhou:", err.message);
  process.exitCode = 1;
});
