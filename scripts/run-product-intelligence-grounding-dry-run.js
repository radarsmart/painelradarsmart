// Radar Creative AI - PRODUCT INTELLIGENCE GROUNDING & CONTAMINATION GUARD V1
// + DESIRE ENGINE CLEAN RE-EVALUATION - DRY_RUN real
//
// 100% PLANEJAMENTO/DRY_RUN. ZERO chamada a provider pago, ZERO midia
// gerada, ZERO escrita no Supabase (so .select()), ZERO alteracao de
// compositor/routing/capability-map/provider-selector/cost-estimator, ZERO
// integracao ao EXECUTE. Roda a nova camada de grounding contra a campanha
// REAL Kokeshi (660d53b5-...), limpa o Product Intelligence, e reavalia o
// Commercial Persuasion / Desire Engine V1 (lib/commercial-video/
// persuasion/**, NUNCA alterado por esta tarefa) com os dados limpos -
// gera a comparacao tripla CURRENT_V2 x DESIRE_ENGINE_V1_CONTAMINATED x
// DESIRE_ENGINE_V1_GROUNDED.

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

// --- Guardrail de rede: SO Supabase pode ser chamado -----------------------
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

// --- Guardrail de escrita: intercepta o client Supabase para provar que
// nenhum .insert()/.update()/.upsert()/.delete() e chamado nesta tarefa.
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

const { buildGroundedProductIntelligence } = require("../lib/product-intelligence-grounding/grounded-product-intelligence.ts");
const { buildProductIntelligenceGroundingGate } = require("../lib/product-intelligence-grounding/grounding-gate.ts");
const { buildCleanedProductIntelligenceInput } = require("../lib/product-intelligence-grounding/cleaned-input-adapter.ts");
const { buildEnvironmentContaminationTrace } = require("../lib/product-intelligence-grounding/environment-contamination-trace.ts");
const { buildRemoteDataRepairRecommendation, buildKnownCodeDefectFindings } = require("../lib/product-intelligence-grounding/remote-data-repair-recommendation.ts");

const { buildPersuasionEvidence } = require("../lib/commercial-video/persuasion/claim-grounding.ts");
const { buildProductDesireProfile, resolveEffectiveCategory } = require("../lib/commercial-video/persuasion/product-desire-profile.ts");
const { answerPurchaseMotivationQuestions } = require("../lib/commercial-video/persuasion/purchase-motivation-questions.ts");
const { generateSalesAngleCandidates, selectWinningSalesAngle } = require("../lib/commercial-video/persuasion/sales-angle-engine.ts");
const { buildBenefitVisualizationPlans } = require("../lib/commercial-video/persuasion/benefit-visualization.ts");
const { adaptCommercialDirectionV2ToPersuasionStoryboard } = require("../lib/commercial-video/persuasion/current-v2-adapter.ts");
const { buildPersuasionStoryboard } = require("../lib/commercial-video/persuasion/persuasion-storyboard-builder.ts");
const { scoreStoryboard } = require("../lib/commercial-video/persuasion/scorer.ts");
const { PERSUASION_THRESHOLDS } = require("../lib/commercial-video/persuasion/commercial-persuasion-quality-gate.ts");

const CAMPAIGN_ID = "660d53b5-d3dc-47a5-b031-4d035bfd97a3";
const OUT_DIR = path.join(root, "temp", "product-intelligence-grounding-v1");

// Texto REAL observado via inspecao visual direta (mesma fonte ja usada na
// tarefa anterior - frame real do CANARY B pago, nunca re-observado aqui).
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
  console.log(`  salvo: temp/product-intelligence-grounding-v1/${name}`);
}

// Roda o pipeline de persuasion completo (evidence -> desireProfile ->
// motivationAnswers -> salesAngle -> benefitPlans) sobre um
// ProductIntelligenceInput qualquer - reusado para o lado CONTAMINATED
// (raw) e para o lado GROUNDED (limpo), garantindo comparacao justa (mesmo
// codigo dos dois lados, so o dado de entrada muda).
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

  console.log("=== PRODUCT INTELLIGENCE GROUNDING & CONTAMINATION GUARD V1 - DRY_RUN (campanha Kokeshi real) ===\n");

  // ==========================================================================
  // 1) CARREGAR DADOS REAIS (SO LEITURA)
  // ==========================================================================
  const { data: campaignRow, error: campaignError } = await supabaseAdmin
    .from("creative_campaigns")
    .select("id,name,offer_id,aspect_ratio,platform,creative_brief")
    .eq("id", CAMPAIGN_ID)
    .maybeSingle();
  if (campaignError) throw new Error(campaignError.message);
  if (!campaignRow) throw new Error(`Campanha ${CAMPAIGN_ID} nao encontrada.`);

  const v2 = campaignRow.creative_brief && campaignRow.creative_brief.commercialDirectionV2;
  if (!v2) throw new Error("ABORTADO: creative_brief.commercialDirectionV2 nao encontrado.");

  const { data: offerRow, error: offerError } = await supabaseAdmin
    .from("offers")
    .select("title,price,original_price,discount_pct,marketplace,rating,reviews_count")
    .eq("id", campaignRow.offer_id)
    .maybeSingle();
  if (offerError) throw new Error(offerError.message);

  const { data: piRow, error: piError } = await supabaseAdmin
    .from("product_intelligence")
    .select("id,category,pain_points,desires,objections,purchase_motivations,key_benefits,emotional_benefits,functional_benefits,source,model")
    .eq("offer_id", campaignRow.offer_id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (piError) throw new Error(piError.message);
  if (!piRow) throw new Error("Product Intelligence da campanha nao encontrada.");

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

  console.log(`1) Dados reais carregados: offer.title="${offer.title}", product_intelligence.id=${piRow.id}, category="${rawProductIntelligence.category}", source="${piRow.source ?? "null"}", model="${piRow.model ?? "null"}".`);
  const sourceConfirmsAnalyzeTs = piRow.source === "mock" && piRow.model === "product-intelligence-rules-v1";
  console.log(`   Provenance confirma lib/product-intelligence/analyze.ts como gerador real deste registro: ${sourceConfirmsAnalyzeTs}.`);

  // ==========================================================================
  // 2) PRODUCT INTELLIGENCE GROUNDING (a camada nova desta tarefa)
  // ==========================================================================
  const grounded = buildGroundedProductIntelligence(offer, rawProductIntelligence, KOKESHI_OBSERVED_PACKAGING);
  writeJson("product-identity-profile.json", grounded.identity);
  writeJson("category-grounding.json", grounded.categoryGrounding);
  writeJson("claim-grounding.json", { allClaims: grounded.allClaims, trustedClaims: grounded.trustedClaims, quarantinedClaims: grounded.quarantinedClaims, unknownClaims: grounded.unknownClaims });
  writeJson("contamination-report.json", grounded.contamination);
  writeJson("grounded-product-intelligence.json", grounded);

  console.log(`\n2) ProductIdentityProfile: identityClusters=${grounded.identity.identityClusters.join(", ")}, confidence=${grounded.identity.confidence}.`);
  console.log(`   CategoryGrounding: status=${grounded.categoryGrounding.status}, groundedCategoryProposal=${grounded.categoryGrounding.groundedCategoryProposal}.`);
  console.log(`   Claims: ${grounded.trustedClaims.length} trusted, ${grounded.quarantinedClaims.length} quarantined, ${grounded.unknownClaims.length} unknown (total=${grounded.allClaims.length}).`);
  console.log(`   ContaminationScore: ${grounded.contamination.score}/100 (groundingQuality=${grounded.groundingQuality}).`);

  const groundingGate = buildProductIntelligenceGroundingGate(grounded);
  writeJson("grounding-quality-gate.json", groundingGate);
  console.log(`\n   ProductIntelligenceGroundingGate: status=${groundingGate.status}, downstreamReady=${groundingGate.downstreamReady}.`);
  for (const c of groundingGate.checks) console.log(`     ${c.status.padEnd(22)} ${c.name}`);

  // ==========================================================================
  // 3) ENVIRONMENT CONTAMINATION TRACE (prova a cadeia real via codigo)
  // ==========================================================================
  const realEnvironmentDescriptions = v2.sceneBlueprints.map((s) => s.environmentDirection);
  const trace = buildEnvironmentContaminationTrace({
    declaredCategory: rawProductIntelligence.category,
    categoryGrounding: grounded.categoryGrounding,
    contaminatedClaims: grounded.quarantinedClaims,
    realVisualWorld: v2.visualWorld,
    realEnvironmentDescriptions,
  });
  writeJson("environment-contamination-trace.json", trace);
  console.log(`\n3) EnvironmentContaminationTrace: proven=${trace.proven}.`);
  console.log(`   ${trace.conclusion}`);

  // ==========================================================================
  // 4) REMOTE DATA REPAIR RECOMMENDATION + CODE DEFECT FINDING (nunca executados)
  // ==========================================================================
  const repairRecommendation = buildRemoteDataRepairRecommendation(piRow.id, grounded);
  const codeDefectFindings = buildKnownCodeDefectFindings();
  writeJson("remote-data-repair-recommendation.json", { repairRecommendation, codeDefectFindings });
  console.log(`\n4) RemoteDataRepairRecommendation: ${repairRecommendation ? `proposto (category "${repairRecommendation.currentValue.category}" -> "${repairRecommendation.proposedValue.category}"), executed=${repairRecommendation.executed}` : "nenhum (categoria nao CONTRADICTED)"}.`);
  console.log(`   CodeDefectFindings: ${codeDefectFindings.length} achado(s), todos executed=false.`);

  // ==========================================================================
  // 5) CLEANED INPUT (usado so pelo lado GROUNDED da comparacao)
  // ==========================================================================
  const cleanedProductIntelligence = buildCleanedProductIntelligenceInput(grounded);
  console.log(`\n5) Cleaned ProductIntelligenceInput: category="${cleanedProductIntelligence.category}" (era "${rawProductIntelligence.category}").`);

  // ==========================================================================
  // 6) NARRACAO REAL (mesma funcao pura da EXECUCAO - usada so para adaptar CURRENT_V2)
  // ==========================================================================
  const aspectRatio = campaignRow.aspect_ratio || "9:16";
  const platform = resolvePlatform(campaignRow.platform);
  const ctx = { productTitle: offer.title, category: rawProductIntelligence.category, platform, aspectRatio, defaultLogoAssetId: null };
  const promptPlan = buildCampaignPromptPlan(CAMPAIGN_ID, v2.underlyingDirection, ctx, { sceneBlueprints: v2.sceneBlueprints, ctaDirection: v2.ctaDirection });
  const narrationPlan = buildNarrationPlan(CAMPAIGN_ID, promptPlan, { title: offer.title, rating: offer.rating, reviewsCount: offer.reviewsCount }, { keyBenefits: rawProductIntelligence.keyBenefits }, rawProductIntelligence.category);
  const realNarrationBySceneId = Object.fromEntries(narrationPlan.scenes.map((s) => [s.sceneId, s.text ?? "(sem narracao)"]));

  // ==========================================================================
  // 7) TRES PIPELINES DE PERSUASION (mesmo codigo, dados diferentes)
  // ==========================================================================
  const contaminated = runPersuasionPipeline(offer, rawProductIntelligence, KOKESHI_OBSERVED_PACKAGING);
  const cleanRun = runPersuasionPipeline(offer, cleanedProductIntelligence, KOKESHI_OBSERVED_PACKAGING);

  const currentV2Storyboard = adaptCommercialDirectionV2ToPersuasionStoryboard(v2, contaminated.effectiveCategory, realNarrationBySceneId);
  const scoredCurrentV2 = scoreStoryboard("CURRENT_V2", currentV2Storyboard, contaminated.evidence, contaminated.desireProfile, contaminated.motivationAnswers);

  const { storyboard: contaminatedStoryboard } = buildPersuasionStoryboard({ evidence: contaminated.evidence, desireProfile: contaminated.desireProfile, salesAngle: contaminated.winningAngle, benefitPlans: contaminated.benefitPlans, useCharacter: true });
  const scoredContaminated = scoreStoryboard("DESIRE_ENGINE_V1_CONTAMINATED", contaminatedStoryboard, contaminated.evidence, contaminated.desireProfile, contaminated.motivationAnswers);

  const { storyboard: groundedStoryboard, structuralLimitation } = buildPersuasionStoryboard({ evidence: cleanRun.evidence, desireProfile: cleanRun.desireProfile, salesAngle: cleanRun.winningAngle, benefitPlans: cleanRun.benefitPlans, useCharacter: true });
  const scoredGrounded = scoreStoryboard("DESIRE_ENGINE_V1_GROUNDED", groundedStoryboard, cleanRun.evidence, cleanRun.desireProfile, cleanRun.motivationAnswers);

  writeJson("desire-grounded-storyboard.json", { storyboard: groundedStoryboard, scored: scoredGrounded, structuralLimitation, winningSalesAngle: cleanRun.winningAngle.angle });

  console.log(`\n6) effectiveCategory (contaminated pipeline)="${contaminated.effectiveCategory}", effectiveCategory (grounded pipeline)="${cleanRun.effectiveCategory}".`);
  console.log(`   Sales angle vencedor CONTAMINATED=${contaminated.winningAngle.angle} (score=${contaminated.winningAngle.totalScore}) | GROUNDED=${cleanRun.winningAngle.angle} (score=${cleanRun.winningAngle.totalScore}).`);

  console.log(`\n7) CURRENT_V2 gate=${scoredCurrentV2.qualityGate.status} | DESIRE_ENGINE_V1_CONTAMINATED gate=${scoredContaminated.qualityGate.status} | DESIRE_ENGINE_V1_GROUNDED gate=${scoredGrounded.qualityGate.status}`);
  console.log(`   purchaseMotivationScore: CURRENT_V2=${scoredCurrentV2.purchaseMotivationScore.score} | CONTAMINATED=${scoredContaminated.purchaseMotivationScore.score} | GROUNDED=${scoredGrounded.purchaseMotivationScore.score}`);
  console.log(`   desireScore: CURRENT_V2=${scoredCurrentV2.desireScore} | CONTAMINATED=${scoredContaminated.desireScore} | GROUNDED=${scoredGrounded.desireScore}`);
  console.log(`   benefitVisualization: CURRENT_V2=${scoredCurrentV2.benefitVisualization.score} | CONTAMINATED=${scoredContaminated.benefitVisualization.score} | GROUNDED=${scoredGrounded.benefitVisualization.score}`);

  // ==========================================================================
  // 8) COMPARACAO TRIPLA
  // ==========================================================================
  const dims = [
    ["hookPersuasion.score", scoredCurrentV2.hookPersuasion.score, scoredContaminated.hookPersuasion.score, scoredGrounded.hookPersuasion.score],
    ["scrollStop.score", scoredCurrentV2.scrollStop.score, scoredContaminated.scrollStop.score, scoredGrounded.scrollStop.score],
    ["contextRelevance.score", scoredCurrentV2.contextRelevance.score, scoredContaminated.contextRelevance.score, scoredGrounded.contextRelevance.score],
    ["benefitVisualization.score", scoredCurrentV2.benefitVisualization.score, scoredContaminated.benefitVisualization.score, scoredGrounded.benefitVisualization.score],
    ["purchaseMotivationScore.score", scoredCurrentV2.purchaseMotivationScore.score, scoredContaminated.purchaseMotivationScore.score, scoredGrounded.purchaseMotivationScore.score],
    ["emotionalProgression.score", scoredCurrentV2.emotionalProgression.score, scoredContaminated.emotionalProgression.score, scoredGrounded.emotionalProgression.score],
    ["persuasionRedundancy.score", scoredCurrentV2.redundancy.score, scoredContaminated.redundancy.score, scoredGrounded.redundancy.score],
    ["characterIntegration.score", scoredCurrentV2.characterIntegration.score, scoredContaminated.characterIntegration.score, scoredGrounded.characterIntegration.score],
    ["desireScore", scoredCurrentV2.desireScore, scoredContaminated.desireScore, scoredGrounded.desireScore],
    ["genericAdRisk.riskLevel", scoredCurrentV2.genericAdRisk.riskLevel, scoredContaminated.genericAdRisk.riskLevel, scoredGrounded.genericAdRisk.riskLevel],
    ["qualityGate.status", scoredCurrentV2.qualityGate.status, scoredContaminated.qualityGate.status, scoredGrounded.qualityGate.status],
  ];
  const tripleComparison = {
    dimensions: dims.map(([name, cv2, contam, ground]) => ({ name, CURRENT_V2: cv2, DESIRE_ENGINE_V1_CONTAMINATED: contam, DESIRE_ENGINE_V1_GROUNDED: ground })),
    structuralLimitation,
    contaminatedGenericAdRiskReasons: scoredContaminated.genericAdRisk.reasons,
    groundedGenericAdRiskReasons: scoredGrounded.genericAdRisk.reasons,
  };
  writeJson("triple-comparison.json", tripleComparison);

  // ==========================================================================
  // 9) DIAGNOSTICO: se GROUNDED ainda falhar, separar DATA/ENGINE/PRODUCT/OFFER/STORYBOARD limitation
  // ==========================================================================
  const groundedFailedChecks = scoredGrounded.qualityGate.checks.filter((c) => c.status === "FAIL");
  const diagnostic = groundedFailedChecks.map((c) => ({
    check: c.name,
    score: c.score,
    threshold: c.threshold,
    likelyLimitation:
      c.name === "BENEFIT_VISUALIZATION"
        ? "ENGINE_LIMITATION (classificador penaliza PACKSHOT em cenas OFFER/CTA independente da finalidade da cena - ver Fase F, item 10 do relatorio anterior)."
        : c.name === "PURCHASE_MOTIVATION"
          ? "DATA_LIMITATION + PRODUCT_LIMITATION (sem consumerProblem real disponivel mesmo apos limpeza - produto sem pain point confiavel na base para nenhuma categoria)."
          : "A investigar.",
  }));

  const groundingStatus = groundingGate.status;
  const readyForIntegration =
    groundingGate.downstreamReady &&
    scoredGrounded.qualityGate.checks.find((c) => c.name === "CLAIM_SAFETY").status !== "FAIL" &&
    scoredGrounded.qualityGate.status !== "FAIL" &&
    scoredGrounded.genericAdRisk.riskLevel !== "HIGH" &&
    scoredGrounded.purchaseMotivationScore.score > scoredContaminated.purchaseMotivationScore.score;

  console.log(`\n8) PRODUCT_INTELLIGENCE_GROUNDING_STATUS = ${groundingStatus}`);
  console.log(`   READY_FOR_PERSUASION_PIPELINE_INTEGRATION = ${readyForIntegration ? "YES" : "NO"}`);
  console.log(`   Diagnostico (checks GROUNDED que ainda falham): ${JSON.stringify(diagnostic, null, 2)}`);

  writeJson("dry-run-summary.json", {
    campaignId: CAMPAIGN_ID,
    generatedAt: new Date().toISOString(),
    networkGuardrail: { blockedAttempts, allowedHosts: "supabase apenas" },
    writeGuardrail: { writeAttempts, note: "supabaseAdmin.from().insert/update/upsert/delete lancam erro se chamados" },
    sourceConfirmsAnalyzeTs,
    grounding: { status: groundingStatus, downstreamReady: groundingGate.downstreamReady, contaminationScore: grounded.contamination.score, groundingQuality: grounded.groundingQuality },
    triple: {
      currentV2: { gate: scoredCurrentV2.qualityGate.status, purchaseMotivation: scoredCurrentV2.purchaseMotivationScore.score, desireScore: scoredCurrentV2.desireScore },
      contaminated: { gate: scoredContaminated.qualityGate.status, purchaseMotivation: scoredContaminated.purchaseMotivationScore.score, desireScore: scoredContaminated.desireScore },
      grounded: { gate: scoredGrounded.qualityGate.status, purchaseMotivation: scoredGrounded.purchaseMotivationScore.score, desireScore: scoredGrounded.desireScore },
    },
    diagnostic,
    readyForPersuasionPipelineIntegration: readyForIntegration ? "YES" : "NO",
  });

  console.log(`\nblockedAttempts (rede) = ${blockedAttempts} (esperado 0). writeAttempts (Supabase) = ${writeAttempts} (esperado 0).`);
  console.log("\n=== FIM DO DRY_RUN - NENHUMA chamada paga, NENHUMA escrita, NENHUM video gerado. ===");
}

main().catch((err) => {
  console.error("\nERRO / ABORTADO:", err.message);
  process.exitCode = 1;
});
