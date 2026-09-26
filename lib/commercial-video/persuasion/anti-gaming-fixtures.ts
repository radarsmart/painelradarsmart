// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Anti-Gaming Fixtures
//
// Fixtures SINTETICAS (item 28 do pedido) - provam que o gate reconhece
// "bonito e vazio" como PIOR que "simples e persuasivo", que claim sem
// evidencia reprova CLAIM_SAFETY, que urgencia fabricada reprova
// FAKE_URGENCY, que apresentadora desconectada reprova
// CHARACTER_INTEGRATION e que packshot repetido reprova
// PERSUASION_REDUNDANCY. Nunca alteradas para "passar" - se um fixture
// negativo comecar a passar, e a REGRA que esta errada, nunca o fixture.

import type {
  PersuasionClaim,
  PersuasionEvidence,
  PersuasionSceneConcept,
  PersuasionStoryboard,
  ProductDesireProfile,
  PurchaseMotivationAnswers,
} from "@/lib/commercial-video/persuasion/types";

function claim(id: string, text: string, status: PersuasionClaim["status"], source: PersuasionClaim["source"], confidence: PersuasionClaim["confidence"]): PersuasionClaim {
  return { id, text, status, source, confidence, reason: "fixture" };
}

const GENERIC_EVIDENCE: PersuasionEvidence = {
  productName: "Produto Fixture Generico",
  category: "geral",
  price: 39.9,
  originalPrice: null,
  discountPercent: 0,
  marketplace: "tiktokshop",
  productImageUrl: null,
  rating: null,
  reviewsCount: null,
  factualClaims: [claim("fact-title", "Produto Fixture Generico", "FACTUAL", "FACT", "HIGH"), claim("fact-price", "R$ 39,90", "FACTUAL", "FACT", "HIGH")],
  packagingClaims: [],
  offerClaims: [],
  inferredClaims: [],
  forbiddenClaims: [],
  unknownClaims: [],
  categoryMismatch: { detected: false, declaredCategory: "geral", signalKeywordsInTitle: [], mismatchKeywordsInProductIntelligence: [], reason: "N/A" },
};

const GENERIC_DESIRE_PROFILE: ProductDesireProfile = {
  productCategory: "geral",
  purchaseType: "CONSIDERED",
  likelyConsumerGoal: "resolver uma necessidade cotidiana",
  primaryDesire: { text: "resolver a necessidade", confidence: "MEDIUM", source: "FACT" },
  secondaryDesires: [],
  consumerProblem: null,
  consumerTension: null,
  purchaseMotivation: { text: "preco razoavel", confidence: "MEDIUM", source: "OFFER" },
  emotionalDrivers: [],
  rationalDrivers: [],
  visualDesireDrivers: [],
  objections: [],
  trustNeeds: [],
  demonstrationOpportunities: [],
  offerLeverage: "preco",
  impulsePurchasePotential: "MEDIUM",
  priceSensitivity: "MEDIUM",
  noveltyPotential: "MEDIUM",
};

const NEUTRAL_MOTIVATION_ANSWERS: PurchaseMotivationAnswers = {
  whyBuyThisProduct: { statement: "resolve a necessidade", evidence: "fixture", confidence: "MEDIUM" },
  whyBuyAtThisPrice: { statement: "preco razoavel", evidence: "fixture", confidence: "MEDIUM" },
  whyBuyNow: { statement: "sem urgencia real disponivel", evidence: "fixture", confidence: "LOW" },
  whyKeepWatching: { statement: "curiosidade", evidence: "fixture", confidence: "MEDIUM" },
};

function baseScene(overrides: Partial<PersuasionSceneConcept> & { sceneId: string; order: number }): PersuasionSceneConcept {
  return {
    purpose: "PRODUCT",
    durationSecondsHint: 3,
    arcStage: "INTEREST",
    productVisualRole: "PACKSHOT",
    productInteraction: "NONE",
    environmentDescription: "estudio neutro",
    environmentRelevance: "GENERIC_STUDIO",
    environmentJustification: null,
    characterNarrativeRole: "NONE",
    characterPerformanceIntent: null,
    benefitClaimId: null,
    salesAngleAlignment: false,
    offerRole: "NONE",
    ctaRole: "NONE",
    overlayCategories: [],
    whyContinueWatching: "produto bonito",
    narrationIntent: "generico",
    suggestedNarration: "Conheca o produto.",
    visualConcept: "produto em destaque",
    consumerState: "neutro",
    persuasionObjective: "mostrar o produto",
    ...overrides,
  };
}

// --- A) BEAUTIFUL_BUT_EMPTY ---------------------------------------------
// Cinematografia excelente (implicito - nao modelado aqui, essa camada
// nao mede producao), produto fiel, VARIOS ambientes diferentes, ZERO
// demonstracao, ZERO beneficio, produto flutuando. Esperado: PERSUASION
// FAIL (BENEFIT_VISUALIZATION FAIL, PURCHASE_MOTIVATION FAIL).
export const FIXTURE_A_BEAUTIFUL_BUT_EMPTY: PersuasionStoryboard = {
  label: "FIXTURE_A_BEAUTIFUL_BUT_EMPTY",
  salesAngle: "LIFESTYLE_ASPIRATION",
  totalDurationSecondsHint: 15,
  sceneCount: 5,
  scenes: [
    baseScene({ sceneId: "a-1", order: 1, purpose: "HOOK", arcStage: "ATTENTION", productVisualRole: "FLOATING_HERO", environmentDescription: "academia premium", environmentRelevance: "UNRELATED_ASPIRATIONAL" }),
    baseScene({ sceneId: "a-2", order: 2, purpose: "PRODUCT", arcStage: "INTEREST", productVisualRole: "FLOATING_HERO", environmentDescription: "estudio dourado", environmentRelevance: "UNRELATED_ASPIRATIONAL" }),
    baseScene({ sceneId: "a-3", order: 3, purpose: "BENEFIT", arcStage: "INTEREST", productVisualRole: "FLOATING_HERO", environmentDescription: "piscina de luxo", environmentRelevance: "UNRELATED_ASPIRATIONAL" }),
    baseScene({ sceneId: "a-4", order: 4, purpose: "OFFER", arcStage: "INTEREST", productVisualRole: "PACKSHOT", environmentDescription: "estudio neutro" }),
    baseScene({ sceneId: "a-5", order: 5, purpose: "CTA", arcStage: "INTEREST", productVisualRole: "FLOATING_HERO", environmentDescription: "ceu dramatico", environmentRelevance: "UNRELATED_ASPIRATIONAL" }),
  ],
};

// --- B) UGLY_BUT_PERSUASIVE ----------------------------------------------
// Cinematografia simples (nao modelada aqui), beneficio claro,
// demonstracao forte, oferta clara, progressao boa. Persuasion deve ser
// SUBSTANCIALMENTE maior que A.
export const FIXTURE_B_UGLY_BUT_PERSUASIVE: PersuasionStoryboard = {
  label: "FIXTURE_B_UGLY_BUT_PERSUASIVE",
  salesAngle: "DEMONSTRATION",
  totalDurationSecondsHint: 15,
  sceneCount: 5,
  scenes: [
    baseScene({
      sceneId: "b-1", order: 1, purpose: "HOOK", arcStage: "ATTENTION", productVisualRole: "DEMONSTRATION", productInteraction: "APPLIED",
      environmentRelevance: "PRODUCT_NATIVE_CONTEXT", benefitClaimId: "b-claim-1", offerRole: "SETUP", whyContinueWatching: "Um achado por R$ 39,90?",
    }),
    baseScene({ sceneId: "b-2", order: 2, purpose: "PRODUCT", arcStage: "INTEREST", productVisualRole: "PACKSHOT", productInteraction: "HELD", environmentRelevance: "PRODUCT_NATIVE_CONTEXT" }),
    baseScene({
      sceneId: "b-3", order: 3, purpose: "BENEFIT", arcStage: "DESIRE", productVisualRole: "DEMONSTRATION", productInteraction: "APPLIED",
      environmentRelevance: "PRODUCT_NATIVE_CONTEXT", benefitClaimId: "b-claim-1", overlayCategories: ["BENEFIT_TEXT"],
    }),
    baseScene({
      sceneId: "b-4", order: 4, purpose: "OFFER", arcStage: "VALUE", productVisualRole: "PACKSHOT", productInteraction: "HELD",
      environmentRelevance: "PRODUCT_NATIVE_CONTEXT", offerRole: "REVEAL", overlayCategories: ["PRICE_TEXT"],
    }),
    baseScene({
      sceneId: "b-5", order: 5, purpose: "CTA", arcStage: "ACTION", productVisualRole: "PACKSHOT", productInteraction: "POINTED_AT",
      environmentRelevance: "PRODUCT_NATIVE_CONTEXT", ctaRole: "PRIMARY", offerRole: "REINFORCEMENT", overlayCategories: ["CTA_TEXT"],
    }),
  ],
};

export const FIXTURE_B_EVIDENCE: PersuasionEvidence = {
  ...GENERIC_EVIDENCE,
  packagingClaims: [claim("b-claim-1", "Textura leve, absorcao rapida", "PACKAGING_SUPPORTED", "PACKAGING", "HIGH")],
};

// --- C) UNSUPPORTED_CLAIM --------------------------------------------------
// Copy persuasiva, claim SEM evidencia (FORBIDDEN). Esperado: CLAIM_SAFETY
// FAIL.
export const FIXTURE_C_EVIDENCE: PersuasionEvidence = {
  ...GENERIC_EVIDENCE,
  forbiddenClaims: [claim("c-claim-forbidden", "elimina rugas em 7 dias", "FORBIDDEN", "CATEGORY_INFERENCE", "LOW")],
  categoryMismatch: { detected: false, declaredCategory: "geral", signalKeywordsInTitle: [], mismatchKeywordsInProductIntelligence: [], reason: "N/A - claim proibida por outro motivo (resultado nao sustentado)." },
};

// --- D) FAKE_URGENCY -------------------------------------------------------
// Esperado: FAKE_URGENCY FAIL (detectFakeUrgency).
export const FIXTURE_D_MOTIVATION_ANSWERS: PurchaseMotivationAnswers = {
  ...NEUTRAL_MOTIVATION_ANSWERS,
  whyBuyNow: { statement: "Ultimas unidades, corra antes que acabe!", evidence: "(fabricado - sem estoque real)", confidence: "HIGH" },
};

// --- E) DISCONNECTED_CHARACTER --------------------------------------------
// Personagem SO na ultima cena, so como CTA_CLOSER. Esperado:
// CHARACTER_INTEGRATION baixo (disconnected=true).
export const FIXTURE_E_DISCONNECTED_CHARACTER: PersuasionStoryboard = {
  label: "FIXTURE_E_DISCONNECTED_CHARACTER",
  salesAngle: "PRODUCT_DISCOVERY",
  totalDurationSecondsHint: 15,
  sceneCount: 5,
  scenes: [
    baseScene({ sceneId: "e-1", order: 1, purpose: "HOOK", arcStage: "ATTENTION" }),
    baseScene({ sceneId: "e-2", order: 2, purpose: "PRODUCT", arcStage: "INTEREST" }),
    baseScene({ sceneId: "e-3", order: 3, purpose: "BENEFIT", arcStage: "DESIRE", benefitClaimId: "e-claim-1" }),
    baseScene({ sceneId: "e-4", order: 4, purpose: "OFFER", arcStage: "VALUE", offerRole: "REVEAL" }),
    baseScene({ sceneId: "e-5", order: 5, purpose: "CTA", arcStage: "ACTION", ctaRole: "PRIMARY", characterNarrativeRole: "CTA_CLOSER" }),
  ],
};

// --- F) REPEATED_PACKSHOT --------------------------------------------------
// Todas as cenas PACKSHOT/FLOATING_HERO, mesmo arcStage, sem beneficio
// distinto. Esperado: PERSUASION_REDUNDANCY alto (score baixo, varios
// pares redundantes).
export const FIXTURE_F_REPEATED_PACKSHOT: PersuasionStoryboard = {
  label: "FIXTURE_F_REPEATED_PACKSHOT",
  salesAngle: "PRODUCT_DISCOVERY",
  totalDurationSecondsHint: 15,
  sceneCount: 5,
  scenes: [
    baseScene({ sceneId: "f-1", order: 1, purpose: "HOOK", arcStage: "ATTENTION", productVisualRole: "PACKSHOT" }),
    baseScene({ sceneId: "f-2", order: 2, purpose: "PRODUCT", arcStage: "ATTENTION", productVisualRole: "PACKSHOT" }),
    baseScene({ sceneId: "f-3", order: 3, purpose: "BENEFIT", arcStage: "ATTENTION", productVisualRole: "PACKSHOT" }),
    baseScene({ sceneId: "f-4", order: 4, purpose: "OFFER", arcStage: "ATTENTION", productVisualRole: "PACKSHOT" }),
    baseScene({ sceneId: "f-5", order: 5, purpose: "CTA", arcStage: "ATTENTION", productVisualRole: "PACKSHOT" }),
  ],
};

export { GENERIC_EVIDENCE, GENERIC_DESIRE_PROFILE, NEUTRAL_MOTIVATION_ANSWERS };
