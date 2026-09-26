// Radar Creative AI - Commercial Director
//
// Orquestrador: liga Product Intelligence + Creative Brain a uma direcao
// publicitaria estruturada. NAO chama LLM, NAO gera prompt de imagem/
// video - so decide. A UNICA chamada de I/O aqui e ao Character Pack
// Service (Supabase), e so quando a persona oficial foi de fato
// selecionada pelo Creative Brain para esta campanha.

import { selectSellingArgument } from "@/lib/commercial-director/selling-argument";
import { selectHookStrategy } from "@/lib/commercial-director/hook-selector";
import { selectDuration } from "@/lib/commercial-director/duration-selector";
import { selectPresenterStrategy } from "@/lib/commercial-director/presenter-selector";
import {
  resolveStoryStructure,
  selectPace,
  selectTextOverlayStrategy,
  selectVisualStyle,
} from "@/lib/commercial-director/creative-style";
import { buildOfferStrategy, selectProofStrategy } from "@/lib/commercial-director/proof-and-offer";
import { buildCtaStrategy } from "@/lib/commercial-director/cta-strategy";
import { buildAudioDirection } from "@/lib/commercial-director/audio-direction";
import { buildScenePlan } from "@/lib/commercial-director/scene-planner";
import { selectCharacterReferencePair } from "@/lib/brand-character/character-pack";
import type {
  CommercialDirection,
  CommercialDirectorInput,
  CommercialScene,
} from "@/lib/commercial-director/types";

export async function buildCommercialDirection(
  input: CommercialDirectorInput,
): Promise<CommercialDirection> {
  const { structure, reason: structureReason } = resolveStoryStructure(input.frameworkSlug);

  const { argument, reason: argumentReason } = selectSellingArgument({
    category: input.category,
    discountPct: input.discountPct,
    rating: input.rating,
    reviewsCount: input.reviewsCount,
  });

  const { hook, reason: hookReason } = selectHookStrategy({
    sellingArgument: argument,
    discountPct: input.discountPct,
    rating: input.rating,
    reviewsCount: input.reviewsCount,
  });

  const { durationSeconds, reason: durationReason } = selectDuration(structure);

  const { strategy: presenterStrategy, reason: presenterReason } = selectPresenterStrategy({
    officialCharacterSlug: input.officialCharacterSlug,
    storyStructure: structure,
  });

  const { pace } = selectPace(structure, input.category);
  const { style: visualStyle } = selectVisualStyle(input.category);
  const { strategy: textOverlayStrategy } = selectTextOverlayStrategy(argument, structure);

  const { strategy: proofStrategy } = selectProofStrategy({
    rating: input.rating,
    reviewsCount: input.reviewsCount,
    marketplace: input.marketplace,
    storyStructure: structure,
  });

  const offerStrategy = buildOfferStrategy({
    price: input.price,
    originalPrice: input.originalPrice,
    discountPct: input.discountPct,
    sellingArgument: argument,
    hookStrategy: hook,
  });

  const ctaStrategy = buildCtaStrategy(presenterStrategy, input.discountPct);
  const audioDirection = buildAudioDirection(pace, visualStyle);

  const baseScenes = buildScenePlan({
    storyStructure: structure,
    durationSeconds,
    hookStrategy: hook,
    presenterStrategy,
    textOverlayStrategy,
    productTitle: input.productTitle,
    hasOfficialCharacter: Boolean(input.officialCharacterSlug),
  });

  // So consulta o Character Pack (Supabase) para cenas que realmente
  // pedem a personagem oficial - cenas PRODUCT_ONLY nao tocam banco.
  const scenes: CommercialScene[] = await Promise.all(
    baseScenes.map(async (scene) => {
      if (!scene.characterDirection || !input.officialCharacterSlug) return scene;

      const pair = await selectCharacterReferencePair({
        characterSlug: input.officialCharacterSlug,
        expression: scene.characterDirection.expression,
        pose: scene.characterDirection.pose,
        shot: scene.characterDirection.shot,
      });

      return {
        ...scene,
        identityReferenceAssetId: pair.identityReference?.id ?? null,
        supportReferenceAssetId: pair.supportReference?.id ?? null,
      };
    }),
  );

  const reasoningSummary =
    `Estrutura "${structure}" (${structureReason}). ` +
    `Argumento principal "${argument}" (${argumentReason}). ` +
    `Gancho "${hook}" (${hookReason}). ` +
    `Duracao ${durationSeconds}s (${durationReason}). ` +
    `Apresentacao "${presenterStrategy}" (${presenterReason}).`;

  return {
    objective: "CONVERSION",
    durationSeconds,
    sellingArgument: argument,
    hookStrategy: hook,
    storyStructure: structure,
    pace,
    visualStyle,
    proofStrategy,
    offerStrategy,
    ctaStrategy,
    presenterStrategy,
    sceneCount: scenes.length,
    audioDirection,
    textOverlayStrategy,
    scenes,
    reasoningSummary,
  };
}
