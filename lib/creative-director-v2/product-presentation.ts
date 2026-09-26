// Radar Creative AI - Creative Director V2 / Product Presentation
//
// Decide COMO o produto aparece em cada cena (estrategia visual), quando ele
// aparece pela primeira vez, e efeitos de apoio permitidos. Nunca decide
// provider (isso e Generation Orchestrator) nem redecide integridade de
// produto (isso ja e garantido estruturalmente por
// lib/compositor/hybrid-product-compositor.ts) - so rotula.

import type { CommercialDirection, CommercialScene, ScenePurpose, SellingArgument, VisualStyle } from "@/lib/commercial-director/types";
import { deriveProductPlacement, type ProductPlacement } from "@/lib/generation-orchestrator/product-generation-strategy";
import type { SafeAreaDirection } from "@/lib/prompt-builder/types";
import type {
  BenefitStrategy,
  ProductPresentationStrategy,
  ProductScaleTarget,
  SceneEffectDirection,
  VisualEffectDirection,
} from "@/lib/creative-director-v2/types";

// Espelha PRODUCT_CENTRIC_PURPOSES de lib/generation-orchestrator/capability-map.ts
// (nao exportada de la) - heuristica interna do V2, nao um contrato compartilhado.
export const PRODUCT_CENTRIC_PURPOSES: ScenePurpose[] = ["PRODUCT", "BENEFIT", "OFFER", "CTA"];

export function isProductCentricPurpose(purpose: ScenePurpose): boolean {
  return PRODUCT_CENTRIC_PURPOSES.includes(purpose);
}

export function selectProductPresentationStrategy(
  scene: CommercialScene,
  direction: CommercialDirection,
): ProductPresentationStrategy | null {
  if (!isProductCentricPurpose(scene.purpose)) return null;

  if (scene.purpose === "OFFER") return "PACKSHOT_OFFER";

  if (scene.purpose === "CTA") return "HERO_REVEAL";

  if (scene.purpose === "BENEFIT") {
    if (direction.sellingArgument === "DEMONSTRATION") return "BENEFIT_DEMO";
    if (direction.hookStrategy === "TRANSFORMATION") return "BEFORE_AFTER";
    return "MACRO_DETAIL";
  }

  // scene.purpose === "PRODUCT"
  if (direction.sellingArgument === "DEMONSTRATION") return "ROTATION_SHOWCASE";
  if (direction.sellingArgument === "EMOTIONAL_BENEFIT" || direction.sellingArgument === "EXCLUSIVITY") return "FLOATING_PREMIUM";
  if (direction.visualStyle === "LIFESTYLE") return "LIFESTYLE_CONTEXT";
  if (direction.storyStructure === "COMPARISON") return "COMPARISON";
  return "ENVIRONMENTAL_STAGE";
}

export function computeFirstProductAppearance(scenes: CommercialScene[]): number | null {
  const firstProductScene = scenes.find((scene) => isProductCentricPurpose(scene.purpose));
  return firstProductScene ? firstProductScene.startSecond : null;
}

export function computeHeroProductDuration(scenes: CommercialScene[]): number {
  return scenes
    .filter((scene) => isProductCentricPurpose(scene.purpose))
    .reduce((total, scene) => total + (scene.endSecond - scene.startSecond), 0);
}

export function selectProductScaleTarget(strategy: ProductPresentationStrategy | null): ProductScaleTarget {
  if (strategy === null) return "SMALL";
  if (strategy === "HERO_REVEAL" || strategy === "PACKSHOT_OFFER") return "HERO_FULL_FRAME";
  if (strategy === "MACRO_DETAIL" || strategy === "FLOATING_PREMIUM" || strategy === "ROTATION_SHOWCASE") return "LARGE";
  return "MEDIUM";
}

export function selectProductPositionStrategy(safeAreaDirection: SafeAreaDirection): ProductPlacement {
  return deriveProductPlacement(safeAreaDirection);
}

export function selectBenefitStrategy(direction: CommercialDirection): { strategy: BenefitStrategy; reason: string } {
  if (direction.hookStrategy === "TRANSFORMATION") {
    return { strategy: "BEFORE_AFTER", reason: "gancho de transformacao pede prova de antes/depois no beneficio" };
  }
  if (direction.storyStructure === "COMPARISON") {
    return { strategy: "COMPARISON", reason: "estrutura de comparacao pede comparacao tambem no beneficio" };
  }
  if (direction.sellingArgument === "DEMONSTRATION") {
    return { strategy: "DIRECT_DEMO", reason: "argumento de demonstracao pede prova direta de uso" };
  }
  if (direction.sellingArgument === "EMOTIONAL_BENEFIT") {
    return { strategy: "LIFESTYLE_INTEGRATION", reason: "beneficio emocional funciona melhor integrado ao estilo de vida" };
  }
  return { strategy: "SENSORY_CLOSEUP", reason: "fallback: close sensorial no beneficio quando nenhum sinal mais especifico existe" };
}

function baseEffectsForVisualStyle(visualStyle: VisualStyle): VisualEffectDirection[] {
  switch (visualStyle) {
    case "LUXURY":
      return ["BOKEH", "LIGHT_STREAK", "REFLECTIONS"];
    case "TECH":
      return ["LIGHT_STREAK", "PARALLAX", "GLOW"];
    case "BEAUTY":
      return ["BOKEH", "GLOW", "REFLECTIONS"];
    case "FITNESS":
      return ["FABRIC_MOTION", "PARTICLES", "PUSH_IN"];
    case "HOME_DEMO":
      return ["PUSH_IN", "REVEAL"];
    case "LIFESTYLE":
      return ["BOKEH", "PARALLAX"];
    case "PRODUCT_HERO":
      return ["ORBITAL_MOTION", "REFLECTIONS", "REVEAL"];
    default:
      return ["PUSH_IN"];
  }
}

export function selectVisualEffectDirections(scene: CommercialScene, visualStyle: VisualStyle): SceneEffectDirection {
  const productSafeOnly = isProductCentricPurpose(scene.purpose);
  return { effects: baseEffectsForVisualStyle(visualStyle), productSafeOnly };
}

// Reexport de conveniencia (usado por outros modulos do V2 sem precisar
// reimportar direto de generation-orchestrator).
export type { SellingArgument };
