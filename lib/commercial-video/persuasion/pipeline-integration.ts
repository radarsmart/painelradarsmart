// Radar Creative AI - Controlled Persuasion Pipeline Integration V1
//
// Puro e deterministico: Product Intelligence Grounding -> Desire Engine V1
// -> Hook Optimization -> Commercial Persuasion Quality Gate. Nao chama
// provider, nao gera midia, nao escreve em banco/storage.

import { buildGroundedProductIntelligence } from "@/lib/product-intelligence-grounding/grounded-product-intelligence";
import { buildProductIntelligenceGroundingGate } from "@/lib/product-intelligence-grounding/grounding-gate";
import { buildCleanedProductIntelligenceInput } from "@/lib/product-intelligence-grounding/cleaned-input-adapter";
import type {
  GroundedProductIntelligence,
  ObservedPackagingTextInput,
  ProductIntelligenceGroundingGateResult,
  RawOfferInput,
  RawProductIntelligenceInput,
} from "@/lib/product-intelligence-grounding/types";
import { buildPersuasionEvidence, type OfferInput } from "@/lib/commercial-video/persuasion/claim-grounding";
import { buildProductDesireProfile } from "@/lib/commercial-video/persuasion/product-desire-profile";
import { answerPurchaseMotivationQuestions } from "@/lib/commercial-video/persuasion/purchase-motivation-questions";
import { generateSalesAngleCandidates, selectWinningSalesAngle } from "@/lib/commercial-video/persuasion/sales-angle-engine";
import { buildBenefitVisualizationPlans } from "@/lib/commercial-video/persuasion/benefit-visualization";
import { buildPersuasionStoryboard } from "@/lib/commercial-video/persuasion/persuasion-storyboard-builder";
import { generateHookVariantConcepts, evaluateHookVariant, decideHookOptimization } from "@/lib/commercial-video/persuasion/hook-optimization";
import { scoreStoryboard } from "@/lib/commercial-video/persuasion/scorer";
import { buildOfferRevealPlan } from "@/lib/commercial-video/persuasion/offer-reveal";
import { buildCtaPersuasionPlan } from "@/lib/commercial-video/persuasion/cta-persuasion";
import type {
  BenefitVisualizationPlan,
  HookOptimizationDecision,
  HookVariantEvaluation,
  MotivationAnswer,
  PersuasionEvidence,
  PersuasionStrategy,
  ProductDesireProfile,
  PurchaseMotivationAnswers,
  SalesAngleCandidate,
  ScoredStoryboard,
  StructuralLimitationFinding,
} from "@/lib/commercial-video/persuasion/types";

export type ControlledPersuasionOfferInput = OfferInput &
  RawOfferInput & {
    imageUrl: string | null;
    rating: number | null;
    reviewsCount: number | null;
  };

export type BuildControlledPersuasionPipelineInput = {
  offer: ControlledPersuasionOfferInput;
  productIntelligence: RawProductIntelligenceInput;
  observedPackagingTexts?: ObservedPackagingTextInput[];
  useCharacter: boolean;
};

export type ControlledPersuasionPipelineResult = {
  engineVersion: "V1";
  groundedProductIntelligence: GroundedProductIntelligence;
  groundingGate: ProductIntelligenceGroundingGateResult;
  cleanedProductIntelligence: RawProductIntelligenceInput;
  evidence: PersuasionEvidence;
  desireProfile: ProductDesireProfile;
  motivationAnswers: PurchaseMotivationAnswers;
  salesAngleCandidates: SalesAngleCandidate[];
  winningSalesAngle: SalesAngleCandidate;
  benefitPlans: BenefitVisualizationPlan[];
  hookEvaluations: Array<HookVariantEvaluation & { scoredStoryboard: ScoredStoryboard }>;
  hookDecision: HookOptimizationDecision;
  scoredStoryboard: ScoredStoryboard;
  structuralLimitation: StructuralLimitationFinding;
  persuasionStrategy: PersuasionStrategy;
};

function thresholdSummary(scored: ScoredStoryboard): Record<string, number | null> {
  return Object.fromEntries(scored.qualityGate.checks.map((check) => [check.name, check.threshold]));
}

function statementText(answer: MotivationAnswer): string {
  return `${answer.statement} (${answer.evidence})`;
}

function buildPersuasionStrategy(input: {
  scored: ScoredStoryboard;
  desireProfile: ProductDesireProfile;
  motivationAnswers: PurchaseMotivationAnswers;
  hookDecision: HookOptimizationDecision;
  offerReveal: ReturnType<typeof buildOfferRevealPlan>;
  ctaPersuasion: ReturnType<typeof buildCtaPersuasionPlan>;
}): PersuasionStrategy {
  const { scored, desireProfile, motivationAnswers, hookDecision, offerReveal, ctaPersuasion } = input;
  const hookScene = scored.storyboard.scenes.find((scene) => scene.purpose === "HOOK") ?? scored.storyboard.scenes[0];

  return {
    engineVersion: "V1",
    salesAngle: scored.storyboard.salesAngle,
    primaryDesire: desireProfile.primaryDesire,
    consumerTension: desireProfile.consumerTension,
    purchaseMotivation: desireProfile.purchaseMotivation,
    hookStrategy: {
      selectedVariant: hookDecision.selectedVariant,
      scoreDelta: hookDecision.scoreDelta,
      winningConcept: scored.hookPersuasion.winningConcept,
      reasons: hookDecision.reasons,
    },
    benefitVisualization: scored.benefitVisualization,
    persuasionArc: scored.arc,
    characterNarrativeRoles: scored.storyboard.scenes.map((scene) => scene.characterNarrativeRole),
    offerReveal,
    ctaPersuasion,
    genericAdRisk: scored.genericAdRisk,
    sceneStrategies: scored.storyboard.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      purpose: scene.purpose,
      persuasionObjective: scene.persuasionObjective,
      consumerState: scene.consumerState,
      whyContinueWatching: scene.whyContinueWatching,
      productInteraction: scene.productInteraction,
      productVisualRole: scene.productVisualRole,
      characterNarrativeRole: scene.characterNarrativeRole,
      narrationIntent: scene.narrationIntent,
    })),
    scores: {
      desireScore: scored.desireScore,
      hookPersuasion: scored.hookPersuasion.score,
      scrollStopPower: scored.scrollStop.score,
      productContextRelevance: scored.contextRelevance.score,
      benefitVisualization: scored.benefitVisualization.score,
      purchaseMotivation: scored.purchaseMotivationScore.score,
      emotionalProgression: scored.emotionalProgression.score,
      persuasionRedundancy: scored.redundancy.score,
      characterIntegration: scored.characterIntegration.score,
    },
    qualityGate: scored.qualityGate,
    traceability: {
      selectedStoryboardLabel: scored.storyboard.label,
      selectedHookSceneId: hookScene.sceneId,
      selectedHookReason: statementText(motivationAnswers.whyKeepWatching),
      thresholdSummary: thresholdSummary(scored),
    },
  };
}

export function buildControlledPersuasionPipeline(
  input: BuildControlledPersuasionPipelineInput,
): ControlledPersuasionPipelineResult {
  const observedPackagingTexts = input.observedPackagingTexts ?? [];
  const groundedProductIntelligence = buildGroundedProductIntelligence(
    input.offer,
    input.productIntelligence,
    observedPackagingTexts,
  );
  const groundingGate = buildProductIntelligenceGroundingGate(groundedProductIntelligence);
  const cleanedProductIntelligence = buildCleanedProductIntelligenceInput(groundedProductIntelligence);
  const evidence = buildPersuasionEvidence(input.offer, cleanedProductIntelligence, observedPackagingTexts);
  const desireProfile = buildProductDesireProfile(evidence);
  const motivationAnswers = answerPurchaseMotivationQuestions(evidence, desireProfile);
  const salesAngleCandidates = generateSalesAngleCandidates(evidence, desireProfile);
  const winningSalesAngle = selectWinningSalesAngle(salesAngleCandidates);
  const benefitPlans = buildBenefitVisualizationPlans(evidence, desireProfile);
  const { storyboard: baselineStoryboard, structuralLimitation } = buildPersuasionStoryboard({
    evidence,
    desireProfile,
    salesAngle: winningSalesAngle,
    benefitPlans,
    useCharacter: input.useCharacter,
  });

  const variants = generateHookVariantConcepts(baselineStoryboard.scenes[0], evidence, desireProfile, benefitPlans);
  const hookEvaluations = variants.map((variant) =>
    evaluateHookVariant({ variant, baselineStoryboard, evidence, desireProfile, motivationAnswers }),
  );
  const hookDecision = decideHookOptimization(hookEvaluations);
  const selectedEvaluation = hookEvaluations.find((entry) => entry.variantId === hookDecision.selectedVariant);
  const scoredStoryboard =
    hookDecision.materialImprovement && selectedEvaluation
      ? selectedEvaluation.scoredStoryboard
      : scoreStoryboard("FINAL", baselineStoryboard, evidence, desireProfile, motivationAnswers);

  const offerReveal = buildOfferRevealPlan(evidence);
  const ctaRole = scoredStoryboard.storyboard.scenes.find((scene) => scene.purpose === "CTA")?.characterNarrativeRole ?? "NONE";
  const ctaPersuasion = buildCtaPersuasionPlan(offerReveal, ctaRole);
  const persuasionStrategy = buildPersuasionStrategy({
    scored: scoredStoryboard,
    desireProfile,
    motivationAnswers,
    hookDecision,
    offerReveal,
    ctaPersuasion,
  });

  return {
    engineVersion: "V1",
    groundedProductIntelligence,
    groundingGate,
    cleanedProductIntelligence,
    evidence,
    desireProfile,
    motivationAnswers,
    salesAngleCandidates,
    winningSalesAngle,
    benefitPlans,
    hookEvaluations,
    hookDecision,
    scoredStoryboard,
    structuralLimitation,
    persuasionStrategy,
  };
}
