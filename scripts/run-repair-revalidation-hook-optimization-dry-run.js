// Radar Creative AI - FASE B (REVALIDACAO APOS REPAIR) + FASE C (SCROLL-STOP
// HOOK OPTIMIZATION V1) - DRY_RUN real
//
// 100% DRY_RUN a partir daqui. ZERO chamada a provider pago, ZERO midia
// gerada, ZERO escrita no Supabase (guardrail de escrita ativo - o UNICO
// write autorizado desta sessao ja foi feito por
// scripts/run-product-intelligence-controlled-repair.js), ZERO integracao
// ao EXECUTE, ZERO threshold alterado.
//
// Fase B: confirma downstreamReady=true agora que product_intelligence.
// category da Kokeshi foi corrigido para "beleza" no banco.
// Fase C: gera e avalia 4 variantes de HOOK (mesmo scorer), decide se
// alguma representa melhora MATERIAL (nunca so um bonus mecanico de
// personagem) - se nao houver, mantem o HOOK atual e reporta o resultado
// honestamente, mesmo que isso signifique manter SCROLL_STOP_POWER abaixo
// do threshold.

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
      builder[method] = (...args) => {
        writeAttempts += 1;
        throw new Error(`ABORTADO (guardrail de escrita): tentativa de chamar "${table}.${method}()" - esta tarefa e 100% DRY_RUN a partir da Fase B, o repair ja foi feito em script separado.`);
      };
    }
    return builder;
  },
};

const { buildCampaignPromptPlan } = require("../lib/prompt-builder/prompt-builder.ts");
const { buildNarrationPlan } = require("../lib/commercial-video/narration/narration-script-builder.ts");

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
const { generateHookVariantConcepts, evaluateHookVariant, decideHookOptimization } = require("../lib/commercial-video/persuasion/hook-optimization.ts");

const CAMPAIGN_ID = "660d53b5-d3dc-47a5-b031-4d035bfd97a3";
const OUT_DIR = path.join(root, "temp", "repair-revalidation-hook-optimization-v1");

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
  console.log(`  salvo: temp/repair-revalidation-hook-optimization-v1/${name}`);
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("=== FASE B (REVALIDACAO) + FASE C (SCROLL-STOP HOOK OPTIMIZATION V1) - DRY_RUN (campanha Kokeshi real) ===\n");

  // ==========================================================================
  // FASE B - REVALIDACAO
  // ==========================================================================
  const { data: campaignRow } = await supabaseAdmin.from("creative_campaigns").select("id,offer_id,aspect_ratio,platform,creative_brief").eq("id", CAMPAIGN_ID).maybeSingle();
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

  console.log(`FASE B) product_intelligence.category (releitura pos-repair) = "${rawProductIntelligence.category}" (esperado "beleza").`);

  const grounded = buildGroundedProductIntelligence(offer, rawProductIntelligence, KOKESHI_OBSERVED_PACKAGING);
  const groundingGate = buildProductIntelligenceGroundingGate(grounded);
  writeJson("grounding-gate-post-repair.json", groundingGate);

  console.log(`   ProductIntelligenceGroundingGate POS-REPAIR: status=${groundingGate.status}, downstreamReady=${groundingGate.downstreamReady}.`);
  for (const c of groundingGate.checks) console.log(`     ${c.status.padEnd(22)} ${c.name}`);

  if (!groundingGate.downstreamReady) {
    console.log("\n   AVISO: downstreamReady ainda false apos o repair - investigar antes de prosseguir para a Fase C (nao deveria acontecer se o repair funcionou).");
  }

  // ==========================================================================
  // Reconstroi o storyboard grounded (mesmo pipeline das tarefas anteriores)
  // ==========================================================================
  const aspectRatio = campaignRow.aspect_ratio || "9:16";
  const platform = resolvePlatform(campaignRow.platform);
  const ctx = { productTitle: offer.title, category: rawProductIntelligence.category, platform, aspectRatio, defaultLogoAssetId: null };
  const promptPlan = buildCampaignPromptPlan(CAMPAIGN_ID, v2.underlyingDirection, ctx, { sceneBlueprints: v2.sceneBlueprints, ctaDirection: v2.ctaDirection });
  const narrationPlan = buildNarrationPlan(CAMPAIGN_ID, promptPlan, { title: offer.title, rating: offer.rating, reviewsCount: offer.reviewsCount }, { keyBenefits: rawProductIntelligence.keyBenefits }, rawProductIntelligence.category);
  const realNarrationBySceneId = Object.fromEntries(narrationPlan.scenes.map((s) => [s.sceneId, s.text ?? "(sem narracao)"]));

  const cleanedProductIntelligence = buildCleanedProductIntelligenceInput(grounded);
  const evidence = buildPersuasionEvidence(offer, cleanedProductIntelligence, KOKESHI_OBSERVED_PACKAGING);
  const effectiveCategory = resolveEffectiveCategory(evidence);
  const desireProfile = buildProductDesireProfile(evidence);
  const motivationAnswers = answerPurchaseMotivationQuestions(evidence, desireProfile);
  const salesAngleCandidates = generateSalesAngleCandidates(evidence, desireProfile);
  const winningAngle = selectWinningSalesAngle(salesAngleCandidates);
  const benefitPlans = buildBenefitVisualizationPlans(evidence, desireProfile);

  const currentV2Storyboard = adaptCommercialDirectionV2ToPersuasionStoryboard(v2, effectiveCategory, realNarrationBySceneId);
  const scoredCurrentV2 = scoreStoryboard("CURRENT_V2", currentV2Storyboard, evidence, desireProfile, motivationAnswers);

  const { storyboard: baselineStoryboard, structuralLimitation } = buildPersuasionStoryboard({ evidence, desireProfile, salesAngle: winningAngle, benefitPlans, useCharacter: true });
  const scoredBaseline = scoreStoryboard("DESIRE_ENGINE_V1_POST_REPAIR", baselineStoryboard, evidence, desireProfile, motivationAnswers);

  writeJson("storyboard-post-repair-baseline.json", { storyboard: baselineStoryboard, scored: scoredBaseline, structuralLimitation });

  console.log(`\n   Storyboard DESIRE_ENGINE_V1 pos-repair: qualityGate.status=${scoredBaseline.qualityGate.status}.`);
  for (const c of scoredBaseline.qualityGate.checks) console.log(`     ${c.status.padEnd(22)} ${c.name} ${c.score !== null ? `(${c.score}/${c.threshold})` : ""}`);

  // ==========================================================================
  // FASE C - SCROLL-STOP HOOK OPTIMIZATION
  // ==========================================================================
  console.log("\n\nFASE C) SCROLL-STOP HOOK OPTIMIZATION\n");

  const baselineHookScene = baselineStoryboard.scenes[0];
  const variants = generateHookVariantConcepts(baselineHookScene, evidence, desireProfile, benefitPlans);
  const evaluations = variants.map((variant) => evaluateHookVariant({ variant, baselineStoryboard, evidence, desireProfile, motivationAnswers }));

  console.log("Comparacao de variantes (mesmo scorer para todas):\n");
  const metricNames = ["hookPersuasion", "scrollStopPower", "desireContribution", "productRelevance", "firstSecondClarity", "specificity", "priceCuriosity", "humanInterest", "visualInterrupt", "genericAdRisk", "claimSafety", "characterIntegration", "contextRelevance"];
  for (const metricName of metricNames) {
    const row = evaluations.map((e) => `${e.variantId}=${e.metrics[metricName]}`).join(" | ");
    console.log(`  ${metricName.padEnd(20)} ${row}`);
  }

  console.log("\nWHY_WOULD_VIEWER_STOP por variante:");
  for (const e of evaluations) {
    console.log(`  ${e.variantId}:`);
    console.log(`    STOP: ${e.whyViewerWouldStop}`);
    console.log(`    KEEP_WATCHING: ${e.whyViewerWouldKeepWatching}`);
    console.log(`    WANTS_NEXT: ${e.whatTheyWantToKnowNext}`);
    console.log(`    FIRST_SECOND_SIGNAL: ${e.firstSecondSignal} (weak=${e.weak})`);
  }

  const decision = decideHookOptimization(evaluations);
  writeJson("hook-variants-evaluation.json", evaluations.map((e) => ({ variantId: e.variantId, label: e.label, scene: e.scene, metrics: e.metrics, whyViewerWouldStop: e.whyViewerWouldStop, whyViewerWouldKeepWatching: e.whyViewerWouldKeepWatching, whatTheyWantToKnowNext: e.whatTheyWantToKnowNext, firstSecondSignal: e.firstSecondSignal, weak: e.weak })));
  writeJson("hook-optimization-decision.json", decision);

  console.log(`\nHOOK_OPTIMIZATION_DECISION:`);
  console.log(`  selectedVariant=${decision.selectedVariant}`);
  console.log(`  baselineScore(scrollStop)=${decision.baselineScore} -> candidateScore=${decision.candidateScore} (delta=${decision.scoreDelta})`);
  console.log(`  materialImprovement=${decision.materialImprovement}`);
  for (const r of decision.reasons) console.log(`  reason: ${r}`);
  for (const t of decision.tradeoffs) console.log(`  tradeoff: ${t}`);

  // ==========================================================================
  // Storyboard final (so troca o HOOK se materialImprovement=true)
  // ==========================================================================
  const selectedEvaluation = evaluations.find((e) => e.variantId === decision.selectedVariant);
  const finalStoryboard = decision.materialImprovement ? selectedEvaluation.scoredStoryboard.storyboard : baselineStoryboard;
  const finalScored = decision.materialImprovement ? selectedEvaluation.scoredStoryboard : scoredBaseline;

  writeJson("storyboard-final.json", { storyboard: finalStoryboard, scored: finalScored, hookReplaced: decision.materialImprovement, selectedVariant: decision.selectedVariant });

  console.log(`\n\nSTORYBOARD FINAL: hook ${decision.materialImprovement ? `SUBSTITUIDO por ${decision.selectedVariant}` : "MANTIDO (A_CURRENT, sem melhora material suficiente)"}.`);
  console.log("\nGate final completo:");
  for (const c of finalScored.qualityGate.checks) console.log(`  ${c.status.padEnd(22)} ${c.name} ${c.score !== null ? `(${c.score}/${c.threshold})` : ""}`);

  // ==========================================================================
  // Criterio de prontidao (item 10 do pedido)
  // ==========================================================================
  const gateChecks = finalScored.qualityGate.checks;
  const claimSafety = gateChecks.find((c) => c.name === "CLAIM_SAFETY");
  const scoreThresholdNames = ["BENEFIT_VISUALIZATION", "PURCHASE_MOTIVATION", "DESIRE_SCORE", "HOOK_PERSUASION", "SCROLL_STOP_POWER", "PRODUCT_CONTEXT_RELEVANCE"];
  const scoreThresholdChecks = scoreThresholdNames.map((name) => gateChecks.find((c) => c.name === name));
  const allScoreThresholdsMet = scoreThresholdChecks.every((c) => c.score !== null && c.threshold !== null && c.score >= c.threshold);

  const readyForIntegration =
    groundingGate.downstreamReady &&
    claimSafety.status === "PASS" &&
    allScoreThresholdsMet &&
    finalScored.genericAdRisk.riskLevel !== "HIGH" &&
    (decision.selectedVariant === "A_CURRENT" ? true : decision.materialImprovement);

  console.log(`\nREADY_FOR_PERSUASION_PIPELINE_INTEGRATION = ${readyForIntegration ? "YES" : "NO"}`);
  console.log(`  downstreamReady=${groundingGate.downstreamReady} | claimSafety=${claimSafety.status} | allScoreThresholdsMet=${allScoreThresholdsMet} | genericAdRisk=${finalScored.genericAdRisk.riskLevel} | hookDecisionHonest=true`);
  if (!allScoreThresholdsMet) {
    const failing = scoreThresholdChecks.filter((c) => !(c.score >= c.threshold));
    console.log(`  thresholds nao atingidos: ${failing.map((c) => `${c.name}=${c.score}/${c.threshold}`).join(", ")}`);
  }

  writeJson("dry-run-summary.json", {
    campaignId: CAMPAIGN_ID,
    generatedAt: new Date().toISOString(),
    networkGuardrail: { blockedAttempts },
    writeGuardrail: { writeAttempts },
    phaseB: { categoryPostRepair: rawProductIntelligence.category, groundingGateStatus: groundingGate.status, downstreamReady: groundingGate.downstreamReady },
    phaseC: {
      evaluations: evaluations.map((e) => ({ variantId: e.variantId, metrics: e.metrics, weak: e.weak })),
      decision,
    },
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
