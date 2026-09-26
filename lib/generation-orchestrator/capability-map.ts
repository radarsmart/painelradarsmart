// Radar Creative AI - Generation Orchestrator / Capability Map
//
// Traduz o SceneGenerationPrompt (mediaType + presenca de personagem) do
// Prompt Builder para uma GenerationCapability abstrata. Puro, sem I/O.

import type { ScenePurpose } from "@/lib/commercial-director/types";
import type { SceneGenerationPrompt } from "@/lib/prompt-builder/types";
import type { GenerationCapability } from "@/lib/generation-orchestrator/types";

const PRODUCT_CENTRIC_PURPOSES: ScenePurpose[] = ["PRODUCT", "BENEFIT", "OFFER", "CTA"];

export function mapSceneToCapability(scene: SceneGenerationPrompt): GenerationCapability {
  const hasCharacter = Boolean(scene.identityReferenceAssetId);
  const isProductCentric = PRODUCT_CENTRIC_PURPOSES.includes(scene.purpose);

  switch (scene.mediaType) {
    case "CHARACTER_VIDEO":
      return "CHARACTER_VIDEO";
    case "IMAGE_TO_VIDEO":
      return "IMAGE_TO_VIDEO";
    case "TEXT_TO_VIDEO":
      return "TEXT_TO_VIDEO";
    case "PRODUCT_VIDEO":
      return "PRODUCT_VIDEO";
    case "IMAGE":
      if (hasCharacter) return "CHARACTER_IMAGE";
      if (isProductCentric) return "PRODUCT_IMAGE";
      return "TEXT_TO_IMAGE";
    default:
      return "TEXT_TO_IMAGE";
  }
}
