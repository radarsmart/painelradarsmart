// Radar Creative AI - Creative Director V2 / Types
//
// V2 NAO substitui o Commercial Director (V1) - ele roda buildCommercialDirection()
// (lib/commercial-director/director.ts, intocado) e ENRIQUECE o resultado com uma
// camada de direcao criativa estruturada, decidida ANTES de qualquer escolha de
// provider. Reaproveita tipos de V1 por import direto sempre que possivel; so
// declara tipo novo quando o conceito realmente nao existe em V1.
//
// Nenhum campo aqui escolhe provider/capability - isso continua sendo autoridade
// exclusiva do Generation Orchestrator (lib/generation-orchestrator/**).

import type {
  CommercialDirection,
  CommercialObjective,
  CommercialScene,
  CtaStrategy,
  HookStrategy,
  OfferStrategy,
  ScenePurpose,
  VisualStyle,
} from "@/lib/commercial-director/types";
import type { OverlayPlanResult } from "@/lib/prompt-builder/overlay-plan";
import type { SafeAreaDirection } from "@/lib/prompt-builder/types";
import type { ProductPlacement } from "@/lib/generation-orchestrator/product-generation-strategy";
import type { CommercialPersuasionQualityGateResult, PersuasionStrategy } from "@/lib/commercial-video/persuasion/types";

// --- 3. Creative Concept --------------------------------------------------

export type CreativeConcept =
  | "SURPRISING_DISCOVERY"
  | "ACCESSIBLE_LUXURY"
  | "VISUAL_TRANSFORMATION"
  | "IRRESISTIBLE_PRICE"
  | "SMART_COMPARISON"
  | "QUICK_DEMONSTRATION"
  | "PROBLEM_SOLUTION"
  | "TREND_DESIRE"
  | "VISUAL_PROOF"
  | "ASPIRATIONAL_LIFESTYLE";

export type AudienceIntent = "IMPULSE" | "CONSIDERED" | "ASPIRATIONAL" | "PROBLEM_SOLVING" | "GIFTING";

export type EmotionalAngle = "EXCITEMENT" | "RELIEF" | "ASPIRATION" | "CURIOSITY" | "TRUST" | "URGENCY" | "PRIDE";

// --- 4. Hook Engine V2 -----------------------------------------------------

export type HookSubScore = { score: number; reason: string };

export type HookStrengthEvaluation = {
  immediateSubjectPresence: HookSubScore;
  visualContrast: HookSubScore;
  motionIntensity: HookSubScore;
  curiosity: HookSubScore;
  messageClarity: HookSubScore;
  mobileReadability: HookSubScore;
  overallScore: number;
  passesMinimum: boolean;
  weakSignals: string[];
};

// --- 6. Product Presentation Strategies -------------------------------------

export type ProductPresentationStrategy =
  | "HERO_REVEAL"
  | "MACRO_DETAIL"
  | "FLOATING_PREMIUM"
  | "ENVIRONMENTAL_STAGE"
  | "ROTATION_SHOWCASE"
  | "BENEFIT_DEMO"
  | "LIFESTYLE_CONTEXT"
  | "COMPARISON"
  | "BEFORE_AFTER"
  | "PACKSHOT_OFFER";

export type ProductScaleTarget = "SMALL" | "MEDIUM" | "LARGE" | "HERO_FULL_FRAME";

export type BenefitStrategy = "DIRECT_DEMO" | "BEFORE_AFTER" | "COMPARISON" | "SENSORY_CLOSEUP" | "LIFESTYLE_INTEGRATION";

// --- 7. Visual Effect Directions --------------------------------------------

export type VisualEffectDirection =
  | "PARTICLES"
  | "SMOKE"
  | "LIQUID_SPLASH"
  | "FABRIC_MOTION"
  | "LIGHT_STREAK"
  | "BOKEH"
  | "REFLECTIONS"
  | "LENS_MOVEMENT"
  | "PARALLAX"
  | "PUSH_IN"
  | "ORBITAL_MOTION"
  | "REVEAL"
  | "GLOW";

export type SceneEffectDirection = {
  effects: VisualEffectDirection[];
  // true quando a cena e product-centric: os efeitos so podem existir
  // atras/ao redor do produto - nunca redesenhar a embalagem. Rotulo apenas;
  // quem garante isso de fato e lib/compositor/hybrid-product-compositor.ts.
  productSafeOnly: boolean;
};

// --- 8. Character Role -------------------------------------------------------

export type CharacterRole = "NONE" | "HOOK_PRESENTER" | "EXPLAINER" | "SOCIAL_PROOF_PRESENTER" | "OFFER_PRESENTER" | "CTA_PRESENTER";

export type CharacterRoleDirection = {
  role: CharacterRole;
  reason: string;
  entrance: string | null;
  line: string | null;
  emotion: string | null;
  gesture: string | null;
  durationSeconds: number;
  position: SafeAreaDirection;
};

export type CharacterRoleSummary = {
  appears: boolean;
  rolesUsed: CharacterRole[];
  reason: string;
};

// --- 9. CTA V2 -----------------------------------------------------------

export type CtaVisualAction = "POINT_TO_BUTTON" | "POINT_DOWN" | "HOLD_PRODUCT" | "OPEN_HAND" | "LOOK_TO_CTA" | "NONE";

export type CtaDirectionV2 = CtaStrategy & {
  ctaSecondary: string | null;
  ctaVisualAction: CtaVisualAction;
  ctaCharacterGesture: string | null;
  ctaOverlayLayout: OverlayPlanResult;
  ctaDuration: number;
};

// --- 10. Offer Presentation ------------------------------------------------

export type OfferPriority = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type OfferPresentationV2 = {
  pricePriority: OfferPriority;
  discountPriority: OfferPriority;
  urgencyAllowed: boolean;
  comparisonAllowed: boolean;
  ctaPriority: OfferPriority;
};

// --- 11. Scene Blueprint V2 -------------------------------------------------

export type SubjectPriority = "PRODUCT" | "CHARACTER" | "TEXT_OVERLAY" | "ENVIRONMENT";
export type ProductRole = "NONE" | "HERO" | "SUPPORTING" | "BACKGROUND";
export type NarrationIntent = "DISCOVERY" | "DESIRE" | "BENEFIT" | "OFFER" | "CTA";
export type TransitionIntentV2 = "CUT" | "MATCH_CUT" | "MOTION_CUT" | "CROSSFADE" | "FLASH" | "WHIP" | "ZOOM" | "REVEAL";

export type NarrationRoleDirection = {
  intent: NarrationIntent;
  tone: string;
  energy: "LOW" | "MEDIUM" | "HIGH";
  messagePriority: OfferPriority;
};

export type SceneQualityTargets = {
  minHookStrength: number | null;
  requiresProductVisible: boolean;
  requiresCtaVisualAction: boolean;
};

export type SceneBlueprintV2 = {
  sceneId: string;
  purpose: ScenePurpose;
  creativeIntent: string;
  visualObjective: string;
  subjectPriority: SubjectPriority;
  productRole: ProductRole;
  productPresentationStrategy: ProductPresentationStrategy | null;
  characterRole: CharacterRoleDirection;
  motionDirection: string;
  cameraDirection: string;
  environmentDirection: string;
  effectDirection: SceneEffectDirection;
  overlayPlan: OverlayPlanResult;
  narrationRole: NarrationRoleDirection;
  transitionIntent: TransitionIntentV2;
  desiredDuration: number;
  qualityTargets: SceneQualityTargets;
};

// --- 13/14. Storyboard Quality Gate + Generic Ad Risk -----------------------

export type CreativeQualityStatus = "PASS" | "PASS_WITH_OBSERVATIONS" | "FAIL";

export type CreativeQualityCheckName =
  | "HOOK_STRENGTH"
  | "PRODUCT_VISIBILITY"
  | "VISUAL_VARIETY"
  | "PACING"
  | "SCENE_PURPOSE_CLARITY"
  | "OFFER_CLARITY"
  | "CTA_STRENGTH"
  | "CHARACTER_USAGE"
  | "MOBILE_READABILITY"
  | "BRAND_INTEGRATION"
  | "GENERIC_AD_RISK";

export type CreativeQualityCheckResult = {
  name: CreativeQualityCheckName;
  status: CreativeQualityStatus;
  issues: string[];
};

export type CreativeStoryboardQualityGateResult = {
  status: CreativeQualityStatus;
  checks: CreativeQualityCheckResult[];
  blockingReasons: string[];
  observations: string[];
};

export type GenericAdRiskReason =
  | "EMPTY_OPENING_SECONDS"
  | "WEAK_HOOK_SCORE"
  | "REPETITIVE_COMPOSITION"
  | "NO_RELEVANT_MOTION"
  | "GENERIC_NARRATION_INTENT"
  | "WEAK_CTA"
  | "NO_BENEFIT_SIGNAL"
  | "PRESENTER_WITHOUT_FUNCTION"
  | "PRICE_WITHOUT_HIERARCHY"
  | "PRODUCT_TOO_LATE";

export type GenericAdRiskResult = {
  risk: "LOW" | "MEDIUM" | "HIGH";
  reasons: GenericAdRiskReason[];
  details: string[];
};

// --- 15. Pacing V2 -----------------------------------------------------------

export type PacingStyleV2 = "FAST" | "BALANCED" | "PREMIUM_SLOW";
export type MotionIntensityLevel = "LOW" | "MEDIUM" | "HIGH";
export type InformationDensityLevel = "LOW" | "MEDIUM" | "HIGH";

export type PacingDirectionV2 = {
  style: PacingStyleV2;
  averageSceneDurationSeconds: number;
  cutsPerMinute: number;
  motionIntensity: MotionIntensityLevel;
  informationDensity: InformationDensityLevel;
  reason: string;
};

// --- 19. Benchmark Mode -------------------------------------------------------

export type CreativeBenchmarkProfile = {
  slug: string;
  name: string;
  minHookScore: number;
  minProductScaleTarget: ProductScaleTarget;
  maxAverageSceneDurationSeconds: number;
  requiresOneIdeaPerScene: boolean;
  requiresVisualOffer: boolean;
  requiresClearCta: boolean;
  disallowsEmptyScenes: boolean;
};

export type BenchmarkCheckResult = { criterion: string; met: boolean; detail: string };

export type BenchmarkComparisonResult = {
  benchmarkSlug: string;
  matchScore: number;
  checks: BenchmarkCheckResult[];
};

// --- Campaign-level quality targets ------------------------------------------

export type CampaignQualityTargets = {
  hookStrengthMinimum: number;
  maxAcceptableGenericAdRisk: "LOW" | "MEDIUM" | "HIGH";
  requireProductBeforeSecond: number | null;
  requireCtaVisualAction: boolean;
};

// --- Root contract -------------------------------------------------------

export type CommercialCreativeDirectionV2 = {
  campaignObjective: CommercialObjective;
  creativeConcept: CreativeConcept;
  creativeConceptReason: string;
  audienceIntent: AudienceIntent;
  audienceIntentReason: string;
  emotionalAngle: EmotionalAngle;
  emotionalAngleReason: string;
  visualWorld: VisualStyle;
  pacingStyle: PacingDirectionV2;
  hookStrategy: HookStrategy;
  hookStrength: HookStrengthEvaluation;
  productPresentationStrategy: ProductPresentationStrategy | null;
  firstProductAppearanceSecond: number | null;
  heroProductDuration: number;
  productScaleTarget: ProductScaleTarget;
  productPositionStrategy: ProductPlacement;
  benefitStrategy: BenefitStrategy;
  offerPresentation: OfferPresentationV2;
  characterRoleSummary: CharacterRoleSummary;
  ctaDirection: CtaDirectionV2;
  motionStrategySummary: string;
  sceneBlueprints: SceneBlueprintV2[];
  genericAdRisk: GenericAdRiskResult;
  storyboardQualityGate: CreativeStoryboardQualityGateResult;
  benchmarkComparison: BenchmarkComparisonResult;
  qualityTargets: CampaignQualityTargets;
  reasoningSummary: string;
  persuasionStrategy: PersuasionStrategy | null;
  commercialPersuasionQualityGate: CommercialPersuasionQualityGateResult | null;
  // V1 completo, mantido para rastreabilidade e para o comparador V1xV2 -
  // nunca reescrito, nunca duplicado (mesma instancia devolvida por
  // buildCommercialDirection()).
  underlyingDirection: CommercialDirection;
};

// Reexport de conveniencia para quem so importa deste modulo.
export type { CommercialScene, CommercialDirection, OfferStrategy, ScenePurpose };
