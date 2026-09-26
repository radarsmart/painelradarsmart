// Radar Creative AI - Creative Director V2 / Decision Engine / Scene Plan Builder
//
// O montador central: produz um NOVO CommercialDirection (mesmo tipo de V1,
// import direto - nao redeclarado) com hook/geometria/ambiente/timing/
// transicoes/performance de personagem genuinamente redecididos. Reusa
// diretamente do V1 (`v1`, passado como referencia factual, NUNCA mutado)
// os campos que ja sao bem decididos e nao fazem parte do escopo desta fase
// (objective, sellingArgument, storyStructure, pace, visualStyle,
// proofStrategy, presenterStrategy, audioDirection, textOverlayStrategy,
// ctaStrategy) - so redecide hookStrategy/offerStrategy(depende do hook)/
// scenes/durationSeconds/sceneCount. Mantém a MESMA sequencia de purposes de
// V1 (mesma estrutura narrativa - este ciclo re-decide DENTRO de cada cena,
// nao adiciona/remove cena).

import type { CommercialDirection, CommercialDirectorInput, CommercialScene } from "@/lib/commercial-director/types";
import { buildOfferStrategy } from "@/lib/commercial-director/proof-and-offer";
import type { SceneBlueprintOverride } from "@/lib/creative-director-v2/creative-director-v2";
import type { PacingStyleV2 } from "@/lib/creative-director-v2/types";

import { selectHookStrategyV2, type HookDecisionResult } from "@/lib/creative-director-v2/decision-engine/hook-decision-engine";
import { HOOK_STRATEGY_V2_TO_V1 } from "@/lib/creative-director-v2/decision-engine/hook-strategy-v2";
import { buildSceneGeometry, renderGeometryToCameraString, renderGeometryToMotionString } from "@/lib/creative-director-v2/decision-engine/scene-geometry";
import { buildVisualWorldDirection, type VisualWorldDirection } from "@/lib/creative-director-v2/decision-engine/visual-world";
import { decideEnvironmentPurpose, deriveSceneEnvironment, type EnvironmentPurpose } from "@/lib/creative-director-v2/decision-engine/environment-decision";
import { decideScenePacing } from "@/lib/creative-director-v2/decision-engine/pacing-decision";
import { assignTransitionSequence } from "@/lib/creative-director-v2/decision-engine/transition-variety";
import { decideCharacterPerformance, toCharacterDirectionFields } from "@/lib/creative-director-v2/decision-engine/character-performance-decision";
import { decideProductPresentationSequence } from "@/lib/creative-director-v2/decision-engine/product-presentation-decision";
import { isCampaignProductCentric } from "@/lib/creative-director-v2/decision-engine/product-scale-decision";
import {
  computeFirstProductAppearanceV2,
  computeHeroProductDurationV2,
  deriveHookSceneSubjectDirection,
  isProductCentricSceneV2,
} from "@/lib/creative-director-v2/decision-engine/scene-subject-direction";
import type { ProductAppearanceOverride } from "@/lib/creative-director-v2/creative-director-v2";
import type { PersuasionStrategy, ScenePersuasionStrategy } from "@/lib/commercial-video/persuasion/types";

// Mesmo mapeamento conceitual de lib/creative-director-v2/pacing-director.ts
// (PACE_TO_STYLE, nao exportada de la) - replicado aqui como tabela de 3
// linhas, nao logica.
function mapPaceToStyleV2(pace: CommercialDirection["pace"]): PacingStyleV2 {
  if (pace === "FAST") return "FAST";
  if (pace === "CINEMATIC") return "PREMIUM_SLOW";
  return "BALANCED";
}

export type ScenePlanBuildResult = {
  direction: CommercialDirection;
  sceneOverrides: SceneBlueprintOverride[];
  hookDecision: HookDecisionResult;
  visualWorld: VisualWorldDirection;
  environmentPurposes: EnvironmentPurpose[];
  productAppearanceOverride: ProductAppearanceOverride;
};

function findPersuasionSceneForPurpose(
  strategy: PersuasionStrategy | null | undefined,
  purpose: CommercialScene["purpose"],
  occurrenceIndex: number,
): ScenePersuasionStrategy | null {
  if (!strategy) return null;
  const samePurpose = strategy.sceneStrategies.filter((scene) => scene.purpose === purpose);
  return samePurpose[occurrenceIndex] ?? samePurpose[0] ?? null;
}

function applyPersuasionToScene(
  scene: CommercialScene,
  persuasionScene: ScenePersuasionStrategy | null,
  hasCharacterInCampaign: boolean,
  referenceScene: CommercialScene | null,
): CommercialScene {
  if (!persuasionScene) return scene;

  const wantsCharacter = hasCharacterInCampaign && persuasionScene.characterNarrativeRole !== "NONE";
  const characterPerformance = wantsCharacter ? decideCharacterPerformance(scene.purpose) : null;

  return {
    ...scene,
    presenter: wantsCharacter ? "GAROTA_RADAR_FULL" : "PRODUCT_ONLY",
    visualSubject: persuasionScene.persuasionObjective,
    productAction: `${persuasionScene.productVisualRole} / ${persuasionScene.productInteraction}`,
    characterDirection: characterPerformance ? toCharacterDirectionFields(characterPerformance) : null,
    identityReferenceAssetId: wantsCharacter ? scene.identityReferenceAssetId ?? referenceScene?.identityReferenceAssetId ?? null : null,
    supportReferenceAssetId: wantsCharacter ? scene.supportReferenceAssetId ?? referenceScene?.supportReferenceAssetId ?? null : null,
    voiceoverIntent: persuasionScene.narrationIntent,
    sfxIntent: persuasionScene.productInteraction === "APPLIED" || persuasionScene.productInteraction === "DEMONSTRATED" ? "subtle tactile product-use sound" : scene.sfxIntent,
  };
}

function productPresentationOverrideFromPersuasion(
  persuasionScene: ScenePersuasionStrategy | null,
): SceneBlueprintOverride["productPresentationOverride"] | undefined {
  if (!persuasionScene) return undefined;
  if (persuasionScene.productVisualRole === "DEMONSTRATION") return "BENEFIT_DEMO";
  if (persuasionScene.productVisualRole === "INGREDIENT_STORY") return "MACRO_DETAIL";
  if (persuasionScene.productVisualRole === "EXPERIENCE" || persuasionScene.productInteraction === "APPLIED") return "LIFESTYLE_CONTEXT";
  if (persuasionScene.productVisualRole === "PACKSHOT") return "PACKSHOT_OFFER";
  return undefined;
}

function isPersuasionProductCentric(persuasionScene: ScenePersuasionStrategy | null): boolean {
  return Boolean(
    persuasionScene &&
      persuasionScene.productInteraction !== "NONE",
  );
}

export function buildDecisionEngineScenePlan(
  input: CommercialDirectorInput,
  v1: CommercialDirection,
  persuasionStrategy?: PersuasionStrategy | null,
): ScenePlanBuildResult {
  const purposes = v1.scenes.map((scene) => scene.purpose);
  const hasCharacterInCampaign = v1.presenterStrategy !== "PRODUCT_ONLY";
  const characterReferenceScene = v1.scenes.find((scene) => scene.identityReferenceAssetId || scene.supportReferenceAssetId) ?? null;

  const pacingPlan = decideScenePacing(purposes, v1.durationSeconds);
  const pacingStyleV2 = mapPaceToStyleV2(v1.pace);
  const visualWorld = buildVisualWorldDirection(v1.visualStyle);
  const environmentPurposes = purposes.map(decideEnvironmentPurpose);
  const environmentStrings = environmentPurposes.map((p) => deriveSceneEnvironment(visualWorld, p));
  const transitionSequence = assignTransitionSequence(purposes, pacingStyleV2);

  // Direction "rascunho": tudo que ja e reusavel de V1 esta correto aqui;
  // hookStrategy/offerStrategy/scenes/durationSeconds/sceneCount ainda sao
  // placeholders, substituidos depois que o hook e decidido.
  const draftDirection: CommercialDirection = {
    ...v1,
    scenes: [],
  };

  const hookDecision = selectHookStrategyV2(input, draftDirection, hasCharacterInCampaign);
  const finalHookStrategy = HOOK_STRATEGY_V2_TO_V1[hookDecision.strategyV2];

  const offerStrategy = buildOfferStrategy({
    price: input.price,
    originalPrice: input.originalPrice,
    discountPct: input.discountPct,
    sellingArgument: v1.sellingArgument,
    hookStrategy: finalHookStrategy,
  });

  const purposeOccurrenceCounts: Partial<Record<CommercialScene["purpose"], number>> = {};
  const persuasionScenesByIndex: Array<ScenePersuasionStrategy | null> = purposes.map((purpose) => {
    const occurrenceIndex = purposeOccurrenceCounts[purpose] ?? 0;
    purposeOccurrenceCounts[purpose] = occurrenceIndex + 1;
    return findPersuasionSceneForPurpose(persuasionStrategy, purpose, occurrenceIndex);
  });

  const scenes: CommercialScene[] = purposes.map((purpose, index) => {
    const pacingEntry = pacingPlan.scenes[index];
    const base = v1.scenes[index];
    const persuasionScene = persuasionScenesByIndex[index];

    if (purpose === "HOOK") {
      const hookScene = {
        ...hookDecision.hookScene,
        id: `scene-${index + 1}`,
        order: index + 1,
        startSecond: pacingEntry.startSecond,
        endSecond: pacingEntry.endSecond,
        lighting: environmentStrings[index],
        transitionIntent: transitionSequence[index],
      };
      return applyPersuasionToScene(hookScene, persuasionScene, hasCharacterInCampaign, characterReferenceScene);
    }

    const geometry = buildSceneGeometry(purpose);
    const hasCharacterInScene = base.presenter !== "PRODUCT_ONLY";
    const performance = hasCharacterInScene ? decideCharacterPerformance(purpose) : null;

    return applyPersuasionToScene({
      ...base,
      id: `scene-${index + 1}`,
      order: index + 1,
      startSecond: pacingEntry.startSecond,
      endSecond: pacingEntry.endSecond,
      camera: renderGeometryToCameraString(geometry),
      motion: renderGeometryToMotionString(geometry),
      lighting: environmentStrings[index],
      characterDirection: performance ? toCharacterDirectionFields(performance) : null,
      transitionIntent: transitionSequence[index],
    }, persuasionScene, hasCharacterInCampaign, characterReferenceScene);
  });

  const direction: CommercialDirection = {
    ...v1,
    hookStrategy: finalHookStrategy,
    offerStrategy,
    durationSeconds: pacingPlan.totalDurationSeconds,
    sceneCount: scenes.length,
    scenes,
    reasoningSummary:
      `Decision Engine V2: hook "${hookDecision.strategyV2}" (score ${hookDecision.evaluation.overallScore}/100, ` +
      `${hookDecision.attempts.length} tentativa(s), abaixo do alvo=${hookDecision.belowTarget}). ` +
      `Duracao total ${pacingPlan.totalDurationSeconds}s (V1 era ${v1.durationSeconds}s).`,
  };

  const baseProductPresentationSequence = decideProductPresentationSequence(scenes, direction);
  const productCentric = isCampaignProductCentric(v1.sellingArgument);

  // Item 5/6 do pedido: campanha product-centric nao pode deixar o produto
  // pequeno so porque o fallback generico de V1 (ENVIRONMENTAL_STAGE, que
  // mapeia pra escala MEDIUM em selectProductScaleTarget) foi escolhido.
  // ROTATION_SHOWCASE mapeia pra escala LARGE e ja e semanticamente
  // compativel com "mostrar o produto ativamente" - upgrade so quando o
  // fallback fraco foi escolhido, nunca substitui uma escolha mais
  // especifica (LIFESTYLE_CONTEXT/COMPARISON continuam intocadas).
  const productPresentationSequence = baseProductPresentationSequence.map((strategy, index) => {
    if (productCentric && purposes[index] === "PRODUCT" && strategy === "ENVIRONMENTAL_STAGE") {
      return "ROTATION_SHOWCASE";
    }
    return strategy;
  });

  // Correcao semantica (nao visual): o HOOK e classificado como
  // product-centric ou nao a partir do STAGING REAL da estrategia vencedora
  // (deriveHookSceneSubjectDirection), nunca por ScenePurpose sozinho -
  // scene-blueprint-builder.ts/product-presentation.ts (Fase 1) continuam
  // classificando HOOK como "nao product-centric" por padrao; so
  // sobrescrevemos quando o hook de fato revela produto como sujeito
  // (HERO_PRODUCT_REVEAL/PRICE_SHOCK/LUXURY_REVEAL). Nao muda camera/motion/
  // timing/hookStrategy/CTA - so os campos de METADADO usados pelas metricas.
  const hookHasCharacter = scenes[0].characterDirection !== null;
  const hookSubjectDirection = deriveHookSceneSubjectDirection(hookDecision.strategyV2, hookHasCharacter);
  const persuasionHookIsProductCentric = isPersuasionProductCentric(persuasionScenesByIndex[0]);
  const hookIsProductCentric = persuasionHookIsProductCentric || isProductCentricSceneV2(hookSubjectDirection);

  const productAppearanceOverride: ProductAppearanceOverride = {
    firstProductAppearanceSecond: persuasionHookIsProductCentric ? scenes[0].startSecond : computeFirstProductAppearanceV2(scenes, hookSubjectDirection),
    heroProductDuration: persuasionHookIsProductCentric
      ? Math.max(0, scenes[0].endSecond - scenes[0].startSecond)
      : computeHeroProductDurationV2(scenes, hookSubjectDirection),
  };

  const sceneOverrides: SceneBlueprintOverride[] = purposes.map((_, index) => {
    const persuasionScene = persuasionScenesByIndex[index];
    const persuasionPresentationOverride = productPresentationOverrideFromPersuasion(persuasionScene);
    const persuasionProductCentric = isPersuasionProductCentric(persuasionScene);

    return {
      environmentOverride: persuasionScene?.persuasionObjective
        ? `${environmentStrings[index]} | Persuasion objective: ${persuasionScene.persuasionObjective}`
        : environmentStrings[index],
      transitionOverride: transitionSequence[index],
      productPresentationOverride: persuasionPresentationOverride ?? productPresentationSequence[index],
      ...(index === 0 && hookIsProductCentric
        ? { productRoleOverride: "HERO" as const, subjectPriorityOverride: "PRODUCT" as const, productPresentationOverride: "HERO_REVEAL" as const }
        : {}),
      ...(persuasionProductCentric
        ? { productRoleOverride: "HERO" as const, subjectPriorityOverride: "PRODUCT" as const }
        : {}),
    };
  });

  return { direction, sceneOverrides, hookDecision, visualWorld, environmentPurposes, productAppearanceOverride };
}
