// Radar Creative AI - Creative Director V2 / Orchestrator
//
// Roda buildCommercialDirection() (V1, INTOCADO) e enriquece o resultado com
// a camada de direcao criativa estruturada do V2. Unico ponto de I/O e o que
// ja existe dentro de buildCommercialDirection (Character Pack via Supabase,
// so leitura, so quando officialCharacterSlug esta setado) - V2 nao adiciona
// nenhuma chamada de rede/banco nova. Nunca decide provider, nunca gera
// midia, nunca grava no banco.

import { buildCommercialDirection } from "@/lib/commercial-director/director";
import type { CommercialDirection, CommercialDirectorInput } from "@/lib/commercial-director/types";

import { selectAudienceIntent, selectCreativeConcept, selectEmotionalAngle } from "@/lib/creative-director-v2/creative-concept";
import { evaluateHookStrength, HOOK_STRENGTH_MIN_SCORE } from "@/lib/creative-director-v2/hook-engine";
import { buildCharacterRoleDirection, summarizeCharacterRoles } from "@/lib/creative-director-v2/character-role-director";
import { buildOfferPresentationV2 } from "@/lib/creative-director-v2/offer-presentation";
import { buildCtaDirectionV2 } from "@/lib/creative-director-v2/cta-director";
import { buildPacingDirection } from "@/lib/creative-director-v2/pacing-director";
import { buildSceneBlueprint } from "@/lib/creative-director-v2/scene-blueprint-builder";
import {
  computeFirstProductAppearance,
  computeHeroProductDuration,
  selectBenefitStrategy,
  selectProductPositionStrategy,
  selectProductScaleTarget,
} from "@/lib/creative-director-v2/product-presentation";
import { assessGenericAdRisk } from "@/lib/creative-director-v2/generic-ad-risk";
import { runCreativeStoryboardQualityGate } from "@/lib/creative-director-v2/storyboard-quality-gate";
import { compareAgainstBenchmark, SHORT_FORM_PREMIUM_COMMERCE } from "@/lib/creative-director-v2/benchmark-profile";
import type { CampaignQualityTargets, CommercialCreativeDirectionV2 } from "@/lib/creative-director-v2/types";
import type { SceneBlueprintContext } from "@/lib/creative-director-v2/scene-blueprint-builder";
import type { PersuasionStrategy } from "@/lib/commercial-video/persuasion/types";

const PRODUCT_CENTRIC_SELLING_ARGUMENTS = new Set(["DEMONSTRATION", "PRACTICAL_BENEFIT"]);

export type SceneBlueprintOverride = Pick<
  SceneBlueprintContext,
  "environmentOverride" | "transitionOverride" | "productPresentationOverride" | "productRoleOverride" | "subjectPriorityOverride"
>;

export type ProductAppearanceOverride = { firstProductAppearanceSecond: number | null; heroProductDuration: number };

// Extraido de buildCommercialCreativeDirectionV2 para ser reaproveitado pelo
// Decision Engine (lib/creative-director-v2/decision-engine/**), que monta
// seu PROPRIO `direction` (mesmo tipo CommercialDirection, cenas/hookStrategy/
// duracao genuinamente novas) e reusa esta funcao pura pra ganhar de graca
// todo blueprint/gate/risco/benchmark ja calculado - sem duplicar nada disto
// aqui. Pura, sem I/O (todo I/O ja aconteceu dentro de buildCommercialDirection
// antes de chegar aqui). `sceneOverrides`/`productAppearanceOverride` sao
// OPCIONAIS e so usados pelo Decision Engine (environment/transition/
// productPresentation/productRole/subjectPriority por cena, e correcao de
// firstProductAppearanceSecond/heroProductDuration quando o HOOK e
// product-centric de verdade - ver scene-subject-direction.ts) - omitidos em
// todo o resto do V2, comportamento identico ao anterior.
export function assembleCommercialCreativeDirectionV2(
  direction: CommercialDirection,
  input: CommercialDirectorInput,
  sceneOverrides?: Array<SceneBlueprintOverride | undefined>,
  productAppearanceOverride?: ProductAppearanceOverride,
  persuasionStrategy?: PersuasionStrategy | null,
): CommercialCreativeDirectionV2 {
  const { concept, reason: creativeConceptReason } = selectCreativeConcept(direction, input);
  const { intent: audienceIntent, reason: audienceIntentReason } = selectAudienceIntent(input);
  const { angle: emotionalAngle, reason: emotionalAngleReason } = selectEmotionalAngle(direction);
  const pacing = buildPacingDirection(direction);

  const hookScene = direction.scenes.find((s) => s.purpose === "HOOK") ?? direction.scenes[0];
  const hookStrength = evaluateHookStrength(hookScene, direction);

  const characterRoles = direction.scenes.map((scene) => buildCharacterRoleDirection(scene, direction));
  const characterRoleSummary = summarizeCharacterRoles(characterRoles);

  const offerPresentation = buildOfferPresentationV2(direction.offerStrategy, direction.ctaStrategy);

  const ctaSceneIndex = direction.scenes.findIndex((s) => s.purpose === "CTA");
  const ctaCharacterRole = ctaSceneIndex >= 0 ? characterRoles[ctaSceneIndex] : characterRoles[characterRoles.length - 1];
  const ctaDirection = buildCtaDirectionV2(direction, ctaCharacterRole);

  const sceneBlueprints = direction.scenes.map((scene, index) =>
    buildSceneBlueprint(scene, direction, characterRoles[index], {
      concept,
      emotionalAngle,
      pacingStyle: pacing.style,
      offerPresentation,
      hookStrength: scene.purpose === "HOOK" ? hookStrength : null,
      ...sceneOverrides?.[index],
    }),
  );

  const heroBlueprint = sceneBlueprints.find((b) => b.productRole === "HERO") ?? sceneBlueprints.find((b) => b.productPresentationStrategy !== null) ?? null;
  const productPresentationStrategy = heroBlueprint?.productPresentationStrategy ?? null;
  const firstProductAppearanceSecond = productAppearanceOverride
    ? productAppearanceOverride.firstProductAppearanceSecond
    : computeFirstProductAppearance(direction.scenes);
  const heroProductDuration = productAppearanceOverride ? productAppearanceOverride.heroProductDuration : computeHeroProductDuration(direction.scenes);
  const productScaleTarget = selectProductScaleTarget(productPresentationStrategy);
  const productPositionStrategy = selectProductPositionStrategy(heroBlueprint?.overlayPlan.safeAreaDirection ?? "NONE");
  const { strategy: benefitStrategy } = selectBenefitStrategy(direction);

  const motionStrategySummary =
    `intensidade de movimento "${pacing.motionIntensity}", ${pacing.cutsPerMinute} cortes/min, ` +
    `estilo de ritmo "${pacing.style}" em ${direction.sceneCount} cenas`;

  const genericAdRisk = assessGenericAdRisk({
    direction,
    sceneBlueprints,
    hookStrength,
    firstProductAppearanceSecond,
    offerPresentation,
    ctaDirection,
  });

  const storyboardQualityGate = runCreativeStoryboardQualityGate({
    direction,
    hookStrength,
    sceneBlueprints,
    pacing,
    offerPresentation,
    ctaDirection,
    characterRoleSummary,
    genericAdRisk,
  });

  const hasVisualOffer = offerPresentation.pricePriority !== "NONE" || offerPresentation.discountPriority !== "NONE";
  const hasClearCta = ctaDirection.ctaOverlayLayout.overlayInstructions.ctaText !== null;
  const benchmarkComparison = compareAgainstBenchmark(
    { hookStrength, productScaleTarget, pacing, sceneBlueprints, hasVisualOffer, hasClearCta },
    SHORT_FORM_PREMIUM_COMMERCE,
  );

  const qualityTargets: CampaignQualityTargets = {
    hookStrengthMinimum: HOOK_STRENGTH_MIN_SCORE,
    maxAcceptableGenericAdRisk: "MEDIUM",
    requireProductBeforeSecond: PRODUCT_CENTRIC_SELLING_ARGUMENTS.has(direction.sellingArgument)
      ? Math.round(direction.durationSeconds * 0.4)
      : null,
    requireCtaVisualAction: characterRoleSummary.appears,
  };

  const reasoningSummary =
    `Conceito "${concept}" (${creativeConceptReason}). ` +
    `Publico "${audienceIntent}" (${audienceIntentReason}). ` +
    `Angulo emocional "${emotionalAngle}" (${emotionalAngleReason}). ` +
    `Hook score ${hookStrength.overallScore}/100 (minimo ${HOOK_STRENGTH_MIN_SCORE}). ` +
    `Risco de anuncio generico: ${genericAdRisk.risk}. ` +
    `Storyboard quality gate: ${storyboardQualityGate.status}.`;

  return {
    campaignObjective: direction.objective,
    creativeConcept: concept,
    creativeConceptReason,
    audienceIntent,
    audienceIntentReason,
    emotionalAngle,
    emotionalAngleReason,
    visualWorld: direction.visualStyle,
    pacingStyle: pacing,
    hookStrategy: direction.hookStrategy,
    hookStrength,
    productPresentationStrategy,
    firstProductAppearanceSecond,
    heroProductDuration,
    productScaleTarget,
    productPositionStrategy,
    benefitStrategy,
    offerPresentation,
    characterRoleSummary,
    ctaDirection,
    motionStrategySummary,
    sceneBlueprints,
    genericAdRisk,
    storyboardQualityGate,
    benchmarkComparison,
    qualityTargets,
    reasoningSummary,
    persuasionStrategy: persuasionStrategy ?? null,
    commercialPersuasionQualityGate: persuasionStrategy?.qualityGate ?? null,
    underlyingDirection: direction,
  };
}

export async function buildCommercialCreativeDirectionV2(
  input: CommercialDirectorInput,
  persuasionStrategy?: PersuasionStrategy | null,
): Promise<CommercialCreativeDirectionV2> {
  const direction = await buildCommercialDirection(input);
  return assembleCommercialCreativeDirectionV2(direction, input, undefined, undefined, persuasionStrategy);
}
