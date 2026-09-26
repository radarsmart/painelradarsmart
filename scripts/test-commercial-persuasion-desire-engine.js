// Radar Creative AI - COMMERCIAL PERSUASION / DESIRE ENGINE V1 - Test Suite
//
// Cobre claim grounding/category mismatch, desire profile, sales angle
// engine, os scorers individuais, o gate final e (o mais importante, item
// 28 do pedido) os 6 fixtures ANTI-GAMING - provam que "bonito e vazio"
// reprova, "simples e persuasivo" pontua muito mais alto, claim sem
// evidencia/urgencia fabricada/apresentadora desconectada/packshot
// repetido sao todos detectados. Mesmo padrao dos scripts anteriores: sem
// Jest, transpile on-the-fly, fetch bloqueado.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

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

let fetchCalls = 0;
global.fetch = async () => {
  fetchCalls += 1;
  throw new Error("External calls are forbidden in this test.");
};

const { detectCategoryMismatch, buildPersuasionEvidence } = require("../lib/commercial-video/persuasion/claim-grounding.ts");
const { buildProductDesireProfile, resolveEffectiveCategory } = require("../lib/commercial-video/persuasion/product-desire-profile.ts");
const { answerPurchaseMotivationQuestions, detectFakeUrgency } = require("../lib/commercial-video/persuasion/purchase-motivation-questions.ts");
const { generateSalesAngleCandidates, selectWinningSalesAngle } = require("../lib/commercial-video/persuasion/sales-angle-engine.ts");
const { scoreHookPersuasion, generateHookConcepts } = require("../lib/commercial-video/persuasion/hook-persuasion-engine.ts");
const { scoreScrollStop } = require("../lib/commercial-video/persuasion/scroll-stop-engine.ts");
const { scoreBenefitVisualization, buildBenefitVisualizationPlans } = require("../lib/commercial-video/persuasion/benefit-visualization.ts");
const { scoreProductContextRelevance } = require("../lib/commercial-video/persuasion/product-context-relevance.ts");
const { buildPersuasionArc } = require("../lib/commercial-video/persuasion/persuasion-arc.ts");
const { scoreEmotionalProgression } = require("../lib/commercial-video/persuasion/emotional-progression.ts");
const { scorePersuasionRedundancy } = require("../lib/commercial-video/persuasion/persuasion-redundancy.ts");
const { scoreCharacterIntegration } = require("../lib/commercial-video/persuasion/character-integration.ts");
const { assessGenericAiAdRiskV2 } = require("../lib/commercial-video/persuasion/generic-ai-ad-risk-v2.ts");
const { buildOfferRevealPlan } = require("../lib/commercial-video/persuasion/offer-reveal.ts");
const { buildCtaPersuasionPlan } = require("../lib/commercial-video/persuasion/cta-persuasion.ts");
const { computeDesireScore } = require("../lib/commercial-video/persuasion/desire-score.ts");
const { computePurchaseMotivationScore } = require("../lib/commercial-video/persuasion/purchase-motivation-score.ts");
const { buildCommercialPersuasionQualityGate, PERSUASION_THRESHOLDS } = require("../lib/commercial-video/persuasion/commercial-persuasion-quality-gate.ts");
const { scoreStoryboard } = require("../lib/commercial-video/persuasion/scorer.ts");
const { buildPersuasionStoryboard } = require("../lib/commercial-video/persuasion/persuasion-storyboard-builder.ts");
const { adaptCommercialDirectionV2ToPersuasionStoryboard } = require("../lib/commercial-video/persuasion/current-v2-adapter.ts");
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

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (err) {
    results.push({ name, status: "FAIL", error: err.message });
  }
}

// Dados REAIS da campanha Kokeshi (ja verificados nesta sessao via query
// direta ao Supabase - reproduzidos aqui como fixture de teste, nao
// re-consultados).
const KOKESHI_OFFER = {
  title: "Creme Gel Regenerador Facial Gota de Colágeno Kokeshi",
  price: 13.16,
  originalPrice: null,
  discountPct: 0,
  marketplace: "tiktokshop",
  imageUrl: "https://p16-oec-sg.ibyteimg.com/x.png",
  rating: null,
  reviewsCount: null,
};
const KOKESHI_PI = {
  category: "suplementos",
  painPoints: ["falta de energia ou resultado lento no treino", "dificuldade de manter consistencia na rotina", "preco alto dos suplementos de marca conhecida"],
  desires: ["ver resultado fisico mais rapido", "ter mais disposicao no dia a dia", "economizar sem abrir mao de qualidade"],
  objections: ["duvida se funciona de verdade", "medo de efeito colateral ou produto sem procedencia", "achar caro para testar sem garantia"],
  purchaseMotivations: ["prova social (avaliacoes)", "preco abaixo do usual", "urgencia de estoque"],
  keyBenefits: ["praticidade no consumo diario"],
  emotionalBenefits: ["confianca no proprio corpo", "sensacao de disciplina e progresso"],
  functionalBenefits: ["mais energia", "recuperacao muscular", "suporte nutricional"],
};
const KOKESHI_PACKAGING_OBSERVED = [
  { text: "Creme Gel Gota de Colageno", observedVia: "frame real do CANARY (contact sheet)" },
  { text: "Facial", observedVia: "frame real do CANARY (contact sheet)" },
  { text: "Oleo de Copaiba", observedVia: "frame real do CANARY (contact sheet)" },
  { text: "Textura leve, rapida absorcao", observedVia: "frame real do CANARY (contact sheet)" },
];

async function run() {
  // ===================== CLAIM GROUNDING / CATEGORY MISMATCH =====================

  await test("1 - detectCategoryMismatch detecta o caso real Kokeshi (facial vs suplementos)", async () => {
    const finding = detectCategoryMismatch(KOKESHI_OFFER.title, KOKESHI_PI.category, [...KOKESHI_PI.painPoints, ...KOKESHI_PI.functionalBenefits]);
    assert.equal(finding.detected, true);
    assert.ok(finding.signalKeywordsInTitle.includes("facial"));
    assert.ok(finding.mismatchKeywordsInProductIntelligence.length > 0);
  });

  await test("2 - detectCategoryMismatch NAO dispara para categoria consistente", async () => {
    const finding = detectCategoryMismatch("Whey Protein 900g", "suplementos", ["mais energia", "recuperacao muscular"]);
    assert.equal(finding.detected, false);
  });

  let kokeshiEvidence;
  await test("3 - buildPersuasionEvidence marca TODO pain_points/functional_benefits como FORBIDDEN quando ha mismatch", async () => {
    kokeshiEvidence = buildPersuasionEvidence(KOKESHI_OFFER, KOKESHI_PI, KOKESHI_PACKAGING_OBSERVED);
    assert.equal(kokeshiEvidence.categoryMismatch.detected, true);
    assert.ok(kokeshiEvidence.forbiddenClaims.length >= KOKESHI_PI.painPoints.length + KOKESHI_PI.functionalBenefits.length);
    assert.equal(kokeshiEvidence.unknownClaims.filter((c) => c.text.includes("treino")).length, 0, "nenhuma claim de treino deveria escapar para unknownClaims");
  });

  await test("4 - packagingClaims reais (observadas) continuam PACKAGING_SUPPORTED mesmo com mismatch", async () => {
    assert.equal(kokeshiEvidence.packagingClaims.length, KOKESHI_PACKAGING_OBSERVED.length);
    assert.ok(kokeshiEvidence.packagingClaims.every((c) => c.status === "PACKAGING_SUPPORTED"));
  });

  await test("5 - discount_pct=0 vira claim FACTUAL honesta (nunca 0% OFF)", async () => {
    const discountClaim = kokeshiEvidence.factualClaims.find((c) => c.id === "fact-discount");
    assert.ok(discountClaim.text.toLowerCase().includes("sem desconto"));
  });

  // ===================== PRODUCT DESIRE PROFILE =====================

  let kokeshiDesireProfile;
  await test("6 - resolveEffectiveCategory corrige suplementos->beleza quando ha mismatch", async () => {
    assert.equal(resolveEffectiveCategory(kokeshiEvidence), "beleza");
  });

  await test("7 - buildProductDesireProfile NUNCA usa pain_points da categoria errada (consumerProblem=null)", async () => {
    kokeshiDesireProfile = buildProductDesireProfile(kokeshiEvidence);
    assert.equal(kokeshiDesireProfile.consumerProblem, null);
    assert.equal(kokeshiDesireProfile.productCategory, "beleza");
  });

  await test("8 - primaryDesire vem de packaging real, nunca de product_intelligence errado", async () => {
    assert.equal(kokeshiDesireProfile.primaryDesire.source, "PACKAGING");
  });

  // ===================== PURCHASE MOTIVATION QUESTIONS =====================

  let kokeshiMotivationAnswers;
  await test("9 - whyBuyNow nunca inventa urgencia (confidence=LOW, nenhuma claim de urgencia afirmativa)", async () => {
    kokeshiMotivationAnswers = answerPurchaseMotivationQuestions(kokeshiEvidence, kokeshiDesireProfile);
    assert.equal(kokeshiMotivationAnswers.whyBuyNow.confidence, "LOW");
    assert.equal(detectFakeUrgency(kokeshiMotivationAnswers).detected, false);
  });

  await test("10 - detectFakeUrgency NAO dispara para a resposta real (honesta) do Kokeshi", async () => {
    const result = detectFakeUrgency(kokeshiMotivationAnswers);
    assert.equal(result.detected, false);
  });

  await test("11 - detectFakeUrgency DISPARA para o fixture D (urgencia fabricada)", async () => {
    const result = detectFakeUrgency(FIXTURE_D_MOTIVATION_ANSWERS);
    assert.equal(result.detected, true);
  });

  // ===================== SALES ANGLE ENGINE =====================

  let salesAngleCandidates;
  let winningAngle;
  await test("12 - SOCIAL_PROOF nunca elegivel sem rating/reviewsCount reais", async () => {
    salesAngleCandidates = generateSalesAngleCandidates(kokeshiEvidence, kokeshiDesireProfile);
    const socialProof = salesAngleCandidates.find((c) => c.angle === "SOCIAL_PROOF");
    assert.equal(socialProof.eligible, false);
  });

  await test("13 - BEFORE_AFTER_CONCEPT e CATEGORY_COMPARISON nunca elegiveis (sem evidencia)", async () => {
    assert.equal(salesAngleCandidates.find((c) => c.angle === "BEFORE_AFTER_CONCEPT").eligible, false);
    assert.equal(salesAngleCandidates.find((c) => c.angle === "CATEGORY_COMPARISON").eligible, false);
  });

  await test("14 - selectWinningSalesAngle escolhe um angulo elegivel com evidencia real", async () => {
    winningAngle = selectWinningSalesAngle(salesAngleCandidates);
    assert.equal(winningAngle.eligible, true);
    assert.ok(["PRICE_DISCOVERY", "DEMONSTRATION", "INGREDIENT_STORY", "SURPRISING_FIND", "PRODUCT_DISCOVERY", "VALUE_FOR_MONEY"].includes(winningAngle.angle));
  });

  await test("15 - PRICE_DISCOVERY pontua alto (preco real R$13,16 < R$30)", async () => {
    const priceDiscovery = salesAngleCandidates.find((c) => c.angle === "PRICE_DISCOVERY");
    assert.ok(priceDiscovery.relevanceScore >= 80);
  });

  // ===================== HOOK / SCROLL-STOP =====================

  await test("16 - generateHookConcepts inclui um conceito grounded com preco real", async () => {
    const concepts = generateHookConcepts(kokeshiEvidence, kokeshiDesireProfile);
    assert.ok(concepts.some((c) => c.grounded && c.concept.includes("13,16")));
  });

  await test("17 - scoreHookPersuasion penaliza FLOATING_HERO sem beneficio/ambiente relacionado", async () => {
    const badHookScene = {
      sceneId: "h1", order: 1, purpose: "HOOK", durationSecondsHint: 2, arcStage: "ATTENTION", productVisualRole: "FLOATING_HERO",
      productInteraction: "NONE", environmentDescription: "academia", environmentRelevance: "UNRELATED_ASPIRATIONAL", environmentJustification: null,
      characterNarrativeRole: "NONE", characterPerformanceIntent: null, benefitClaimId: null, salesAngleAlignment: false, offerRole: "NONE", ctaRole: "NONE",
      overlayCategories: [], whyContinueWatching: "produto bonito", narrationIntent: "x", suggestedNarration: "x", visualConcept: "x", consumerState: "x", persuasionObjective: "x",
    };
    const result = scoreHookPersuasion({ hookScene: badHookScene, evidence: kokeshiEvidence, desireProfile: kokeshiDesireProfile });
    assert.ok(result.signals.dependsOnlyOnAesthetics);
    assert.ok(result.signals.genericAdRisk);
    assert.ok(result.score < 60);
  });

  // ===================== BENEFIT VISUALIZATION / CONTEXT RELEVANCE =====================

  let kokeshiBenefitPlans;
  await test("18 - buildBenefitVisualizationPlans usa so packaging claims reais", async () => {
    kokeshiBenefitPlans = buildBenefitVisualizationPlans(kokeshiEvidence, kokeshiDesireProfile);
    assert.ok(kokeshiBenefitPlans.length >= KOKESHI_PACKAGING_OBSERVED.length);
    assert.ok(kokeshiBenefitPlans.every((p) => p.evidence.status === "PACKAGING_SUPPORTED" || p.evidence.status === "FACTUAL"));
  });

  await test("19 - scoreBenefitVisualization penaliza storyboard so-packshot (fixture A)", async () => {
    const result = scoreBenefitVisualization(FIXTURE_A_BEAUTIFUL_BUT_EMPTY.scenes);
    assert.ok(result.packshotRatio >= 0.8);
    assert.ok(result.score < 30);
  });

  await test("20 - scoreProductContextRelevance identifica UNRELATED_ASPIRATIONAL no fixture A", async () => {
    const result = scoreProductContextRelevance(FIXTURE_A_BEAUTIFUL_BUT_EMPTY.scenes);
    assert.ok(result.perScene.filter((s) => s.relevance === "UNRELATED_ASPIRATIONAL").length >= 3);
    assert.ok(result.score < 60);
  });

  // ===================== ARC / EMOTIONAL / REDUNDANCY =====================

  await test("21 - buildPersuasionArc detecta estagios ausentes no fixture F (tudo ATTENTION)", async () => {
    const result = buildPersuasionArc(FIXTURE_F_REPEATED_PACKSHOT.scenes);
    assert.ok(result.missingStages.length >= 3);
  });

  await test("22 - scoreEmotionalProgression detecta flatline no fixture F", async () => {
    const result = scoreEmotionalProgression(FIXTURE_F_REPEATED_PACKSHOT.scenes);
    assert.equal(result.flatline, true);
    assert.ok(result.score < 30);
  });

  await test("23 - scorePersuasionRedundancy detecta pares redundantes no fixture F (packshot repetido)", async () => {
    const result = scorePersuasionRedundancy(FIXTURE_F_REPEATED_PACKSHOT.scenes);
    assert.ok(result.redundantPairs.length > 0);
    assert.ok(result.score < 70);
  });

  await test("24 - scorePersuasionRedundancy NAO penaliza o fixture B (beneficio distinto por cena)", async () => {
    const result = scorePersuasionRedundancy(FIXTURE_B_UGLY_BUT_PERSUASIVE.scenes);
    assert.equal(result.redundantPairs.length, 0);
  });

  // ===================== CHARACTER INTEGRATION =====================

  await test("25 - scoreCharacterIntegration detecta DISCONNECTED_PRESENTER no fixture E", async () => {
    const result = scoreCharacterIntegration(FIXTURE_E_DISCONNECTED_CHARACTER.scenes);
    assert.equal(result.disconnected, true);
    assert.ok(result.score < 40);
  });

  await test("26 - scoreCharacterIntegration = 100/N-A quando nenhuma cena usa personagem", async () => {
    const result = scoreCharacterIntegration(FIXTURE_A_BEAUTIFUL_BUT_EMPTY.scenes);
    assert.equal(result.disconnected, false);
    assert.equal(result.score, 100);
  });

  // ===================== OFFER REVEAL / CTA PERSUASION =====================

  await test("27 - buildOfferRevealPlan NUNCA permite discount/urgencia sem evidencia real (Kokeshi discount_pct=0)", async () => {
    const plan = buildOfferRevealPlan(kokeshiEvidence);
    assert.equal(plan.discountAllowed, false);
    assert.equal(plan.urgencyAllowed, false);
    assert.equal(plan.priceAnchor, "NONE_AVAILABLE");
  });

  await test("28 - buildCtaPersuasionPlan nunca permite secondaryMessage (foco unico)", async () => {
    const offerPlan = buildOfferRevealPlan(kokeshiEvidence);
    const ctaPlan = buildCtaPersuasionPlan(offerPlan, "CTA_CLOSER");
    assert.equal(ctaPlan.secondaryMessageAllowed, false);
  });

  // ===================== ANTI-GAMING: FIXTURES A x B via scorer.ts completo =====================

  let scoredA;
  let scoredB;
  await test("29 - FIXTURE A (BEAUTIFUL_BUT_EMPTY) reprova o Commercial Persuasion Quality Gate", async () => {
    scoredA = scoreStoryboard("FIXTURE_A", FIXTURE_A_BEAUTIFUL_BUT_EMPTY, GENERIC_EVIDENCE, GENERIC_DESIRE_PROFILE, NEUTRAL_MOTIVATION_ANSWERS);
    assert.equal(scoredA.qualityGate.status, "FAIL", `esperado FAIL, obtido ${scoredA.qualityGate.status} - checks: ${JSON.stringify(scoredA.qualityGate.checks.map((c) => [c.name, c.status]))}`);
  });

  await test("30 - FIXTURE B (UGLY_BUT_PERSUASIVE) pontua SUBSTANCIALMENTE melhor que A em purchaseMotivationScore", async () => {
    scoredB = scoreStoryboard("FIXTURE_B", FIXTURE_B_UGLY_BUT_PERSUASIVE, FIXTURE_B_EVIDENCE, GENERIC_DESIRE_PROFILE, NEUTRAL_MOTIVATION_ANSWERS);
    assert.ok(scoredB.purchaseMotivationScore.score > scoredA.purchaseMotivationScore.score + 20, `B=${scoredB.purchaseMotivationScore.score} deveria ser >> A=${scoredA.purchaseMotivationScore.score}`);
  });

  await test("31 - FIXTURE B tem benefitVisualization maior que A (demonstra beneficio, A nao demonstra nenhum)", async () => {
    assert.ok(scoredB.benefitVisualization.score > scoredA.benefitVisualization.score);
    assert.equal(scoredA.benefitVisualization.demonstrationRatio, 0);
    assert.ok(scoredB.benefitVisualization.demonstrationRatio > 0);
    assert.ok(scoredB.benefitVisualization.packshotRatio < scoredA.benefitVisualization.packshotRatio);
  });

  await test("32 - FIXTURE C (UNSUPPORTED_CLAIM) reprova CLAIM_SAFETY", async () => {
    const scoredC = scoreStoryboard("FIXTURE_C", FIXTURE_B_UGLY_BUT_PERSUASIVE, FIXTURE_C_EVIDENCE, GENERIC_DESIRE_PROFILE, NEUTRAL_MOTIVATION_ANSWERS);
    const claimSafetyCheck = scoredC.qualityGate.checks.find((c) => c.name === "CLAIM_SAFETY");
    assert.equal(claimSafetyCheck.status, "FAIL");
  });

  await test("33 - FIXTURE D (FAKE_URGENCY) reprova o check FAKE_URGENCY no gate completo", async () => {
    const scoredD = scoreStoryboard("FIXTURE_D", FIXTURE_B_UGLY_BUT_PERSUASIVE, FIXTURE_B_EVIDENCE, GENERIC_DESIRE_PROFILE, FIXTURE_D_MOTIVATION_ANSWERS);
    const fakeUrgencyCheck = scoredD.qualityGate.checks.find((c) => c.name === "FAKE_URGENCY");
    assert.equal(fakeUrgencyCheck.status, "FAIL");
    assert.equal(scoredD.qualityGate.status, "FAIL");
  });

  await test("34 - FIXTURE E (DISCONNECTED_CHARACTER) reprova CHARACTER_INTEGRATION", async () => {
    const scoredE = scoreStoryboard("FIXTURE_E", FIXTURE_E_DISCONNECTED_CHARACTER, GENERIC_EVIDENCE, GENERIC_DESIRE_PROFILE, NEUTRAL_MOTIVATION_ANSWERS);
    const characterCheck = scoredE.qualityGate.checks.find((c) => c.name === "CHARACTER_INTEGRATION");
    assert.equal(characterCheck.status, "FAIL");
  });

  await test("35 - FIXTURE F (REPEATED_PACKSHOT) reprova PERSUASION_REDUNDANCY", async () => {
    const scoredF = scoreStoryboard("FIXTURE_F", FIXTURE_F_REPEATED_PACKSHOT, GENERIC_EVIDENCE, GENERIC_DESIRE_PROFILE, NEUTRAL_MOTIVATION_ANSWERS);
    const redundancyCheck = scoredF.qualityGate.checks.find((c) => c.name === "PERSUASION_REDUNDANCY");
    assert.notEqual(redundancyCheck.status, "PASS");
  });

  // ===================== GENERIC AI AD RISK V2 =====================

  await test("36 - assessGenericAiAdRiskV2 classifica fixture A como HIGH risk com multiplas razoes", async () => {
    const contextRelevance = scoreProductContextRelevance(FIXTURE_A_BEAUTIFUL_BUT_EMPTY.scenes);
    const characterIntegration = scoreCharacterIntegration(FIXTURE_A_BEAUTIFUL_BUT_EMPTY.scenes);
    const benefitVisualization = scoreBenefitVisualization(FIXTURE_A_BEAUTIFUL_BUT_EMPTY.scenes);
    const offerReveal = buildOfferRevealPlan(GENERIC_EVIDENCE);
    const result = assessGenericAiAdRiskV2({ scenes: FIXTURE_A_BEAUTIFUL_BUT_EMPTY.scenes, contextRelevance, characterIntegration, benefitVisualization, offerReveal, motivationAnswers: NEUTRAL_MOTIVATION_ANSWERS });
    assert.equal(result.riskLevel, "HIGH");
    assert.ok(result.reasons.includes("FLOATING_PRODUCT_SYNDROME"));
    assert.ok(result.reasons.includes("EXCESSIVE_PACKSHOT"));
  });

  // ===================== CURRENT_V2 ADAPTER + PERSUASION STORYBOARD BUILDER =====================

  await test("37 - adaptCommercialDirectionV2ToPersuasionStoryboard classifica ambiente FITNESS como UNRELATED_ASPIRATIONAL para categoria beleza", async () => {
    const fakeV2 = {
      visualWorld: "FITNESS",
      sceneBlueprints: [
        {
          sceneId: "scene-1", purpose: "HOOK", desiredDuration: 2, productPresentationStrategy: "HERO_REVEAL",
          productRole: "HERO", environmentDirection: "ambiente ativo, gym", characterRole: { role: "NONE" },
          overlayPlan: { overlayInstructions: { priceText: null, discountText: null, ctaText: null } },
          creativeIntent: "descoberta surpreendente", visualObjective: "revelar produto", narrationRole: { intent: "DISCOVERY", tone: "energico" },
        },
      ],
    };
    const storyboard = adaptCommercialDirectionV2ToPersuasionStoryboard(fakeV2, "beleza", {});
    assert.equal(storyboard.scenes[0].environmentRelevance, "UNRELATED_ASPIRATIONAL");
    assert.equal(storyboard.scenes[0].productVisualRole, "FLOATING_HERO");
    assert.equal(storyboard.scenes[0].benefitClaimId, null);
  });

  await test("38 - buildPersuasionStoryboard (DESIRE_ENGINE_V1) para Kokeshi propoe environment PRODUCT_NATIVE_CONTEXT em todas as cenas", async () => {
    const { storyboard, structuralLimitation } = buildPersuasionStoryboard({
      evidence: kokeshiEvidence, desireProfile: kokeshiDesireProfile, salesAngle: winningAngle, benefitPlans: kokeshiBenefitPlans, useCharacter: true,
    });
    assert.ok(storyboard.scenes.every((s) => s.environmentRelevance === "PRODUCT_NATIVE_CONTEXT"));
    assert.equal(structuralLimitation.code, "STRUCTURAL_LIMITATION_SCENE_COUNT");
    assert.ok(storyboard.scenes.filter((s) => s.characterNarrativeRole !== "NONE").length >= 3, "personagem deveria aparecer em mais de 1 cena (corrige DISCONNECTED_PRESENTER)");
  });

  await test("39 - buildPersuasionStoryboard NUNCA usa claim FORBIDDEN como benefitClaimId", async () => {
    const { storyboard } = buildPersuasionStoryboard({ evidence: kokeshiEvidence, desireProfile: kokeshiDesireProfile, salesAngle: winningAngle, benefitPlans: kokeshiBenefitPlans, useCharacter: false });
    const forbiddenIds = new Set(kokeshiEvidence.forbiddenClaims.map((c) => c.id));
    for (const scene of storyboard.scenes) {
      if (scene.benefitClaimId) assert.ok(!forbiddenIds.has(scene.benefitClaimId), `cena ${scene.sceneId} usou claim proibida ${scene.benefitClaimId}`);
    }
  });

  // ===================== COMPARACAO REAL: CURRENT_V2 x DESIRE_ENGINE_V1 =====================

  await test("40 - DESIRE_ENGINE_V1 pontua melhor que CURRENT_V2 (adaptado) no purchaseMotivationScore para Kokeshi", async () => {
    const fakeCurrentV2 = {
      visualWorld: "FITNESS",
      sceneBlueprints: ["HOOK", "PRODUCT", "BENEFIT", "OFFER", "CTA"].map((purpose, i) => ({
        sceneId: `scene-${i + 1}`, purpose, desiredDuration: 3,
        productPresentationStrategy: purpose === "BENEFIT" ? "BENEFIT_DEMO" : "HERO_REVEAL",
        productRole: "HERO", environmentDirection: "ambiente ativo consistente, gym", characterRole: { role: purpose === "CTA" ? "CTA_PRESENTER" : "NONE" },
        overlayPlan: { overlayInstructions: { priceText: purpose === "OFFER" ? "R$ 13,16" : null, discountText: null, ctaText: purpose === "CTA" ? "Acesse o Radar Smart." : null } },
        creativeIntent: `intent ${purpose}`, visualObjective: `objetivo ${purpose}`, narrationRole: { intent: "DISCOVERY", tone: "energico" },
      })),
    };
    const currentV2Storyboard = adaptCommercialDirectionV2ToPersuasionStoryboard(fakeCurrentV2, "beleza", {});
    const scoredCurrentV2 = scoreStoryboard("CURRENT_V2", currentV2Storyboard, kokeshiEvidence, kokeshiDesireProfile, kokeshiMotivationAnswers);

    const { storyboard: desireStoryboard } = buildPersuasionStoryboard({ evidence: kokeshiEvidence, desireProfile: kokeshiDesireProfile, salesAngle: winningAngle, benefitPlans: kokeshiBenefitPlans, useCharacter: true });
    const scoredDesireV1 = scoreStoryboard("DESIRE_ENGINE_V1", desireStoryboard, kokeshiEvidence, kokeshiDesireProfile, kokeshiMotivationAnswers);

    assert.ok(
      scoredDesireV1.purchaseMotivationScore.score > scoredCurrentV2.purchaseMotivationScore.score,
      `DESIRE_ENGINE_V1=${scoredDesireV1.purchaseMotivationScore.score} deveria ser > CURRENT_V2=${scoredCurrentV2.purchaseMotivationScore.score}`,
    );
  });

  // ===================== DETERMINISMO (item 29) =====================

  await test("41 - mesma entrada produz exatamente os mesmos scores (determinismo, sem randomness)", async () => {
    const run1 = scoreStoryboard("DET", FIXTURE_B_UGLY_BUT_PERSUASIVE, FIXTURE_B_EVIDENCE, GENERIC_DESIRE_PROFILE, NEUTRAL_MOTIVATION_ANSWERS);
    const run2 = scoreStoryboard("DET", FIXTURE_B_UGLY_BUT_PERSUASIVE, FIXTURE_B_EVIDENCE, GENERIC_DESIRE_PROFILE, NEUTRAL_MOTIVATION_ANSWERS);
    assert.equal(run1.purchaseMotivationScore.score, run2.purchaseMotivationScore.score);
    assert.equal(run1.qualityGate.status, run2.qualityGate.status);
    assert.deepEqual(run1.qualityGate.checks.map((c) => c.status), run2.qualityGate.checks.map((c) => c.status));
  });

  // ===================== THRESHOLDS DOCUMENTADOS =====================

  await test("42 - PERSUASION_THRESHOLDS bate com a sugestao revisada do pedido (documentado, nao ajustado pos-hoc)", async () => {
    assert.equal(PERSUASION_THRESHOLDS.DESIRE_SCORE, 75);
    assert.equal(PERSUASION_THRESHOLDS.HOOK_PERSUASION, 75);
    assert.equal(PERSUASION_THRESHOLDS.SCROLL_STOP_POWER, 70);
    assert.equal(PERSUASION_THRESHOLDS.PRODUCT_CONTEXT_RELEVANCE, 75);
    assert.equal(PERSUASION_THRESHOLDS.PURCHASE_MOTIVATION, 75);
    assert.equal(PERSUASION_THRESHOLDS.EMOTIONAL_PROGRESSION, 70);
    assert.equal(PERSUASION_THRESHOLDS.CHARACTER_INTEGRATION, 70);
  });

  await test("43 - nenhum arquivo desta camada importa/chama adapters de provider (grep estrutural)", async () => {
    const dir = path.join(root, "lib", "commercial-video", "persuasion");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts"));
    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), "utf8");
      assert.ok(!content.includes("generation-orchestrator/adapters"), `${file} nao deveria importar adapters de provider`);
      assert.ok(!/await fetch\(/.test(content), `${file} nao deveria chamar fetch`);
    }
  });

  const failed = results.filter((r) => r.status === "FAIL");
  for (const r of results) {
    console.log(`${r.status === "PASS" ? "OK  " : "FAIL"} - ${r.name}${r.error ? ` :: ${r.error}` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} testes passaram. fetchCalls=${fetchCalls}`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run();
