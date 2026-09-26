// Radar Creative AI - COMMERCIAL PERSUASION / DESIRE ENGINE V1 - DRY_RUN real
//
// 100% PLANEJAMENTO/DRY_RUN. ZERO chamada a provider pago (Kling/WAN/
// HeyGen/ElevenLabs/OpenAI), ZERO midia gerada, ZERO alteracao de
// compositor/routing/capability-map/provider-selector/adapters/
// cost-estimator, ZERO escrita no Supabase, ZERO execucao/publicacao/
// aprovacao. Se qualquer host de provider pago for chamado: ABORTAR
// imediatamente (guardrail de rede abaixo, mesmo padrao desta sessao
// inteira).
//
// Roda o Commercial Persuasion / Desire Engine V1 contra a campanha REAL
// Kokeshi (660d53b5-...) como NEGATIVE_PERSUASION_FIXTURE: le
// offer/product_intelligence/creative_brief.commercialDirectionV2 reais
// (so leitura), constroi PersuasionEvidence real (incluindo o
// category-mismatch real e o texto de embalagem observado visualmente nos
// frames reais do CANARY B), adapta CURRENT_V2 e propoe DESIRE_ENGINE_V1,
// pontua os dois com o MESMO scorer, roda os 6 fixtures anti-gaming, e
// salva os 9 artefatos pedidos em temp/commercial-persuasion-v1/.

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

// --- Guardrail de rede -----------------------------------------------------
// SO Supabase pode ser chamado. QUALQUER host de provider pago (incluindo
// os ja usados nesta sessao) e bloqueado de forma absoluta - nao ha
// "submit permitido" nesta tarefa, ao contrario dos canaries anteriores.
const BLOCKED_PROVIDER_HOST_SUBSTRINGS = [
  "api.magnific.com",
  "api.freepik.com",
  "cdn-magnific.freepik.com",
  "heygen.com",
  "elevenlabs.io",
  "api.openai.com",
  "klingai.com",
  "runwayml",
  "replicate",
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

const { buildCampaignPromptPlan } = require("../lib/prompt-builder/prompt-builder.ts");
const { buildNarrationPlan } = require("../lib/commercial-video/narration/narration-script-builder.ts");

const { buildPersuasionEvidence } = require("../lib/commercial-video/persuasion/claim-grounding.ts");
const { buildProductDesireProfile, resolveEffectiveCategory } = require("../lib/commercial-video/persuasion/product-desire-profile.ts");
const { answerPurchaseMotivationQuestions, detectFakeUrgency } = require("../lib/commercial-video/persuasion/purchase-motivation-questions.ts");
const { generateSalesAngleCandidates, selectWinningSalesAngle } = require("../lib/commercial-video/persuasion/sales-angle-engine.ts");
const { buildBenefitVisualizationPlans } = require("../lib/commercial-video/persuasion/benefit-visualization.ts");
const { buildOfferRevealPlan } = require("../lib/commercial-video/persuasion/offer-reveal.ts");
const { buildCtaPersuasionPlan } = require("../lib/commercial-video/persuasion/cta-persuasion.ts");
const { buildNarrationCopyIntentForStoryboard } = require("../lib/commercial-video/persuasion/narration-copy-intent.ts");
const { buildOverlayIntentForStoryboard } = require("../lib/commercial-video/persuasion/overlay-intent.ts");
const { adaptCommercialDirectionV2ToPersuasionStoryboard } = require("../lib/commercial-video/persuasion/current-v2-adapter.ts");
const { buildPersuasionStoryboard } = require("../lib/commercial-video/persuasion/persuasion-storyboard-builder.ts");
const { scoreStoryboard } = require("../lib/commercial-video/persuasion/scorer.ts");
const {
  FIXTURE_A_BEAUTIFUL_BUT_EMPTY,
  FIXTURE_B_UGLY_BUT_PERSUASIVE,
  FIXTURE_B_EVIDENCE,
  FIXTURE_C_EVIDENCE,
  FIXTURE_D_MOTIVATION_ANSWERS,
  FIXTURE_E_DISCONNECTED_CHARACTER,
  FIXTURE_F_REPEATED_PACKSHOT,
  GENERIC_EVIDENCE,
  GENERIC_DESIRE_PROFILE,
  NEUTRAL_MOTIVATION_ANSWERS,
} = require("../lib/commercial-video/persuasion/anti-gaming-fixtures.ts");

const CAMPAIGN_ID = "660d53b5-d3dc-47a5-b031-4d035bfd97a3";
const OUT_DIR = path.join(root, "temp", "commercial-persuasion-v1");

// Texto REAL observado via inspecao visual direta (nesta propria sessao,
// nesta tarefa) de temp/creative-v2-hook-fidelity-canary/frames/frame-0-0pct.png
// (frame 0%, produto real fotografado pelo CANARY B ja pago) - nao OCR
// automatizado (o projeto nao tem essa capacidade hoje), documentado como
// PACKAGING_OBSERVED em vez de inventado.
// Ordem deliberada: claims genuinamente PERSUASIVAS (ingrediente/textura/
// atributo sensorial) primeiro - sao as que buildBenefitVisualizationPlans/
// persuasion-storyboard-builder priorizam (benefitPlans[0]/slice(0,2)) para
// as cenas de HOOK/BENEFIT. Texto puramente descritivo/rotulo (nome do
// produto, categoria de uso, peso liquido) vem por ultimo - real e valido
// como PACKAGING_SUPPORTED, mas nao e um "beneficio" para virar narracao
// falada (evita o bug observado na 1a rodada: personagem "dizendo" apenas
// "FACIAL").
const KOKESHI_OBSERVED_PACKAGING = [
  { text: "ÓLEO DE COPAÍBA", observedVia: "frame-0-0pct.png (CANARY B real, inspecao visual direta nesta tarefa)" },
  { text: "Firmeza", observedVia: "frame-0-0pct.png (CANARY B real, inspecao visual direta nesta tarefa)" },
  { text: "Densidade", observedVia: "frame-0-0pct.png (CANARY B real, inspecao visual direta nesta tarefa)" },
  { text: "Textura leve, rápida absorção", observedVia: "frame-0-0pct.png (CANARY B real, inspecao visual direta nesta tarefa)" },
  { text: "Creme Gel Gota de Colágeno", observedVia: "frame-0-0pct.png (CANARY B real, inspecao visual direta nesta tarefa)" },
  { text: "FACIAL", observedVia: "frame-0-0pct.png (CANARY B real, inspecao visual direta nesta tarefa)" },
  { text: "45g", observedVia: "frame-0-0pct.png (CANARY B real, inspecao visual direta nesta tarefa)" },
];

function resolvePlatform(value) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("reels") || normalized.includes("instagram")) return "INSTAGRAM_REELS";
  if (normalized.includes("meta") || normalized.includes("ads")) return "META_ADS";
  return "TIKTOK";
}

function writeJson(name, data) {
  fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(data, null, 2), "utf8");
  console.log(`  salvo: temp/commercial-persuasion-v1/${name}`);
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("=== COMMERCIAL PERSUASION / DESIRE ENGINE V1 - DRY_RUN (campanha Kokeshi real) ===\n");

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
  if (!v2) throw new Error("ABORTADO: creative_brief.commercialDirectionV2 nao encontrado - esta tarefa nunca recalcula Creative Director V2.");

  const { data: offerRow, error: offerError } = await supabaseAdmin
    .from("offers")
    .select("title,price,original_price,discount_pct,marketplace,rating,reviews_count")
    .eq("id", campaignRow.offer_id)
    .maybeSingle();
  if (offerError) throw new Error(offerError.message);
  if (!offerRow) throw new Error("Oferta da campanha nao encontrada.");

  const { data: piRow, error: piError } = await supabaseAdmin
    .from("product_intelligence")
    .select("category,pain_points,desires,objections,purchase_motivations,key_benefits,emotional_benefits,functional_benefits")
    .eq("offer_id", campaignRow.offer_id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (piError) throw new Error(piError.message);
  if (!piRow) throw new Error("Product Intelligence da campanha nao encontrada.");

  const offer = {
    title: offerRow.title,
    price: offerRow.price,
    originalPrice: offerRow.original_price,
    discountPct: offerRow.discount_pct,
    marketplace: offerRow.marketplace,
    imageUrl: null,
    rating: offerRow.rating,
    reviewsCount: offerRow.reviews_count,
  };
  const productIntelligence = {
    category: piRow.category ?? "geral",
    painPoints: piRow.pain_points ?? [],
    desires: piRow.desires ?? [],
    objections: piRow.objections ?? [],
    purchaseMotivations: piRow.purchase_motivations ?? [],
    keyBenefits: piRow.key_benefits ?? [],
    emotionalBenefits: piRow.emotional_benefits ?? [],
    functionalBenefits: piRow.functional_benefits ?? [],
  };

  console.log(`1) Dados reais carregados: offer.title="${offer.title}", price=${offer.price}, discount_pct=${offer.discountPct}, pi.category="${productIntelligence.category}".`);

  // ==========================================================================
  // 2) NARRACAO REAL (mesma funcao pura usada na EXECUCAO real - nunca
  //    chama ElevenLabs aqui, so recalcula o TEXTO que ja foi sintetizado).
  // ==========================================================================
  const aspectRatio = campaignRow.aspect_ratio || "9:16";
  const platform = resolvePlatform(campaignRow.platform);
  const ctx = { productTitle: offer.title, category: productIntelligence.category, platform, aspectRatio, defaultLogoAssetId: null };
  const promptPlan = buildCampaignPromptPlan(CAMPAIGN_ID, v2.underlyingDirection, ctx, { sceneBlueprints: v2.sceneBlueprints, ctaDirection: v2.ctaDirection });
  const narrationPlan = buildNarrationPlan(
    CAMPAIGN_ID,
    promptPlan,
    { title: offer.title, rating: offer.rating, reviewsCount: offer.reviewsCount },
    { keyBenefits: productIntelligence.keyBenefits },
    productIntelligence.category,
  );
  const realNarrationBySceneId = Object.fromEntries(narrationPlan.scenes.map((s) => [s.sceneId, s.text ?? "(sem narracao)"]));
  console.log(`2) Narracao real recalculada (funcao pura, mesma da EXECUCAO): status=${narrationPlan.status}, ${narrationPlan.scenes.length} cenas.`);

  // ==========================================================================
  // 3) PERSUASION EVIDENCE (claim grounding real, incluindo category-mismatch real)
  // ==========================================================================
  const evidence = buildPersuasionEvidence(offer, productIntelligence, KOKESHI_OBSERVED_PACKAGING);
  writeJson("evidence.json", evidence);
  console.log(`3) PersuasionEvidence: categoryMismatch.detected=${evidence.categoryMismatch.detected}, forbiddenClaims=${evidence.forbiddenClaims.length}, packagingClaims=${evidence.packagingClaims.length}.`);

  // ==========================================================================
  // 4) PRODUCT DESIRE PROFILE + PURCHASE MOTIVATION ANSWERS
  // ==========================================================================
  const effectiveCategory = resolveEffectiveCategory(evidence);
  const desireProfile = buildProductDesireProfile(evidence);
  const motivationAnswers = answerPurchaseMotivationQuestions(evidence, desireProfile);
  const fakeUrgencyCheck = detectFakeUrgency(motivationAnswers);
  writeJson("desire-profile.json", desireProfile);
  writeJson("motivation-answers.json", { motivationAnswers, fakeUrgencyCheck });
  console.log(`4) effectiveCategory="${effectiveCategory}" (declarado="${productIntelligence.category}"). whyBuyNow.confidence=${motivationAnswers.whyBuyNow.confidence}, fakeUrgency.detected=${fakeUrgencyCheck.detected}.`);

  // ==========================================================================
  // 5) SALES ANGLE ENGINE
  // ==========================================================================
  const salesAngleCandidates = generateSalesAngleCandidates(evidence, desireProfile);
  const winningAngle = selectWinningSalesAngle(salesAngleCandidates);
  writeJson("sales-angles.json", { candidates: salesAngleCandidates, winner: winningAngle.angle });
  console.log(`5) SalesAngle vencedor: ${winningAngle.angle} (score=${winningAngle.totalScore}). Elegiveis: ${salesAngleCandidates.filter((c) => c.eligible).map((c) => c.angle).join(", ")}.`);

  // ==========================================================================
  // 6) BENEFIT VISUALIZATION PLANS (base para o novo storyboard)
  // ==========================================================================
  const benefitPlans = buildBenefitVisualizationPlans(evidence, desireProfile);
  console.log(`6) ${benefitPlans.length} BenefitVisualizationPlan(s) reais disponiveis (a partir de packaging/factual claims).`);

  // ==========================================================================
  // 7) OFFER REVEAL + CTA PERSUASION PLAN
  // ==========================================================================
  const offerRevealPlan = buildOfferRevealPlan(evidence);
  const ctaPersuasionPlan = buildCtaPersuasionPlan(offerRevealPlan, "CTA_CLOSER");
  console.log(`7) OfferRevealPlan: discountAllowed=${offerRevealPlan.discountAllowed}, urgencyAllowed=${offerRevealPlan.urgencyAllowed}, priceAnchor=${offerRevealPlan.priceAnchor}.`);

  // ==========================================================================
  // 8) CURRENT_V2 (adaptado, leitura pura) x DESIRE_ENGINE_V1 (novo, DRY_RUN)
  // ==========================================================================
  const currentV2Storyboard = adaptCommercialDirectionV2ToPersuasionStoryboard(v2, effectiveCategory, realNarrationBySceneId);
  const scoredCurrentV2 = scoreStoryboard("CURRENT_V2", currentV2Storyboard, evidence, desireProfile, motivationAnswers);

  const { storyboard: desireStoryboard, structuralLimitation } = buildPersuasionStoryboard({
    evidence,
    desireProfile,
    salesAngle: winningAngle,
    benefitPlans,
    useCharacter: true,
  });
  const scoredDesireV1 = scoreStoryboard("DESIRE_ENGINE_V1", desireStoryboard, evidence, desireProfile, motivationAnswers);

  const desireOverlayIntents = buildOverlayIntentForStoryboard(desireStoryboard.scenes, offerRevealPlan);
  const overlayTextsBySceneId = Object.fromEntries(desireOverlayIntents.map((o) => [o.sceneId, o.text]));
  const desireNarrationIntents = buildNarrationCopyIntentForStoryboard(desireStoryboard.scenes, overlayTextsBySceneId);

  writeJson("current-v2-scored.json", scoredCurrentV2);
  writeJson("desire-engine-v1-scored.json", { ...scoredDesireV1, narrationCopyIntents: desireNarrationIntents, overlayIntents: desireOverlayIntents, structuralLimitation, ctaPersuasionPlan });

  console.log(`8) CURRENT_V2 gate=${scoredCurrentV2.qualityGate.status} | DESIRE_ENGINE_V1 gate=${scoredDesireV1.qualityGate.status}.`);
  console.log(`   purchaseMotivationScore: CURRENT_V2=${scoredCurrentV2.purchaseMotivationScore.score} -> DESIRE_ENGINE_V1=${scoredDesireV1.purchaseMotivationScore.score}.`);
  console.log(`   desireScore: CURRENT_V2=${scoredCurrentV2.desireScore} -> DESIRE_ENGINE_V1=${scoredDesireV1.desireScore}.`);
  console.log(`   structuralLimitation: ${structuralLimitation.code} (desiredSceneCount=${structuralLimitation.desiredSceneCount}, currentSceneCount=${structuralLimitation.currentSceneCount}).`);

  const comparisonDimensions = [
    ["hookPersuasion.score", scoredCurrentV2.hookPersuasion.score, scoredDesireV1.hookPersuasion.score],
    ["scrollStop.score", scoredCurrentV2.scrollStop.score, scoredDesireV1.scrollStop.score],
    ["contextRelevance.score", scoredCurrentV2.contextRelevance.score, scoredDesireV1.contextRelevance.score],
    ["benefitVisualization.score", scoredCurrentV2.benefitVisualization.score, scoredDesireV1.benefitVisualization.score],
    ["emotionalProgression.score", scoredCurrentV2.emotionalProgression.score, scoredDesireV1.emotionalProgression.score],
    ["characterIntegration.score", scoredCurrentV2.characterIntegration.score, scoredDesireV1.characterIntegration.score],
    ["redundancy.score", scoredCurrentV2.redundancy.score, scoredDesireV1.redundancy.score],
    ["purchaseMotivationScore.score", scoredCurrentV2.purchaseMotivationScore.score, scoredDesireV1.purchaseMotivationScore.score],
    ["desireScore", scoredCurrentV2.desireScore, scoredDesireV1.desireScore],
    ["genericAdRisk.riskLevel", scoredCurrentV2.genericAdRisk.riskLevel, scoredDesireV1.genericAdRisk.riskLevel],
    ["qualityGate.status", scoredCurrentV2.qualityGate.status, scoredDesireV1.qualityGate.status],
  ];
  writeJson("comparison.json", {
    dimensions: comparisonDimensions.map(([name, before, after]) => ({ name, CURRENT_V2: before, DESIRE_ENGINE_V1: after })),
    structuralLimitation,
    currentV2GenericAdRiskReasons: scoredCurrentV2.genericAdRisk.reasons,
    desireEngineV1GenericAdRiskReasons: scoredDesireV1.genericAdRisk.reasons,
  });

  // ==========================================================================
  // 9) ANTI-GAMING FIXTURES A-F (item mais importante do pedido)
  // ==========================================================================
  const antiGamingResults = [];

  const scoredFixtureA = scoreStoryboard("FIXTURE_A", FIXTURE_A_BEAUTIFUL_BUT_EMPTY, GENERIC_EVIDENCE, GENERIC_DESIRE_PROFILE, NEUTRAL_MOTIVATION_ANSWERS);
  antiGamingResults.push({
    fixture: "A_BEAUTIFUL_BUT_EMPTY",
    expected: "PERSUASION FAIL",
    qualityGateStatus: scoredFixtureA.qualityGate.status,
    outcome: scoredFixtureA.qualityGate.status === "FAIL" ? "CONFIRMED" : "VIOLATED",
    blockingReasons: scoredFixtureA.qualityGate.blockingReasons,
  });

  const scoredFixtureB = scoreStoryboard("FIXTURE_B", FIXTURE_B_UGLY_BUT_PERSUASIVE, FIXTURE_B_EVIDENCE, GENERIC_DESIRE_PROFILE, NEUTRAL_MOTIVATION_ANSWERS);
  antiGamingResults.push({
    fixture: "B_UGLY_BUT_PERSUASIVE",
    expected: "purchaseMotivationScore substancialmente > A",
    purchaseMotivationScoreA: scoredFixtureA.purchaseMotivationScore.score,
    purchaseMotivationScoreB: scoredFixtureB.purchaseMotivationScore.score,
    outcome: scoredFixtureB.purchaseMotivationScore.score > scoredFixtureA.purchaseMotivationScore.score + 20 ? "CONFIRMED" : "VIOLATED",
  });

  const scoredFixtureC = scoreStoryboard("FIXTURE_C", FIXTURE_B_UGLY_BUT_PERSUASIVE, FIXTURE_C_EVIDENCE, GENERIC_DESIRE_PROFILE, NEUTRAL_MOTIVATION_ANSWERS);
  const claimSafetyCheckC = scoredFixtureC.qualityGate.checks.find((c) => c.name === "CLAIM_SAFETY");
  antiGamingResults.push({
    fixture: "C_UNSUPPORTED_CLAIM",
    expected: "CLAIM_SAFETY FAIL",
    claimSafetyStatus: claimSafetyCheckC.status,
    outcome: claimSafetyCheckC.status === "FAIL" ? "CONFIRMED" : "VIOLATED",
  });

  const scoredFixtureD = scoreStoryboard("FIXTURE_D", FIXTURE_B_UGLY_BUT_PERSUASIVE, FIXTURE_B_EVIDENCE, GENERIC_DESIRE_PROFILE, FIXTURE_D_MOTIVATION_ANSWERS);
  const fakeUrgencyCheckD = scoredFixtureD.qualityGate.checks.find((c) => c.name === "FAKE_URGENCY");
  antiGamingResults.push({
    fixture: "D_FAKE_URGENCY",
    expected: "FAKE_URGENCY FAIL",
    fakeUrgencyStatus: fakeUrgencyCheckD.status,
    outcome: fakeUrgencyCheckD.status === "FAIL" ? "CONFIRMED" : "VIOLATED",
  });

  const scoredFixtureE = scoreStoryboard("FIXTURE_E", FIXTURE_E_DISCONNECTED_CHARACTER, GENERIC_EVIDENCE, GENERIC_DESIRE_PROFILE, NEUTRAL_MOTIVATION_ANSWERS);
  antiGamingResults.push({
    fixture: "E_DISCONNECTED_CHARACTER",
    expected: "CHARACTER_INTEGRATION baixo (disconnected=true)",
    characterIntegrationScore: scoredFixtureE.characterIntegration.score,
    disconnected: scoredFixtureE.characterIntegration.disconnected,
    outcome: scoredFixtureE.characterIntegration.disconnected ? "CONFIRMED" : "VIOLATED",
  });

  const scoredFixtureF = scoreStoryboard("FIXTURE_F", FIXTURE_F_REPEATED_PACKSHOT, GENERIC_EVIDENCE, GENERIC_DESIRE_PROFILE, NEUTRAL_MOTIVATION_ANSWERS);
  antiGamingResults.push({
    fixture: "F_REPEATED_PACKSHOT",
    expected: "PERSUASION_REDUNDANCY alto (score baixo, pares redundantes)",
    redundancyScore: scoredFixtureF.redundancy.score,
    redundantPairsCount: scoredFixtureF.redundancy.redundantPairs.length,
    outcome: scoredFixtureF.redundancy.redundantPairs.length > 0 ? "CONFIRMED" : "VIOLATED",
  });

  writeJson("anti-gaming-results.json", antiGamingResults);
  console.log("\n9) ANTI-GAMING FIXTURES:");
  for (const r of antiGamingResults) console.log(`   ${r.outcome === "CONFIRMED" ? "OK  " : "FAIL"} - ${r.fixture}: esperado "${r.expected}" -> ${r.outcome}`);

  const allAntiGamingConfirmed = antiGamingResults.every((r) => r.outcome === "CONFIRMED");
  const claimSafetyReal = evidence.forbiddenClaims.length > 0 ? "PASS_WITH_OBSERVATIONS_OR_FAIL" : "PASS";
  const realClaimSafetyCheck = scoredCurrentV2.qualityGate.checks.find((c) => c.name === "CLAIM_SAFETY");

  const readyForIntegration =
    realClaimSafetyCheck.status !== "FAIL" &&
    allAntiGamingConfirmed &&
    scoredDesireV1.genericAdRisk.riskLevel !== "HIGH" &&
    scoredDesireV1.qualityGate.status !== "FAIL" &&
    scoredDesireV1.purchaseMotivationScore.score > scoredCurrentV2.purchaseMotivationScore.score;

  console.log(`\n10) READY_FOR_PERSUASION_PIPELINE_INTEGRATION = ${readyForIntegration ? "YES" : "NO"}`);
  console.log(`    (claimSafety(CURRENT_V2)=${realClaimSafetyCheck.status}, antiGamingAllConfirmed=${allAntiGamingConfirmed}, desireEngineV1RiskLevel=${scoredDesireV1.genericAdRisk.riskLevel}, desireEngineV1Gate=${scoredDesireV1.qualityGate.status}, materialImprovement=${scoredDesireV1.purchaseMotivationScore.score > scoredCurrentV2.purchaseMotivationScore.score})`);

  writeJson("dry-run-summary.json", {
    campaignId: CAMPAIGN_ID,
    generatedAt: new Date().toISOString(),
    networkGuardrail: { blockedAttempts, allowedHosts: "supabase apenas" },
    effectiveCategory,
    declaredCategory: productIntelligence.category,
    categoryMismatchDetected: evidence.categoryMismatch.detected,
    winningSalesAngle: winningAngle.angle,
    structuralLimitation,
    currentV2: { qualityGateStatus: scoredCurrentV2.qualityGate.status, purchaseMotivationScore: scoredCurrentV2.purchaseMotivationScore.score, desireScore: scoredCurrentV2.desireScore, genericAdRiskLevel: scoredCurrentV2.genericAdRisk.riskLevel },
    desireEngineV1: { qualityGateStatus: scoredDesireV1.qualityGate.status, purchaseMotivationScore: scoredDesireV1.purchaseMotivationScore.score, desireScore: scoredDesireV1.desireScore, genericAdRiskLevel: scoredDesireV1.genericAdRisk.riskLevel },
    antiGamingAllConfirmed: allAntiGamingConfirmed,
    readyForPersuasionPipelineIntegration: readyForIntegration ? "YES" : "NO",
  });

  console.log(`\nblockedAttempts (rede) = ${blockedAttempts} (esperado 0).`);
  console.log("\n=== FIM DO DRY_RUN - NENHUMA chamada paga, NENHUMA escrita, NENHUM video gerado. ===");
}

main().catch((err) => {
  console.error("\nERRO / ABORTADO:", err.message);
  process.exitCode = 1;
});
