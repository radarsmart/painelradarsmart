// Radar Creative AI - PRODUCT INTELLIGENCE CONTROLLED REPAIR
//
// UNICO script desta sessao autorizado a escrever no banco. Escopo
// deliberadamente minimo: corrige SOMENTE product_intelligence.category
// da campanha Kokeshi (660d53b5-...), e SOMENTE se todas as condicoes de
// guardrail abaixo forem confirmadas por leitura fresca no momento da
// execucao. Nao reanalisa, nao regenera claims, nao toca offers/
// creative_campaigns/preco/desconto/titulo/imagens. Compare-and-swap real
// via .eq("category", "suplementos") na propria clausula do UPDATE - se o
// valor remoto ja nao for exatamente o valor auditado, o UPDATE afeta 0
// linhas e o script aborta em vez de assumir sucesso.

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

const BLOCKED_PROVIDER_HOST_SUBSTRINGS = [
  "api.magnific.com", "api.freepik.com", "cdn-magnific.freepik.com", "heygen.com", "elevenlabs.io", "api.openai.com", "klingai.com", "runwayml", "replicate",
];
const realFetch = global.fetch;
let blockedAttempts = 0;
global.fetch = async (url, options) => {
  const urlString = String(url);
  if (BLOCKED_PROVIDER_HOST_SUBSTRINGS.some((host) => urlString.includes(host))) {
    blockedAttempts += 1;
    throw new Error(`ABORTADO (guardrail de rede): tentativa de chamar host de provider pago "${urlString}".`);
  }
  return realFetch(url, options);
};

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { detectCategoryWithEvidence } = require("../lib/product-intelligence/category-detection.ts");
const { buildGroundedProductIntelligence } = require("../lib/product-intelligence-grounding/grounded-product-intelligence.ts");
const { groundProductIntelligenceClaims } = require("../lib/product-intelligence-grounding/claim-domain-grounding.ts");
const { buildProductIdentityProfile } = require("../lib/product-intelligence-grounding/product-identity-profile.ts");

const CAMPAIGN_ID = "660d53b5-d3dc-47a5-b031-4d035bfd97a3";
const OUT_DIR = path.join(root, "temp", "product-intelligence-controlled-repair-v1");
const EXPECTED_CURRENT_CATEGORY = "suplementos";
const EXPECTED_NEW_CATEGORY = "beleza";

const KOKESHI_OBSERVED_PACKAGING = [
  { text: "ÓLEO DE COPAÍBA", observedVia: "frame-0-0pct.png (CANARY B real)" },
  { text: "Firmeza", observedVia: "frame-0-0pct.png (CANARY B real)" },
  { text: "Densidade", observedVia: "frame-0-0pct.png (CANARY B real)" },
  { text: "Textura leve, rápida absorção", observedVia: "frame-0-0pct.png (CANARY B real)" },
  { text: "Creme Gel Gota de Colágeno", observedVia: "frame-0-0pct.png (CANARY B real)" },
  { text: "FACIAL", observedVia: "frame-0-0pct.png (CANARY B real)" },
  { text: "45g", observedVia: "frame-0-0pct.png (CANARY B real)" },
];

function writeJson(name, data) {
  fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(data, null, 2), "utf8");
  console.log(`  salvo: temp/product-intelligence-controlled-repair-v1/${name}`);
}

function abort(reason) {
  console.error(`\nABORTADO ANTES DE QUALQUER UPDATE: ${reason}\n`);
  throw new Error(reason);
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("=== PRODUCT INTELLIGENCE CONTROLLED REPAIR (campanha Kokeshi real) ===\n");

  // ==========================================================================
  // 1) LEITURA FRESCA (nunca reusar dado de execucoes anteriores)
  // ==========================================================================
  const { data: campaignRow, error: campaignError } = await supabaseAdmin.from("creative_campaigns").select("id,offer_id").eq("id", CAMPAIGN_ID).maybeSingle();
  if (campaignError) throw new Error(campaignError.message);
  if (!campaignRow) abort(`Campanha ${CAMPAIGN_ID} nao encontrada.`);

  const { data: offerRow, error: offerError } = await supabaseAdmin.from("offers").select("id,title,price,discount_pct").eq("id", campaignRow.offer_id).maybeSingle();
  if (offerError) throw new Error(offerError.message);
  if (!offerRow) abort("Oferta nao encontrada.");

  const { data: piRow, error: piError } = await supabaseAdmin
    .from("product_intelligence")
    .select("id,offer_id,version,category,pain_points,desires,objections,purchase_motivations,key_benefits,emotional_benefits,functional_benefits,source,model,updated_at")
    .eq("offer_id", campaignRow.offer_id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (piError) throw new Error(piError.message);
  if (!piRow) abort("Product Intelligence nao encontrada.");

  const before = {
    campaignId: CAMPAIGN_ID,
    offerId: offerRow.id,
    productName: offerRow.title,
    productIntelligenceId: piRow.id,
    version: piRow.version,
    category: piRow.category,
    source: piRow.source,
    model: piRow.model,
    updatedAt: piRow.updated_at,
  };
  console.log("1) Registro remoto (leitura fresca):");
  console.log(`   ${JSON.stringify(before, null, 2)}`);
  writeJson("before-state.json", before);

  // ==========================================================================
  // 2) GUARDRAILS - todas as condicoes precisam ser verdadeiras, ou ABORTA
  // ==========================================================================
  if (piRow.category !== EXPECTED_CURRENT_CATEGORY) {
    abort(`Guardrail falhou: category remoto atual="${piRow.category}", esperado exatamente "${EXPECTED_CURRENT_CATEGORY}" (registro pode ja ter sido corrigido ou mudou desde a auditoria anterior).`);
  }

  const rawProductIntelligence = {
    category: piRow.category ?? "geral",
    painPoints: piRow.pain_points ?? [],
    desires: piRow.desires ?? [],
    objections: piRow.objections ?? [],
    purchaseMotivations: piRow.purchase_motivations ?? [],
    keyBenefits: piRow.key_benefits ?? [],
    emotionalBenefits: piRow.emotional_benefits ?? [],
    functionalBenefits: piRow.functional_benefits ?? [],
  };
  const offerForDetection = { id: offerRow.id, title: offerRow.title, category: null };

  const newDetection = detectCategoryWithEvidence(offerForDetection);
  if (newDetection.category !== EXPECTED_NEW_CATEGORY || newDetection.status !== "CONFIDENT") {
    abort(`Guardrail falhou: novo detector nao confirma "${EXPECTED_NEW_CATEGORY}" com confianca (obtido category="${newDetection.category}", status=${newDetection.status}).`);
  }

  const grounded = buildGroundedProductIntelligence(
    { title: offerRow.title, price: offerRow.price, originalPrice: null, discountPct: offerRow.discount_pct, marketplace: null, brand: null },
    rawProductIntelligence,
    KOKESHI_OBSERVED_PACKAGING,
  );
  if (grounded.categoryGrounding.groundedCategoryProposal !== EXPECTED_NEW_CATEGORY) {
    abort(`Guardrail falhou: Product Intelligence Grounding V1 (caminho independente) nao confirma "${EXPECTED_NEW_CATEGORY}" (obtido "${grounded.categoryGrounding.groundedCategoryProposal}").`);
  }

  console.log(`\n2) GUARDRAILS confirmados:`);
  console.log(`   current category == "${EXPECTED_CURRENT_CATEGORY}": OK`);
  console.log(`   novo detector == "${EXPECTED_NEW_CATEGORY}" (${newDetection.status}, confidence=${newDetection.confidence}): OK`);
  console.log(`   Grounding V1 independente == "${EXPECTED_NEW_CATEGORY}": OK`);

  // ==========================================================================
  // 3) AUDITORIA DE CLAIMS (reportar, nunca inventar substituto, nunca
  //    persistir quarentena por claim - schema atual nao suporta isso, ver
  //    limitacao abaixo)
  // ==========================================================================
  const identity = buildProductIdentityProfile(
    { title: offerRow.title, price: offerRow.price, originalPrice: null, discountPct: offerRow.discount_pct, marketplace: null, brand: null },
    rawProductIntelligence.category,
    KOKESHI_OBSERVED_PACKAGING,
  );
  const claims = groundProductIntelligenceClaims(rawProductIntelligence, identity);
  const claimsAudit = claims.map((c) => ({
    claim: c.originalText,
    field: c.field,
    groundingStatus: c.groundingStatus,
    contaminationCluster: c.claimClusters,
    source: c.source,
    destino: c.groundingStatus === "SUPPORTED" || c.groundingStatus === "PLAUSIBLE" ? "keep" : "quarantine",
  }));
  writeJson("claims-audit.json", claimsAudit);
  console.log(`\n3) Auditoria de claims: ${claims.length} total, ${claimsAudit.filter((c) => c.destino === "keep").length} keep, ${claimsAudit.filter((c) => c.destino === "quarantine").length} quarantine.`);

  const schemaLimitation =
    "supabase/migrations/20260807100000_create_product_intelligence.sql nao tem coluna de status por claim (so arrays de texto pain_points/desires/etc, sem campo de quarentena/grounding_status individual). " +
    "Nao e possivel persistir 'quarantine' por claim sem alterar o schema (fora de escopo desta tarefa - 'NAO inventar schema'). " +
    "Correcao limitada ao campo category - a filtragem de claims contaminadas continua acontecendo em tempo de leitura pela camada de grounding (lib/product-intelligence-grounding/**), nunca no banco.";
  console.log(`   LIMITACAO DE SCHEMA: ${schemaLimitation}`);

  // ==========================================================================
  // 4) UPDATE MINIMO, COM COMPARE-AND-SWAP (.eq("category", "suplementos")
  //    na propria clausula do UPDATE - se o valor remoto ja mudou, 0 linhas
  //    afetadas, nunca assume sucesso).
  // ==========================================================================
  const nowIso = new Date().toISOString();
  const updatePayload = { category: EXPECTED_NEW_CATEGORY, updated_at: nowIso };

  console.log(`\n4) Executando UPDATE minimo (compare-and-swap): product_intelligence.id=${piRow.id}, WHERE category="${EXPECTED_CURRENT_CATEGORY}" -> SET category="${EXPECTED_NEW_CATEGORY}".`);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("product_intelligence")
    .update(updatePayload)
    .eq("id", piRow.id)
    .eq("category", EXPECTED_CURRENT_CATEGORY)
    .select("id,category,updated_at");

  if (updateError) throw new Error(updateError.message);
  if (!updated || updated.length !== 1) {
    abort(`Compare-and-swap falhou: UPDATE afetou ${updated ? updated.length : 0} linha(s) (esperado 1) - o registro pode ter mudado entre a leitura e o UPDATE. NENHUMA alteracao foi aplicada.`);
  }

  const after = { productIntelligenceId: updated[0].id, category: updated[0].category, updatedAt: updated[0].updated_at };
  console.log(`   UPDATE aplicado com sucesso: ${JSON.stringify(after)}.`);

  // ==========================================================================
  // 5) CONFIRMACAO POS-ESCRITA (releitura real, nunca confiar so no retorno do UPDATE)
  // ==========================================================================
  const { data: verifyRow, error: verifyError } = await supabaseAdmin.from("product_intelligence").select("id,category,updated_at").eq("id", piRow.id).maybeSingle();
  if (verifyError) throw new Error(verifyError.message);
  const verified = verifyRow.category === EXPECTED_NEW_CATEGORY;
  console.log(`\n5) Confirmacao pos-escrita (releitura real): category="${verifyRow.category}" - verified=${verified}.`);

  const repairLog = {
    campaignId: CAMPAIGN_ID,
    offerId: offerRow.id,
    productIntelligenceId: piRow.id,
    before,
    after,
    fieldsChanged: ["category", "updated_at"],
    reason: `Category corrigida de "${EXPECTED_CURRENT_CATEGORY}" para "${EXPECTED_NEW_CATEGORY}" apos confirmacao dupla e independente (novo detector ponderado + Product Intelligence Grounding V1) e compare-and-swap bem-sucedido.`,
    timestamp: nowIso,
    verifiedByFreshRead: verified,
    schemaLimitation,
    claimsAuditSummary: { total: claims.length, keep: claimsAudit.filter((c) => c.destino === "keep").length, quarantine: claimsAudit.filter((c) => c.destino === "quarantine").length },
  };
  writeJson("repair-log.json", repairLog);

  console.log(`\nblockedAttempts (rede) = ${blockedAttempts} (esperado 0).`);
  console.log("\n=== FIM DO REPAIR - 1 UPDATE real aplicado (product_intelligence.category), nenhum outro campo/tabela alterado. ===");
}

main().catch((err) => {
  console.error("\nERRO / ABORTADO:", err.message);
  process.exitCode = 1;
});
