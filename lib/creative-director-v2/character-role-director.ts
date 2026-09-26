// Radar Creative AI - Creative Director V2 / Character Role Director
//
// A Garota Radar ja so aparece nas cenas que resolveScenePresenter()
// (lib/commercial-director/scene-planner.ts) decidiu em V1 - isso NAO muda
// aqui. Este modulo so rotula POR QUE ela aparece em cada cena (funcao
// comercial) e remonta entrada/fala/emocao/gesto/duracao/posicao a partir de
// campos que ja existem em CommercialScene, sem reabrir a decisao de
// presenca.

import type { CommercialDirection, CommercialScene, ScenePurpose } from "@/lib/commercial-director/types";
import { buildOverlayPlan } from "@/lib/prompt-builder/overlay-plan";
import type { CharacterRole, CharacterRoleDirection, CharacterRoleSummary } from "@/lib/creative-director-v2/types";

const ROLE_BY_PURPOSE: Record<ScenePurpose, CharacterRole> = {
  HOOK: "HOOK_PRESENTER",
  PROBLEM: "EXPLAINER",
  PRODUCT: "EXPLAINER",
  BENEFIT: "EXPLAINER",
  PROOF: "SOCIAL_PROOF_PRESENTER",
  OFFER: "OFFER_PRESENTER",
  CTA: "CTA_PRESENTER",
};

const ROLE_REASON: Record<CharacterRole, string> = {
  NONE: "cena definida como PRODUCT_ONLY pela presenter strategy de V1 - produto e o protagonista",
  HOOK_PRESENTER: "ela abre o gancho para prender atencao logo nos primeiros segundos",
  EXPLAINER: "ela explica/demonstra o produto ou beneficio em cena",
  SOCIAL_PROOF_PRESENTER: "ela reforca a prova real disponivel (avaliacao/confianca do marketplace)",
  OFFER_PRESENTER: "ela revela a oferta, reforcando preco/desconto com presenca",
  CTA_PRESENTER: "ela fecha com o CTA oficial da marca",
};

export function buildCharacterRoleDirection(scene: CommercialScene, direction: CommercialDirection): CharacterRoleDirection {
  const durationSeconds = scene.endSecond - scene.startSecond;

  if (scene.presenter === "PRODUCT_ONLY" || scene.characterDirection === null) {
    return {
      role: "NONE",
      reason: ROLE_REASON.NONE,
      entrance: null,
      line: null,
      emotion: null,
      gesture: null,
      durationSeconds,
      position: "NONE",
    };
  }

  const role = ROLE_BY_PURPOSE[scene.purpose];
  const { safeAreaDirection } = buildOverlayPlan({
    purpose: scene.purpose,
    offerStrategy: direction.offerStrategy,
    ctaStrategy: direction.ctaStrategy,
    hasCharacterInScene: true,
  });

  return {
    role,
    reason: ROLE_REASON[role],
    entrance: scene.camera,
    line: scene.voiceoverIntent,
    emotion: scene.characterDirection.expression,
    gesture: scene.characterDirection.pose,
    durationSeconds,
    position: safeAreaDirection,
  };
}

export function summarizeCharacterRoles(roles: CharacterRoleDirection[]): CharacterRoleSummary {
  const appearingRoles = roles.filter((r) => r.role !== "NONE");
  const rolesUsed = Array.from(new Set(appearingRoles.map((r) => r.role)));

  return {
    appears: appearingRoles.length > 0,
    rolesUsed,
    reason:
      appearingRoles.length > 0
        ? `apresentadora aparece em ${appearingRoles.length} cena(s) com funcao definida: ${rolesUsed.join(", ")}`
        : "apresentadora nao aparece nesta campanha - presenter strategy de V1 escolheu PRODUCT_ONLY",
  };
}
