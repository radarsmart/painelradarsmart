// Radar Creative AI - PRODUCT INTELLIGENCE CATEGORY FIX + PURPOSE-AWARE
// BENEFIT VISUALIZATION V1 - DRY_RUN real
//
// 100% DRY_RUN. ZERO chamada a provider pago, ZERO midia gerada, ZERO
// escrita no Supabase (guardrail de escrita ativo, mesmo padrao das
// tarefas anteriores), ZERO integracao ao EXECUTE, ZERO alteracao de
// threshold. Confirma contra a campanha REAL Kokeshi que:
// 1) a nova deteccao de categoria (ja aplicada em
//    lib/product-intelligence/analyze.ts) concorda, por um caminho de
//    codigo INDEPENDENTE, com o que o Product Intelligence Grounding V1
//    ja tinha proposto;
// 2) a nova BenefitVisualization purpose-aware resolve o gargalo isolado
//    (BENEFIT_VISUALIZATION=40/FAIL) sem tocar em nenhum threshold.

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

const supabaseAdminRaw = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let writeAttempts = 0;
const supabaseAdmin = {
  from(table) {
    const builder = supabaseAdminRaw.from(table);
    for (const method of ["insert", "update", "upsert", "delete"]) {
      const original = builder[method].bind(builder);
      builder[method] = (...args) => {
        writeAttempts += 1;
        throw new Error(`ABORTADO (guardrail de escrita): tentativa de chamar "${table}.${method}()" - esta tarefa e 100% DRY_RUN/READ_ONLY.`);
      };
    }
    return builder;
  },
};

const { buildCampaignPromptPlan } = require("../lib/prompt-builder/prompt-builder.ts");
const { buildNarrationPlan } = require("../lib/commercial-video/narration/narration-script-builder.ts");

const { detectCategoryWithEvidence } = require("../lib/product-intelligence/category-detection.ts");
const { buildGroundedProductIntelligence } = require("../lib/product-intelligence-grounding/grounded-product-intelligence.ts");
const { buildProductIntelligenceGroundingGate } = require("../lib/product-intelligence-grounding/grounding-gate.ts");
const { buildCleanedProductIntelligenceInput } = require("../lib/product-intelligence-grounding/cleaned-input-adapter.ts");

const { buildPersuasionEvidence } = require("../lib/commercial-video/persuasion/claim-grounding.ts");
const { buildProductDesireProfile, resolveEffectiveCategory } = require("../lib/commercial-video/persuasion/product-desire-profile.ts");
const { answerPurchaseMotivationQuestions } = require("../lib/commercial-video/persuasion/purchase-motivation-questions.ts");
const { generateSalesAngleCandidates, selectWinningSalesAngle } = require("../lib/commercial-video/persuasion/sales-angle-engine.ts");
const { buildBenefitVisualizationPlans } = require("../lib/commercial-video/persuasion/benefit-visualization.ts");
const { adaptCommercialDirectionV2ToPersuasionStoryboard } = require("../lib/commercial-video/persuasion/current-v2-adapter.ts");
const { buildPersuasionStoryboard } = require("../lib/commercial-video/persuasion/persuasion-storyboard-builder.ts");
const { scoreStoryboard } = require("../lib/commercial-video/persuasion/scorer.ts");

const CAMPAIGN_ID = "660d53b5-d3dc-47a5-b031-4d035bfd97a3";
const OUT_DIR = path.join(root, "temp", "category-benefit-fix-v1");
const PREVIOUS_GROUNDING_ARTIFACT = path.join(root, "temp", "product-intelligence-grounding-v1", "desire-grounded-storyboard.json");

const KOKESHI_OBSERVED_PACKAGING = [
  { text: "ÓLEO DE COPAÍBA", observedVia: "frame-0-0pct.png (CANARY B real)" },
  { text: "Firmeza", observedVia: "frame-0-0pct.png (CANARY B real)" },
  { text: "Densidade", observedVia: "frame-0-0pct.png (CANARY B real)" },
  { text: "Textura leve, rápida absorção", observedVia: "frame-0-0pct.png (CANARY B real)" },
  { text: "Creme Gel Gota de Colágeno", observedVia: "frame-0-0pct.png (CANARY B real)" },
  { text: "FACIAL", observedVia: "frame-0-0pct.png (CANARY B real)" },
  { text: "45g", observedVia: "frame-0-0pct.png (CANARY B real)" },
];

function resolvePlatform(value) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("reels") || normalized.includes("instagram")) return "INSTAGRAM_REELS";
  if (normalized.includes("meta") || normalized.includes("ads")) return "META_ADS";
  return "TIKTOK";
}

function writeJson(name, data) {
  fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(data, null, 2), "utf8");
  console.log(`  salvo: temp/category-benefit-fix-v1/${name}`);
}

function runPersuasionPipeline(offer, productIntelligenceInput, observedPackaging) {
  const evidence = buildPersuasionEvidence(offer, productIntelligenceInput, observedPackaging);
  const effectiveCategory = resolveEffectiveCategory(evidence);
  const desireProfile = buildProductDesireProfile(evidence);
  const motivationAnswers = answerPurchaseMotivationQuestions(evidence, desireProfile);
  const salesAngleCandidates = generateSalesAngleCandidates(evidence, desireProfile);
  const winningAngle = selectWinningSalesAngle(salesAngleCandidates);
  const benefitPlans = buildBenefitVisualizationPlans(evidence, desireProfile);
  return { evidence, effectiveCategory, desireProfile, motivationAnswers, salesAngleCandidates, winningAngle, benefitPlans };
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("=== PRODUCT INTELLIGENCE CATEGORY FIX + PURPOSE-AWARE BENEFIT VISUALIZATION V1 - DRY_RUN (campanha Kokeshi real) ===\n");

  // ==========================================================================
  // 1) CARREGAR DADOS REAIS (SO LEITURA)
  // ==========================================================================
  const { data: campaignRow } = await supabaseAdmin.from("creative_campaigns").select("id,name,offer_id,aspect_ratio,platform,creative_brief").eq("id", CAMPAIGN_ID).maybeSingle();
  const v2 = campaignRow.creative_brief && campaignRow.creative_brief.commercialDirectionV2;
  if (!v2) throw new Error("ABORTADO: creative_brief.commercialDirectionV2 nao encontrado.");

  const { data: offerRow } = await supabaseAdmin.from("offers").select("title,price,original_price,discount_pct,marketplace,rating,reviews_count").eq("id", campaignRow.offer_id).maybeSingle();
  const { data: piRow } = await supabaseAdmin
    .from("product_intelligence")
    .select("id,category,pain_points,desires,objections,purchase_motivations,key_benefits,emotional_benefits,functional_benefits")
    .eq("offer_id", campaignRow.offer_id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const offer = { title: offerRow.title, price: offerRow.price, originalPrice: offerRow.original_price, discountPct: offerRow.discount_pct, marketplace: offerRow.marketplace, brand: null, rating: offerRow.rating, reviewsCount: offerRow.reviews_count, imageUrl: null };
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

  console.log(`1) Dados reais carregados: offer.title="${offer.title}", product_intelligence.category (banco, ainda NAO alterado)="${rawProductIntelligence.category}".`);

  // ==========================================================================
  // 2) NOVA DETECCAO DE CATEGORIA (codigo ja corrigido) - CROSS-VALIDACAO
  //    contra o Product Intelligence Grounding V1 (caminho de codigo
  //    INDEPENDENTE: evidencia ponderada por keyword vs identidade por
  //    cluster de dominio).
  // ==========================================================================
  const newCategoryDetection = detectCategoryWithEvidence({ id: campaignRow.offer_id, title: offer.title, category: null });
  const grounded = buildGroundedProductIntelligence(offer, rawProductIntelligence, KOKESHI_OBSERVED_PACKAGING);
  writeJson("category-detection-result.json", newCategoryDetection);

  const crossValidated = newCategoryDetection.category === grounded.categoryGrounding.groundedCategoryProposal;
  console.log(`\n2) Nova deteccao de categoria (analyze.ts, codigo corrigido): category="${newCategoryDetection.category}", status=${newCategoryDetection.status}, confidence=${newCategoryDetection.confidence}.`);
  console.log(`   Product Intelligence Grounding V1 (caminho INDEPENDENTE, cluster de dominio): groundedCategoryProposal="${grounded.categoryGrounding.groundedCategoryProposal}".`);
  console.log(`   CROSS-VALIDACAO (2 algoritmos independentes concordam): ${crossValidated}.`);

  const groundingGate = buildProductIntelligenceGroundingGate(grounded);
  writeJson("grounding-gate-still-on-raw-db.json", groundingGate);
  console.log(`   ProductIntelligenceGroundingGate sobre o dado AINDA persistido no banco (nao alterado): status=${groundingGate.status}, downstreamReady=${groundingGate.downstreamReady} (esperado - so o CODIGO de deteccao foi corrigido, o registro remoto continua "suplementos" ate uma correcao futura autorizada).`);

  // ==========================================================================
  // 3) NARRACAO REAL + STORYBOARDS (mesmo padrao das tarefas anteriores)
  // ==========================================================================
  const aspectRatio = campaignRow.aspect_ratio || "9:16";
  const platform = resolvePlatform(campaignRow.platform);
  const ctx = { productTitle: offer.title, category: rawProductIntelligence.category, platform, aspectRatio, defaultLogoAssetId: null };
  const promptPlan = buildCampaignPromptPlan(CAMPAIGN_ID, v2.underlyingDirection, ctx, { sceneBlueprints: v2.sceneBlueprints, ctaDirection: v2.ctaDirection });
  const narrationPlan = buildNarrationPlan(CAMPAIGN_ID, promptPlan, { title: offer.title, rating: offer.rating, reviewsCount: offer.reviewsCount }, { keyBenefits: rawProductIntelligence.keyBenefits }, rawProductIntelligence.category);
  const realNarrationBySceneId = Object.fromEntries(narrationPlan.scenes.map((s) => [s.sceneId, s.text ?? "(sem narracao)"]));

  const cleanedProductIntelligence = buildCleanedProductIntelligenceInput(grounded);

  const contaminated = runPersuasionPipeline(offer, rawProductIntelligence, KOKESHI_OBSERVED_PACKAGING);
  const cleanRun = runPersuasionPipeline(offer, cleanedProductIntelligence, KOKESHI_OBSERVED_PACKAGING);

  const currentV2Storyboard = adaptCommercialDirectionV2ToPersuasionStoryboard(v2, contaminated.effectiveCategory, realNarrationBySceneId);
  const scoredCurrentV2 = scoreStoryboard("CURRENT_V2", currentV2Storyboard, contaminated.evidence, contaminated.desireProfile, contaminated.motivationAnswers);

  const { storyboard: contaminatedStoryboard } = buildPersuasionStoryboard({ evidence: contaminated.evidence, desireProfile: contaminated.desireProfile, salesAngle: contaminated.winningAngle, benefitPlans: contaminated.benefitPlans, useCharacter: true });
  const scoredContaminated = scoreStoryboard("DESIRE_ENGINE_V1_CONTAMINATED", contaminatedStoryboard, contaminated.evidence, contaminated.desireProfile, contaminated.motivationAnswers);

  const { storyboard: groundedStoryboard, structuralLimitation } = buildPersuasionStoryboard({ evidence: cleanRun.evidence, desireProfile: cleanRun.desireProfile, salesAngle: cleanRun.winningAngle, benefitPlans: cleanRun.benefitPlans, useCharacter: true });
  const scoredGroundedNew = scoreStoryboard("DESIRE_ENGINE_V1_GROUNDED_CATEGORY_AND_BENEFIT_FIX", groundedStoryboard, cleanRun.evidence, cleanRun.desireProfile, cleanRun.motivationAnswers);

  writeJson("storyboard-grounded-fixed.json", { storyboard: groundedStoryboard, scored: scoredGroundedNew, structuralLimitation });

  // ==========================================================================
  // 4) COMPARACAO TRIPLA: ANTES DA CATEGORIA / GROUNDING CLEAN (formula antiga,
  //    congelada) / CATEGORY FIX + BENEFIT FIX (agora)
  // ==========================================================================
  let frozenOldGrounded = null;
  if (fs.existsSync(PREVIOUS_GROUNDING_ARTIFACT)) {
    frozenOldGrounded = JSON.parse(fs.readFileSync(PREVIOUS_GROUNDING_ARTIFACT, "utf8")).scored;
  }

  const dimNames = ["hookPersuasion.score", "scrollStop.score", "contextRelevance.score", "benefitVisualization.score", "purchaseMotivationScore.score", "desireScore", "emotionalProgression.score", "characterIntegration.score", "redundancy.score"];
  function pick(scored, dim) {
    const parts = dim.split(".");
    let v = scored;
    for (const p of parts) v = v[p];
    return v;
  }

  const comparison = {
    dimensions: dimNames.map((dim) => ({
      name: dim,
      CURRENT_V2: pick(scoredCurrentV2, dim),
      DESIRE_ENGINE_V1_CONTAMINATED: pick(scoredContaminated, dim),
      GROUNDING_CLEAN_OLD_FORMULA: frozenOldGrounded ? pick(frozenOldGrounded, dim) : null,
      CATEGORY_AND_BENEFIT_FIX: pick(scoredGroundedNew, dim),
    })),
    qualityGate: {
      CURRENT_V2: scoredCurrentV2.qualityGate.status,
      DESIRE_ENGINE_V1_CONTAMINATED: scoredContaminated.qualityGate.status,
      GROUNDING_CLEAN_OLD_FORMULA: frozenOldGrounded ? frozenOldGrounded.qualityGate.status : null,
      CATEGORY_AND_BENEFIT_FIX: scoredGroundedNew.qualityGate.status,
    },
    crossValidated,
    structuralLimitation,
  };
  writeJson("triple-comparison.json", comparison);

  console.log("\n3) COMPARACAO (score / threshold onde aplicavel):");
  for (const d of comparison.dimensions) {
    console.log(`   ${d.name.padEnd(30)} CURRENT_V2=${d.CURRENT_V2} | CONTAMINATED=${d.DESIRE_ENGINE_V1_CONTAMINATED} | GROUNDED(formula antiga)=${d.GROUNDING_CLEAN_OLD_FORMULA} | CATEGORY+BENEFIT_FIX=${d.CATEGORY_AND_BENEFIT_FIX}`);
  }
  console.log(`   qualityGate.status: CURRENT_V2=${comparison.qualityGate.CURRENT_V2} | CONTAMINATED=${comparison.qualityGate.DESIRE_ENGINE_V1_CONTAMINATED} | GROUNDED(antiga)=${comparison.qualityGate.GROUNDING_CLEAN_OLD_FORMULA} | FIX=${comparison.qualityGate.CATEGORY_AND_BENEFIT_FIX}`);

  console.log("\n4) Checks do gate final (CATEGORY + BENEFIT FIX):");
  for (const c of scoredGroundedNew.qualityGate.checks) console.log(`   ${c.status.padEnd(22)} ${c.name} ${c.score !== null ? `(${c.score}/${c.threshold})` : ""}`);

  // ==========================================================================
  // 5) VEREDITO FINAL
  // ==========================================================================
  // Criterio EXATO do pedido (item 16) - todas as condicoes, nenhum
  // threshold alterado. downstreamReady vem do gate sobre o dado AINDA
  // persistido no banco (nunca corrigido nesta tarefa) - por construcao,
  // fica false ate uma correcao de banco futura e autorizada, mesmo que o
  // CODIGO de deteccao ja esteja corrigido e cross-validado.
  const gateChecks = scoredGroundedNew.qualityGate.checks;
  const claimSafety = gateChecks.find((c) => c.name === "CLAIM_SAFETY");
  const scoreThresholdCriteria = {
    PURCHASE_MOTIVATION: gateChecks.find((c) => c.name === "PURCHASE_MOTIVATION"),
    BENEFIT_VISUALIZATION: gateChecks.find((c) => c.name === "BENEFIT_VISUALIZATION"),
    DESIRE_SCORE: gateChecks.find((c) => c.name === "DESIRE_SCORE"),
    HOOK_PERSUASION: gateChecks.find((c) => c.name === "HOOK_PERSUASION"),
    SCROLL_STOP_POWER: gateChecks.find((c) => c.name === "SCROLL_STOP_POWER"),
    PRODUCT_CONTEXT_RELEVANCE: gateChecks.find((c) => c.name === "PRODUCT_CONTEXT_RELEVANCE"),
  };
  const allScoreThresholdsMet = Object.values(scoreThresholdCriteria).every((c) => c.score !== null && c.threshold !== null && c.score >= c.threshold);

  const readyForIntegration =
    groundingGate.downstreamReady &&
    claimSafety.status === "PASS" &&
    allScoreThresholdsMet &&
    scoredGroundedNew.genericAdRisk.riskLevel !== "HIGH";

  console.log(`\n5) READY_FOR_PERSUASION_PIPELINE_INTEGRATION = ${readyForIntegration ? "YES" : "NO"}`);
  console.log(`   downstreamReady (dado AINDA no banco)=${groundingGate.downstreamReady} | claimSafety=${claimSafety.status} | allScoreThresholdsMet=${allScoreThresholdsMet} | genericAdRisk=${scoredGroundedNew.genericAdRisk.riskLevel}`);
  if (!groundingGate.downstreamReady && allScoreThresholdsMet) {
    console.log("   NOTA: todos os thresholds de score do motor de persuasao ja passam com dado limpo - o unico bloqueio restante e downstreamReady=false, que exige a correcao real do banco (fora de escopo desta tarefa, so codigo).");
  }

  writeJson("dry-run-summary.json", {
    campaignId: CAMPAIGN_ID,
    generatedAt: new Date().toISOString(),
    networkGuardrail: { blockedAttempts },
    writeGuardrail: { writeAttempts },
    newCategoryDetection,
    crossValidatedAgainstGroundingV1: crossValidated,
    rawDbCategoryStillUnchanged: rawProductIntelligence.category,
    comparison,
    finalGateChecks: gateChecks,
    readyForPersuasionPipelineIntegration: readyForIntegration ? "YES" : "NO",
  });

  console.log(`\nblockedAttempts (rede) = ${blockedAttempts} (esperado 0). writeAttempts (Supabase) = ${writeAttempts} (esperado 0).`);
  console.log("\n=== FIM DO DRY_RUN - NENHUMA chamada paga, NENHUMA escrita, NENHUM video gerado. ===");
}

main().catch((err) => {
  console.error("\nERRO / ABORTADO:", err.message);
  process.exitCode = 1;
});
