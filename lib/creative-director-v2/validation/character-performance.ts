// Radar Creative AI - Creative Director V2 / Validation / Character Performance
//
// characterRole=CTA_PRESENTER nao basta - precisa saber se ela de fato
// interage (gesto/olhar) ou so "esta parada falando" (staticPresenceRisk).
// So avalia cenas onde characterRole.role !== "NONE" (nunca decide SE ela
// aparece - isso continua V1/character-role-director.ts).

import type { CharacterPose } from "@/lib/brand-character/character-types";
import type { SceneBlueprintV2 } from "@/lib/creative-director-v2/types";
import type { CharacterPerformanceDirection } from "@/lib/creative-director-v2/validation/types";

const PRODUCT_INTERACTION_GESTURES = new Set<CharacterPose>(["PRESENTING", "POINTING", "POINTING_UP", "POINTING_DOWN", "THUMBS_UP", "CELEBRATING"]);
const STATIC_GESTURES = new Set<CharacterPose>(["NEUTRAL", "OTHER"]);

export function assessCharacterPerformance(sceneBlueprints: SceneBlueprintV2[]): CharacterPerformanceDirection[] {
  return sceneBlueprints
    .filter((blueprint) => blueprint.characterRole.role !== "NONE")
    .map((blueprint) => {
      const gesture = blueprint.characterRole.gesture as CharacterPose | null;
      const emotion = blueprint.characterRole.emotion;

      const interactsWithCta = blueprint.purpose === "CTA" && gesture !== null && gesture !== "NEUTRAL";
      const interactsWithProduct = blueprint.productRole !== "NONE" && gesture !== null && PRODUCT_INTERACTION_GESTURES.has(gesture);
      const staticPresenceRisk = emotion === "NEUTRAL" && (gesture === null || STATIC_GESTURES.has(gesture));

      const reason = staticPresenceRisk
        ? `emocao NEUTRAL + gesto ${gesture ?? "nenhum"} - risco de "so esta parada falando"`
        : `emocao ${emotion}, gesto ${gesture ?? "nenhum"}${interactsWithCta ? ", interage com CTA" : ""}${interactsWithProduct ? ", interage com produto" : ""}`;

      return {
        sceneId: blueprint.sceneId,
        purpose: blueprint.purpose,
        role: blueprint.characterRole.role,
        interactsWithCta,
        interactsWithProduct,
        staticPresenceRisk,
        reason,
      };
    });
}
