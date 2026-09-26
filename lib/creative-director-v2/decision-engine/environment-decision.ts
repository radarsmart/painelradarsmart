// Radar Creative AI - Creative Director V2 / Decision Engine / Environment Decision
//
// environmentDirection em V1/V2-Fase1 era uma string FIXA por visualStyle
// (mesma em todas as cenas - achado da validacao). Aqui cada cena recebe um
// EnvironmentPurpose diferente, mas sempre derivado do MESMO
// VisualWorldDirection da campanha - varia sem virar cenarios desconectados.

import type { ScenePurpose } from "@/lib/commercial-director/types";
import type { VisualWorldDirection } from "@/lib/creative-director-v2/decision-engine/visual-world";

export type EnvironmentPurpose = "HERO_STAGE" | "MACRO_STUDIO" | "LIFESTYLE_CONTEXT" | "OFFER_STAGE" | "CTA_BRAND_STAGE";

const ENVIRONMENT_PURPOSE_BY_SCENE_PURPOSE: Record<ScenePurpose, EnvironmentPurpose> = {
  HOOK: "HERO_STAGE",
  PROBLEM: "LIFESTYLE_CONTEXT",
  PRODUCT: "LIFESTYLE_CONTEXT",
  BENEFIT: "MACRO_STUDIO",
  PROOF: "LIFESTYLE_CONTEXT",
  OFFER: "OFFER_STAGE",
  CTA: "CTA_BRAND_STAGE",
};

export function decideEnvironmentPurpose(purpose: ScenePurpose): EnvironmentPurpose {
  return ENVIRONMENT_PURPOSE_BY_SCENE_PURPOSE[purpose];
}

export function deriveSceneEnvironment(world: VisualWorldDirection, environmentPurpose: EnvironmentPurpose): string {
  switch (environmentPurpose) {
    case "HERO_STAGE":
      return `${world.backgroundContinuity}; palco de destaque, ${world.lightingLanguage}`;
    case "MACRO_STUDIO":
      return `${world.backgroundContinuity}; estudio macro, ${world.materialLanguage}`;
    case "LIFESTYLE_CONTEXT":
      return `${world.backgroundContinuity}; contexto de uso real, ${world.motionLanguage}`;
    case "OFFER_STAGE":
      return `${world.backgroundContinuity}; palco de oferta, ${world.paletteIntent}`;
    case "CTA_BRAND_STAGE":
      return `${world.backgroundContinuity}; palco de marca, ${world.baseMood}`;
    default:
      return world.backgroundContinuity;
  }
}
