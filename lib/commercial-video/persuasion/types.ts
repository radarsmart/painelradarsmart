// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Types
//
// Esta camada roda ANTES da decisao cinematografica (Creative Director V2)
// e NUNCA escolhe provider/capability/mídia - so decide "o que o consumidor
// precisa sentir/entender/desejar" e propoe um storyboard PERSUASIVO
// (texto puro, DRY_RUN). Aprendizado do COMMERCIAL V2 FULL CANARY real
// (2026-08-11, campanha Kokeshi): production quality alta (fidelidade,
// cinematografia, montagem) NAO implica persuasion quality alta - o gate
// tecnico existente (CreativeStoryboardQualityGate/CinematicBenchmark) mede
// producao, nunca "vontade de compra". Este modulo formaliza essa segunda
// dimensao como um conceito de primeira classe, separado e nunca
// substituindo o gate tecnico.

import type { ScenePurpose } from "@/lib/commercial-director/types";

// --- 4. Claim Safety / Factual Grounding ------------------------------------

export type ClaimSource = "FACT" | "PACKAGING" | "OFFER" | "CATEGORY_INFERENCE";
export type ClaimConfidence = "LOW" | "MEDIUM" | "HIGH";
export type ClaimStatus =
  | "FACTUAL"
  | "PACKAGING_SUPPORTED"
  | "OFFER_SUPPORTED"
  | "SAFE_INFERENCE"
  | "UNVERIFIED"
  | "FORBIDDEN";

export type PersuasionClaim = {
  id: string;
  text: string;
  status: ClaimStatus;
  source: ClaimSource;
  confidence: ClaimConfidence;
  reason: string;
};

// Achado do CANARY real: product_intelligence.category="suplementos" para um
// CREME FACIAL (Kokeshi) - todo o pain_points/desires/objections/
// functional_benefits daquele registro descreve outro produto (treino,
// energia, recuperacao muscular). Detectado por palavras-chave, nunca
// assumido silenciosamente - ver claim-grounding.ts#detectCategoryMismatch.
export type CategoryMismatchFinding = {
  detected: boolean;
  declaredCategory: string;
  signalKeywordsInTitle: string[];
  mismatchKeywordsInProductIntelligence: string[];
  reason: string;
};

export type PersuasionEvidence = {
  productName: string;
  category: string;
  price: number | null;
  originalPrice: number | null;
  discountPercent: number | null;
  marketplace: string | null;
  productImageUrl: string | null;
  rating: number | null;
  reviewsCount: number | null;
  factualClaims: PersuasionClaim[];
  packagingClaims: PersuasionClaim[];
  offerClaims: PersuasionClaim[];
  inferredClaims: PersuasionClaim[];
  forbiddenClaims: PersuasionClaim[];
  unknownClaims: PersuasionClaim[];
  categoryMismatch: CategoryMismatchFinding;
};

// --- 5. Product Desire Model -------------------------------------------------

export type PurchaseType = "IMPULSE" | "CONSIDERED";
export type ImpulsePotential = "LOW" | "MEDIUM" | "HIGH";
export type PriceSensitivity = "LOW" | "MEDIUM" | "HIGH";

export type DesireDriver = { text: string; confidence: ClaimConfidence; source: ClaimSource };

export type ProductDesireProfile = {
  productCategory: string;
  purchaseType: PurchaseType;
  likelyConsumerGoal: string;
  primaryDesire: DesireDriver;
  secondaryDesires: DesireDriver[];
  consumerProblem: DesireDriver | null;
  consumerTension: string | null;
  purchaseMotivation: DesireDriver;
  emotionalDrivers: DesireDriver[];
  rationalDrivers: DesireDriver[];
  visualDesireDrivers: string[];
  objections: DesireDriver[];
  trustNeeds: string[];
  demonstrationOpportunities: string[];
  offerLeverage: string;
  impulsePurchasePotential: ImpulsePotential;
  priceSensitivity: PriceSensitivity;
  noveltyPotential: ClaimConfidence;
};

// --- 6. Purchase Motivation Questions ----------------------------------------

export type MotivationAnswer = { statement: string; evidence: string; confidence: ClaimConfidence };

export type PurchaseMotivationAnswers = {
  whyBuyThisProduct: MotivationAnswer;
  whyBuyAtThisPrice: MotivationAnswer;
  whyBuyNow: MotivationAnswer;
  whyKeepWatching: MotivationAnswer;
};

// --- 7. Sales Angle Engine ----------------------------------------------------

export type SalesAngle =
  | "PRICE_DISCOVERY"
  | "PROBLEM_SOLUTION"
  | "DESIRE_TRANSFORMATION"
  | "PRODUCT_DISCOVERY"
  | "VALUE_FOR_MONEY"
  | "PREMIUM_FOR_LESS"
  | "ROUTINE_UPGRADE"
  | "CONVENIENCE"
  | "DEMONSTRATION"
  | "SOCIAL_PROOF"
  | "INGREDIENT_STORY"
  | "BEFORE_AFTER_CONCEPT"
  | "GIFTABILITY"
  | "LIFESTYLE_ASPIRATION"
  | "SURPRISING_FIND"
  | "CATEGORY_COMPARISON";

export type SalesAngleCandidate = {
  angle: SalesAngle;
  relevanceScore: number;
  evidenceStrength: number;
  emotionalPotential: number;
  visualPotential: number;
  offerCompatibility: number;
  productCompatibility: number;
  hallucinationRisk: "LOW" | "MEDIUM" | "HIGH";
  genericAdRisk: "LOW" | "MEDIUM" | "HIGH";
  totalScore: number;
  reasons: string[];
  eligible: boolean;
};

// --- 8/9. Hook Persuasion + Scroll Stop --------------------------------------

export type HookConcept = { concept: string; grounded: boolean; reason: string };

export type HookPersuasionResult = {
  score: number;
  candidates: HookConcept[];
  winningConcept: HookConcept;
  signals: {
    specificity: number;
    curiosity: number;
    benefitOrDesirePresent: boolean;
    productRelevantToMessage: boolean;
    dependsOnlyOnAesthetics: boolean;
    genericAdRisk: boolean;
    createsQuestion: boolean;
    rewardClarity: number;
  };
  reasons: string[];
};

// --- Scroll-Stop Engine V2 (decision-sensitive scoring + calibration) -------
//
// V1 tinha um teto matematico PROVADO de ~72 (soma dos maximos de cada
// bucket) porque varios componentes saturavam a partir de qualquer claim
// real presente, e motionInterest era uma CONSTANTE (50) que nenhuma
// decisao de storyboard conseguia mover. V2 substitui buckets binarios por
// gradacao real derivada de sinais ja existentes em PersuasionSceneConcept
// (productInteraction, characterPerformanceIntent, offerRole,
// benefitClaimId) - nunca depende de provider/geracao real, nunca
// inventa campo novo obrigatorio.

export type MotionIntensity = "STATIC" | "SUBTLE" | "MODERATE" | "STRONG";

export type ScrollStopComponentClassification = "DECISION_SENSITIVE" | "INPUT_SENSITIVE" | "CONSTANT" | "DERIVED_DUPLICATE";

export type ScrollStopComponentDetail = {
  name: string;
  score: number;
  maxScore: number;
  classification: ScrollStopComponentClassification;
  reason: string;
  sourceDecision: string; // qual campo real de PersuasionSceneConcept/evidence gerou esse valor
  improvableBy: string[]; // acoes de storyboard concretas que aumentariam esse componente - nunca algo fora do controle do storyboard
};

export type ScrollStopBreakdown = {
  total: number;
  components: ScrollStopComponentDetail[];
  penalties: Array<{ name: string; amount: number; reason: string }>;
  strongestDrivers: string[]; // nomes dos componentes mais proximos do proprio maximo
  weakestDrivers: string[]; // nomes dos componentes mais distantes do proprio maximo (maior headroom)
  headroom: number; // 100 - total, quanto ainda seria matematicamente alcancavel
};

export type ScrollStopResult = {
  score: number;
  components: {
    specificity: number;
    visualInterrupt: number;
    productRelevance: number;
    priceCuriosity: number;
    humanInterest: number;
    motionInterest: number;
    firstSecondEventStrength: number;
    curiosityGap: number;
    genericAdPenalty: number;
  };
  reasons: string[];
  breakdown: ScrollStopBreakdown;
};

// --- 10. Benefit Visualization -----------------------------------------------

export type DemonstrationType = "PACKSHOT" | "DEMONSTRATION" | "EXPERIENCE" | "RESULT_VISUALIZATION" | "INGREDIENT_STORY" | "HUMAN_REACTION";

export type BenefitVisualizationPlan = {
  benefit: string;
  evidence: PersuasionClaim | null;
  visualMetaphor: string;
  demonstrationType: DemonstrationType;
  productInteraction: string;
  humanInteraction: string;
  environmentRelevance: string;
  riskOfOverclaim: "LOW" | "MEDIUM" | "HIGH";
  recommendedScenePurpose: string;
};

// Item 7-9 da tarefa PRODUCT INTELLIGENCE CATEGORY FIX + PURPOSE-AWARE
// BENEFIT VISUALIZATION V1 - achado real: o score antigo penalizava
// PACKSHOT em QUALQUER cena (inclusive OFFER/CTA, onde mostrar o produto
// parado com preco/CTA e a finalidade CORRETA da cena, nao um defeito).
// BenefitResponsibility torna a expectativa de demonstracao dependente da
// FINALIDADE real da cena (purpose + se ja carrega uma claim real), nunca
// so do purpose isolado.
export type BenefitResponsibility = "PRIMARY" | "SUPPORTING" | "NONE";

export type CommercialBenefitCoverage = {
  requiredBenefits: string[]; // benefitClaimId distintos referenciados em QUALQUER cena do storyboard
  visualizedBenefits: string[]; // desses, quais realmente aparecem numa cena com role de demonstracao (nao so citados)
  unsupportedBenefits: string[]; // referenciados mas nunca de fato demonstrados
  responsibleScenes: Array<{ sceneId: string; purpose: string; responsibility: BenefitResponsibility; demonstrated: boolean }>;
  coverageScore: number;
  packshotDominancePenalty: number; // so aplicado quando packshot domina TODO o comercial (>80%), independente de finalidade
  reasons: string[];
};

export type BenefitVisualizationScore = {
  score: number;
  packshotRatio: number;
  demonstrationRatio: number;
  reasons: string[];
  coverage: CommercialBenefitCoverage;
};

// --- 11. Product Context Relevance -------------------------------------------

export type EnvironmentRelevance = "PRODUCT_NATIVE_CONTEXT" | "LIFESTYLE_ADJACENT" | "GENERIC_STUDIO" | "UNRELATED_ASPIRATIONAL";

export type ProductContextRelevanceResult = {
  score: number;
  perScene: Array<{ sceneId: string; relevance: EnvironmentRelevance; justificationPresent: boolean; reason: string }>;
  categoryEnvironmentFit: number;
  usageContextFit: number;
  consumerGoalFit: number;
  reasons: string[];
};

// --- 12/13. Persuasion Arc + Emotional Progression ---------------------------

export type PersuasionArcStage = "ATTENTION" | "INTEREST" | "DESIRE" | "VALUE" | "ACTION";

export type PersuasionArcSceneAssessment = {
  sceneId: string;
  stage: PersuasionArcStage;
  whatConsumerFeels: string;
  whatConsumerLearns: string;
  whyTheyContinue: string;
  whatChangedFromPreviousScene: string;
  purchaseIntentContribution: number;
};

export type PersuasionArcResult = {
  scenes: PersuasionArcSceneAssessment[];
  stagesCovered: PersuasionArcStage[];
  missingStages: PersuasionArcStage[];
  score: number;
  reasons: string[];
};

export type EmotionalProgressionResult = {
  score: number;
  emotionalTrajectory: string[];
  flatline: boolean;
  reasons: string[];
};

// --- 14. Character Integration ------------------------------------------------

export type CharacterNarrativeRole =
  | "NONE"
  | "HOOK_PRESENTER"
  | "PRODUCT_GUIDE"
  | "DEMONSTRATOR"
  | "REACTION"
  | "OFFER_PRESENTER"
  | "TRUST_ANCHOR"
  | "CTA_CLOSER";

export type CharacterPerformanceIntent = {
  narrativeRole: CharacterNarrativeRole;
  sceneObjective: string;
  relationshipToProduct: string;
  eyeDirection: string;
  gestureIntent: string;
  productInteractionIntent: string;
  emotionalTone: string;
  transitionContribution: string;
};

export type CharacterIntegrationResult = {
  score: number;
  appearsInScenes: string[];
  disconnected: boolean;
  reasons: string[];
};

// --- 15/16. Offer Reveal + CTA Persuasion --------------------------------------

export type OfferRevealTiming = "EARLY" | "MID" | "LATE";

export type OfferRevealPlan = {
  revealTiming: OfferRevealTiming;
  setupBeforePrice: boolean;
  priceAnchor: "REAL_ORIGINAL_PRICE" | "NONE_AVAILABLE";
  discountAllowed: boolean;
  urgencyAllowed: boolean;
  valueMessage: string;
  visualHierarchy: string[];
};

export type CtaPersuasionPlan = {
  purchaseStateBeforeCta: string;
  ctaObjective: string;
  ctaCopyIntent: string;
  visualAction: string;
  characterRole: CharacterNarrativeRole;
  continuityFromOffer: boolean;
  frictionReduction: string;
  secondaryMessageAllowed: boolean;
};

// --- 17. Generic AI Ad Risk V2 --------------------------------------------------

export type GenericAiAdRiskV2Reason =
  | "FLOATING_PRODUCT_SYNDROME"
  | "UNRELATED_LUXURY_ENVIRONMENT"
  | "GENERIC_PEDESTAL_REVEAL"
  | "EXCESSIVE_PACKSHOT"
  | "NO_PRODUCT_USE"
  | "NO_HUMAN_CONTEXT"
  | "NO_DEMONSTRATION"
  | "REPEATED_PRODUCT_ROTATION"
  | "BEAUTIFUL_BUT_EMPTY"
  | "DISCONNECTED_PRESENTER"
  | "GENERIC_CTA"
  | "BENEFIT_NOT_VISUALIZED"
  | "NO_PURCHASE_REASON"
  | "NO_PRICE_STRATEGY"
  | "AI_STOCK_AD_FEEL";

export type GenericAiAdRiskV2Result = {
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  reasons: GenericAiAdRiskV2Reason[];
  affectedScenes: Record<GenericAiAdRiskV2Reason, string[]>;
};

// --- 18. Persuasion Redundancy --------------------------------------------------

export type PersuasionRedundancyResult = {
  score: number;
  redundantPairs: Array<{ sceneA: string; sceneB: string; reason: string }>;
  reasons: string[];
};

// --- 19/20/21. Purchase Motivation Score + Quality Gate -------------------------

export type PurchaseMotivationScoreResult = {
  score: number;
  components: {
    desireClarity: number;
    benefitStrength: number;
    evidenceStrength: number;
    offerStrength: number;
    emotionalProgression: number;
    demonstrationStrength: number;
    contextRelevance: number;
    trust: number;
    ctaContinuity: number;
  };
  penalties: {
    unsupportedClaims: number;
    genericAdRisk: number;
    persuasionRedundancy: number;
    irrelevantEnvironment: number;
    weakHook: number;
  };
  reasons: string[];
};

export type PersuasionCheckStatus = "PASS" | "PASS_WITH_OBSERVATIONS" | "FAIL";
export type PersuasionCheckSeverity = "NON_BLOCKING" | "BLOCKING" | "CRITICAL";

export type PersuasionCheckResult = {
  name: string;
  status: PersuasionCheckStatus;
  score: number | null;
  threshold: number | null;
  severity: PersuasionCheckSeverity;
  reasons: string[];
  affectedScenes: string[];
};

export type CommercialPersuasionQualityGateResult = {
  status: PersuasionCheckStatus;
  checks: PersuasionCheckResult[];
  blockingReasons: string[];
  observations: string[];
};

// --- 23/24. Persuasion Scene Concept + Storyboard --------------------------------

export type ProductVisualRole =
  | "PACKSHOT"
  | "FLOATING_HERO"
  | "DEMONSTRATION"
  | "EXPERIENCE"
  | "RESULT_VISUALIZATION"
  | "INGREDIENT_STORY"
  | "HUMAN_REACTION";

export type ProductInteraction = "NONE" | "HELD" | "APPLIED" | "POINTED_AT" | "DEMONSTRATED" | "COMPARED";

export type OverlayIntentCategory = "HOOK_TEXT" | "BENEFIT_TEXT" | "PRICE_TEXT" | "PROOF_TEXT" | "CTA_TEXT";

export type PersuasionSceneConcept = {
  sceneId: string;
  order: number;
  purpose: ScenePurpose;
  durationSecondsHint: number | null;
  arcStage: PersuasionArcStage;
  productVisualRole: ProductVisualRole;
  productInteraction: ProductInteraction;
  environmentDescription: string;
  environmentRelevance: EnvironmentRelevance;
  environmentJustification: string | null;
  characterNarrativeRole: CharacterNarrativeRole;
  characterPerformanceIntent: CharacterPerformanceIntent | null;
  benefitClaimId: string | null;
  salesAngleAlignment: boolean;
  offerRole: "NONE" | "SETUP" | "REVEAL" | "REINFORCEMENT";
  ctaRole: "NONE" | "PRIMARY" | "SECONDARY";
  overlayCategories: OverlayIntentCategory[];
  whyContinueWatching: string;
  narrationIntent: string;
  suggestedNarration: string;
  visualConcept: string;
  consumerState: string;
  persuasionObjective: string;
};

export type PersuasionStoryboard = {
  label: string;
  scenes: PersuasionSceneConcept[];
  sceneCount: number;
  salesAngle: SalesAngle;
  totalDurationSecondsHint: number | null;
};

// --- Structural limitation reporting (item 24) ----------------------------------

export type StructuralLimitationFinding = {
  code: "STRUCTURAL_LIMITATION_SCENE_COUNT";
  currentArchitectureConstraint: string;
  desiredSceneCount: number;
  currentSceneCount: number;
  recommendation: string;
};

// --- Scroll-Stop Hook Optimization V1 ----------------------------------------
//
// Roda DEPOIS que um storyboard ja existe - nunca decide provider/media,
// so PROPÕE e PONTUA variantes de HOOK usando o MESMO scorer (scoreStoryboard)
// do resto do sistema (item "usar exatamente o mesmo scorer" do pedido).

export type HookVariantId = "A_CURRENT" | "B_PRODUCT_HUMAN_CONTEXT" | "C_PRICE_DISCOVERY" | "D_PRESENTER_CONTROL";

export type HookVariantConcept = {
  variantId: HookVariantId;
  label: string;
  scene: PersuasionSceneConcept;
  rationale: string;
};

export type HookVariantMetrics = {
  hookPersuasion: number;
  scrollStopPower: number;
  desireContribution: number; // desireScore do storyboard INTEIRO com esse hook (nao so a cena isolada)
  productRelevance: number;
  firstSecondEventStrength: number;
  specificity: number;
  priceCuriosity: number;
  humanInterest: number;
  motionInterest: number;
  curiosityGap: number;
  visualInterrupt: number;
  genericAdRisk: GenericAiAdRiskV2Result["riskLevel"];
  claimSafety: PersuasionCheckResult["status"];
  characterIntegration: number;
  contextRelevance: number;
};

export type HookVariantEvaluation = {
  variantId: HookVariantId;
  label: string;
  scene: PersuasionSceneConcept;
  metrics: HookVariantMetrics;
  whyViewerWouldStop: string;
  whyViewerWouldKeepWatching: string;
  whatTheyWantToKnowNext: string;
  firstSecondSignal: string;
  weak: boolean; // true quando a unica razao encontrada e estetica pura
};

export type HookOptimizationDecision = {
  selectedVariant: HookVariantId;
  baselineScore: number;
  candidateScore: number;
  scoreDelta: number;
  materialImprovement: boolean;
  reasons: string[];
  tradeoffs: string[];
};

// --- Root result -------------------------------------------------------------

export type ScoredStoryboard = {
  label: string;
  storyboard: PersuasionStoryboard;
  hookPersuasion: HookPersuasionResult;
  scrollStop: ScrollStopResult;
  contextRelevance: ProductContextRelevanceResult;
  benefitVisualization: BenefitVisualizationScore;
  arc: PersuasionArcResult;
  emotionalProgression: EmotionalProgressionResult;
  characterIntegration: CharacterIntegrationResult;
  redundancy: PersuasionRedundancyResult;
  genericAdRisk: GenericAiAdRiskV2Result;
  purchaseMotivationScore: PurchaseMotivationScoreResult;
  desireScore: number;
  qualityGate: CommercialPersuasionQualityGateResult;
};

export type PersuasionEngineVersion = "NONE" | "V1";

export type ScenePersuasionStrategy = {
  sceneId: string;
  purpose: ScenePurpose;
  persuasionObjective: string;
  consumerState: string;
  whyContinueWatching: string;
  productInteraction: ProductInteraction;
  productVisualRole: ProductVisualRole;
  characterNarrativeRole: CharacterNarrativeRole;
  narrationIntent: string;
};

export type PersuasionStrategy = {
  engineVersion: "V1";
  salesAngle: SalesAngle;
  primaryDesire: DesireDriver;
  consumerTension: string | null;
  purchaseMotivation: DesireDriver;
  hookStrategy: {
    selectedVariant: HookVariantId;
    scoreDelta: number;
    winningConcept: HookConcept;
    reasons: string[];
  };
  benefitVisualization: BenefitVisualizationScore;
  persuasionArc: PersuasionArcResult;
  characterNarrativeRoles: CharacterNarrativeRole[];
  offerReveal: OfferRevealPlan;
  ctaPersuasion: CtaPersuasionPlan;
  genericAdRisk: GenericAiAdRiskV2Result;
  sceneStrategies: ScenePersuasionStrategy[];
  scores: {
    desireScore: number;
    hookPersuasion: number;
    scrollStopPower: number;
    productContextRelevance: number;
    benefitVisualization: number;
    purchaseMotivation: number;
    emotionalProgression: number;
    persuasionRedundancy: number;
    characterIntegration: number;
  };
  qualityGate: CommercialPersuasionQualityGateResult;
  traceability: {
    selectedStoryboardLabel: string;
    selectedHookSceneId: string;
    selectedHookReason: string;
    thresholdSummary: Record<string, number | null>;
  };
};
