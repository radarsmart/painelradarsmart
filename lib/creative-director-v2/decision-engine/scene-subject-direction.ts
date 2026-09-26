// Radar Creative AI - Creative Director V2 / Decision Engine / Scene Subject Direction
//
// Corrige uma lacuna semantica encontrada na validacao: isProductCentricPurpose/
// computeFirstProductAppearance (Fase 1, lib/creative-director-v2/product-presentation.ts)
// decidem "produto em foco" SO pelo ScenePurpose (PRODUCT/BENEFIT/OFFER/CTA) -
// nunca pelo HOOK, mesmo quando o Decision Engine escolhe uma estrategia que
// literalmente revela o produto como sujeito principal (HERO_PRODUCT_REVEAL).
//
// Esta e uma dimensao DIFERENTE de ScenePurpose (funcao narrativa) - purpose
// continua purpose, HOOK continua HOOK. SceneSubjectDirection descreve
// COMPOSICAO (quem/o que esta em foco), nao FUNCAO. As duas funcoes antigas
// (Fase 1) NAO sao alteradas - ficam intocadas e continuam sendo a fonte da
// verdade para cenas != HOOK (que ja sao corretamente classificadas por
// purpose desde a Fase 1). So o HOOK ganha uma classificacao mais rica,
// derivada da estrategia de hook REAL escolhida (nao do purpose).

import type { CommercialScene } from "@/lib/commercial-director/types";
import { computeFirstProductAppearance, computeHeroProductDuration } from "@/lib/creative-director-v2/product-presentation";
import type { HookStrategyV2 } from "@/lib/creative-director-v2/decision-engine/hook-strategy-v2";

export type PrimarySubject = "PRODUCT" | "CHARACTER" | "ENVIRONMENT" | "OFFER_GRAPHIC" | "MIXED";
export type ProductPresence = "NONE" | "SUPPORTING" | "PRIMARY" | "HERO";
export type CharacterPresence = "NONE" | "SUPPORTING" | "PRIMARY";

export type SceneSubjectDirection = {
  primarySubject: PrimarySubject;
  productPresence: ProductPresence;
  characterPresence: CharacterPresence;
};

export function isProductCentricSceneV2(subject: SceneSubjectDirection): boolean {
  return subject.productPresence === "HERO" || subject.productPresence === "PRIMARY";
}

// Estrategias cujo staging (hook-strategy-v2.ts#buildHookStagingForStrategy)
// literalmente revela o produto como HEROI do quadro (nao so menciona).
const HERO_PRODUCT_HOOK_STRATEGIES = new Set<HookStrategyV2>(["HERO_PRODUCT_REVEAL", "PRICE_SHOCK", "LUXURY_REVEAL"]);
// Estrategias que mostram produto, mas nao como reveal/heroi central (o
// produto aparece "em uso"/"em contraste", nao centralizado como sujeito
// exclusivo do quadro).
const SUPPORTING_PRODUCT_HOOK_STRATEGIES = new Set<HookStrategyV2>(["VISUAL_TRANSFORMATION", "BENEFIT_FIRST", "COMPARISON_HOOK"]);

// Anti-gaming: so classifica como product-centric quando o STAGING real da
// estrategia de fato coloca produto em cena (nunca por "estar no HOOK").
// CURIOSITY_REVEAL/PROBLEM_SOLUTION nao mostram produto claramente -> NONE.
export function deriveHookSceneSubjectDirection(strategyV2: HookStrategyV2, hasCharacterInHook: boolean): SceneSubjectDirection {
  if (HERO_PRODUCT_HOOK_STRATEGIES.has(strategyV2)) {
    return { primarySubject: "PRODUCT", productPresence: "HERO", characterPresence: hasCharacterInHook ? "SUPPORTING" : "NONE" };
  }

  if (SUPPORTING_PRODUCT_HOOK_STRATEGIES.has(strategyV2)) {
    return {
      primarySubject: hasCharacterInHook ? "MIXED" : "PRODUCT",
      productPresence: "PRIMARY",
      characterPresence: hasCharacterInHook ? "SUPPORTING" : "NONE",
    };
  }

  if (strategyV2 === "CHARACTER_DIRECT_HOOK") {
    return { primarySubject: "CHARACTER", productPresence: "NONE", characterPresence: "PRIMARY" };
  }

  // CURIOSITY_REVEAL, PROBLEM_SOLUTION - dor/curiosidade sem produto/
  // personagem claramente em foco.
  return { primarySubject: "ENVIRONMENT", productPresence: "NONE", characterPresence: hasCharacterInHook ? "SUPPORTING" : "NONE" };
}

// firstProductAppearance/heroProductDuration V2: reusam as funcoes de Fase 1
// (computeFirstProductAppearance/computeHeroProductDuration) como BASE - so
// adicionam a contribuicao do HOOK quando ele de fato e product-centric
// (nunca subtraem, nunca inventam produto que nao esta no blueprint).
export function computeFirstProductAppearanceV2(scenes: CommercialScene[], hookSubject: SceneSubjectDirection): number | null {
  const hookScene = scenes[0];
  if (hookScene?.purpose === "HOOK" && isProductCentricSceneV2(hookSubject)) {
    return hookScene.startSecond;
  }
  return computeFirstProductAppearance(scenes);
}

export function computeHeroProductDurationV2(scenes: CommercialScene[], hookSubject: SceneSubjectDirection): number {
  const base = computeHeroProductDuration(scenes);
  const hookScene = scenes[0];
  if (hookScene?.purpose === "HOOK" && isProductCentricSceneV2(hookSubject)) {
    return base + (hookScene.endSecond - hookScene.startSecond);
  }
  return base;
}
