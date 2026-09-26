// Radar Creative AI - Creative Director V2 / CTA Director
//
// O CTA e planejado como CENA VISUAL (nao so texto). Isto e intencao
// criativa - nao ha garantia de que o provider (ex.: HeyGen) execute o gesto
// exatamente como pedido; a execucao real continua sendo decisao do
// Generation Orchestrator/Prompt Builder. ctaSecondary fica sempre null:
// nao existe fonte de dado real para um CTA secundario nesta campanha -
// nunca inventar.

import type { CommercialDirection } from "@/lib/commercial-director/types";
import { buildOverlayPlan } from "@/lib/prompt-builder/overlay-plan";
import type { CharacterRoleDirection, CtaDirectionV2, CtaVisualAction } from "@/lib/creative-director-v2/types";

function selectCtaVisualAction(characterRole: CharacterRoleDirection, direction: CommercialDirection): CtaVisualAction {
  if (characterRole.role !== "CTA_PRESENTER") return "NONE";
  if (direction.ctaStrategy.ctaUrgency === "HIGH") return "POINT_TO_BUTTON";
  if (direction.ctaStrategy.ctaUrgency === "MEDIUM") return "POINT_DOWN";
  return "LOOK_TO_CTA";
}

function ctaCharacterGestureFor(action: CtaVisualAction): string | null {
  switch (action) {
    case "POINT_TO_BUTTON":
      return "aponta para o botao/CTA na tela";
    case "POINT_DOWN":
      return "aponta para baixo, na direcao do CTA";
    case "OPEN_HAND":
      return "mao aberta, convidando pro CTA";
    case "HOLD_PRODUCT":
      return "segura o produto em direcao a camera";
    case "LOOK_TO_CTA":
      return "olha diretamente para a camera, sem gesto";
    default:
      return null;
  }
}

export function buildCtaDirectionV2(direction: CommercialDirection, characterRole: CharacterRoleDirection): CtaDirectionV2 {
  const ctaScene = direction.scenes.find((scene) => scene.purpose === "CTA") ?? direction.scenes[direction.scenes.length - 1];
  const ctaVisualAction = selectCtaVisualAction(characterRole, direction);

  const ctaOverlayLayout = buildOverlayPlan({
    purpose: "CTA",
    offerStrategy: direction.offerStrategy,
    ctaStrategy: direction.ctaStrategy,
    hasCharacterInScene: characterRole.role !== "NONE",
  });

  return {
    ...direction.ctaStrategy,
    ctaSecondary: null,
    ctaVisualAction,
    ctaCharacterGesture: ctaCharacterGestureFor(ctaVisualAction),
    ctaOverlayLayout,
    ctaDuration: ctaScene.endSecond - ctaScene.startSecond,
  };
}
