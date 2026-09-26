// Radar Creative AI - Commercial Director / Presenter Selector
//
// Nunca forca a Garota Radar a aparecer. So considera usa-la quando o
// Creative Brain ja selecionou a persona oficial pra essa campanha
// (officialCharacterSlug != null) - caso contrario, PRODUCT_ONLY.

import type { PresenterStrategy, StoryStructure } from "@/lib/commercial-director/types";

export type PresenterSelectionInput = {
  officialCharacterSlug: string | null;
  storyStructure: StoryStructure;
};

export function selectPresenterStrategy(
  input: PresenterSelectionInput,
): { strategy: PresenterStrategy; reason: string } {
  if (!input.officialCharacterSlug) {
    return {
      strategy: "PRODUCT_ONLY",
      reason: "o Creative Brain nao selecionou a personagem oficial para esta campanha - o produto e o protagonista",
    };
  }

  switch (input.storyStructure) {
    case "DEMONSTRATION":
      return {
        strategy: "GAROTA_RADAR_CTA_ONLY",
        reason: "demonstracao funciona melhor com o produto como protagonista; a Garota Radar entra so no fechamento",
      };
    case "REVIEW":
      return {
        strategy: "GAROTA_RADAR_RECOMMENDATION",
        reason: "review pede uma recomendacao pessoal da Garota Radar",
      };
    case "DIRECT_OFFER":
      return {
        strategy: "GAROTA_RADAR_CTA_ONLY",
        reason: "oferta direta institucional so precisa dela no fechamento, reforcando a marca",
      };
    case "STORYTELLING":
      return {
        strategy: "GAROTA_RADAR_FULL",
        reason: "storytelling funciona melhor com presenca constante da apresentadora",
      };
    default:
      return {
        strategy: "GAROTA_RADAR_HOOK_ONLY",
        reason: "fallback: ela aparece no gancho para prender atencao, resto do tempo o produto fala por si",
      };
  }
}
