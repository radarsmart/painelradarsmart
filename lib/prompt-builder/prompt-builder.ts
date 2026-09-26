// Radar Creative AI - Prompt Builder
//
// Orquestrador PURO: monta o CampaignPromptPlan inteiro a partir de uma
// CommercialDirection ja pronta (Character Pack ja resolvido por cena
// pelo Commercial Director - este modulo nao faz nenhuma chamada nova a
// Supabase, so traduz o que ja existe em prompt estruturado).

import { buildScenePrompt, type ScenePromptCreativeHints } from "@/lib/prompt-builder/scene-prompt";
import type { CommercialDirection } from "@/lib/commercial-director/types";
import type { CampaignPromptPlan, Platform } from "@/lib/prompt-builder/types";
import type { CtaDirectionV2, SceneBlueprintV2 } from "@/lib/creative-director-v2/types";
import type { PersuasionStrategy } from "@/lib/commercial-video/persuasion/types";

export type PromptBuilderContext = {
  productTitle: string;
  category: string;
  platform: Platform;
  aspectRatio: string;
  defaultLogoAssetId: string | null;
};

// creativeDirectorV2 e OPCIONAL - so quando a campanha usa
// creativeDirectorVersion="V2" (ver lib/creative-director-v2/version.ts).
// sceneBlueprints e zipado por INDICE com commercialDirection.scenes (mesma
// ordem/contagem garantida pelo Decision Engine - ver scene-plan-builder.ts).
// Omitido, comportamento identico ao anterior (V1, sempre).
export type PromptBuilderCreativeDirectorV2Input = {
  sceneBlueprints: SceneBlueprintV2[];
  ctaDirection: CtaDirectionV2;
  persuasionStrategy?: PersuasionStrategy | null;
};

export function buildCampaignPromptPlan(
  campaignId: string,
  commercialDirection: CommercialDirection,
  context: PromptBuilderContext,
  creativeDirectorV2?: PromptBuilderCreativeDirectorV2Input,
): CampaignPromptPlan {
  const scenes = commercialDirection.scenes.map((scene, index) => {
    const blueprint = creativeDirectorV2?.sceneBlueprints[index];
    const persuasionScene = creativeDirectorV2?.persuasionStrategy?.sceneStrategies.find((entry) => entry.purpose === scene.purpose);
    const creativeHints: ScenePromptCreativeHints | undefined = blueprint
      ? {
          environmentDirection: blueprint.environmentDirection,
          visualEffects: blueprint.effectDirection.effects,
          ctaVisualAction: creativeDirectorV2?.ctaDirection.ctaVisualAction,
          ctaCharacterGesture: creativeDirectorV2?.ctaDirection.ctaCharacterGesture ?? null,
          persuasionObjective: persuasionScene?.persuasionObjective,
          productInteraction: persuasionScene?.productInteraction,
          characterNarrativeRole: persuasionScene?.characterNarrativeRole,
          consumerState: persuasionScene?.consumerState,
          // Subject-Aware Capability Routing V1 - unicos 2 campos do
          // blueprint que participam de uma decisao estrutural (mediaType),
          // ver product-fidelity-requirement.ts. Ja computados pelo
          // Creative Director V2 (buildProductRole/buildSubjectPriority em
          // scene-blueprint-builder.ts, com overrides do Decision Engine
          // para HOOK) - nada aqui recalcula ou altera essa decisao.
          productRoleV2: blueprint.productRole,
          subjectPriorityV2: blueprint.subjectPriority,
        }
      : undefined;

    return buildScenePrompt(
      scene,
      {
        productTitle: context.productTitle,
        category: context.category,
        platform: context.platform,
        aspectRatio: context.aspectRatio,
        visualStyle: commercialDirection.visualStyle,
        pace: commercialDirection.pace,
        offerStrategy: commercialDirection.offerStrategy,
        ctaStrategy: commercialDirection.ctaStrategy,
        defaultLogoAssetId: context.defaultLogoAssetId,
      },
      creativeHints,
    );
  });

  return { campaignId, commercialDirection, scenes };
}
