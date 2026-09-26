// Radar Creative AI - Creative Director V2 / Decision Engine / Product Presentation Decision
//
// Reusa selectProductPresentationStrategy() (product-presentation.ts, Fase 1)
// como base por purpose, mas quebra repeticao ADJACENTE - se a cena N sair
// igual a N-1, promove a proxima opcao compativel da lista fixa do pedido
// (nao inventa estrategia nova, so evita repetir a mesma 2x seguidas).

import type { CommercialDirection, CommercialScene } from "@/lib/commercial-director/types";
import { selectProductPresentationStrategy } from "@/lib/creative-director-v2/product-presentation";
import type { ProductPresentationStrategy } from "@/lib/creative-director-v2/types";

const ALTERNATE_BY_STRATEGY: Record<ProductPresentationStrategy, ProductPresentationStrategy> = {
  HERO_REVEAL: "FLOATING_PREMIUM",
  MACRO_DETAIL: "BENEFIT_DEMO",
  FLOATING_PREMIUM: "ROTATION_SHOWCASE",
  ENVIRONMENTAL_STAGE: "LIFESTYLE_CONTEXT",
  ROTATION_SHOWCASE: "MACRO_DETAIL",
  BENEFIT_DEMO: "MACRO_DETAIL",
  LIFESTYLE_CONTEXT: "ENVIRONMENTAL_STAGE",
  COMPARISON: "BEFORE_AFTER",
  BEFORE_AFTER: "COMPARISON",
  PACKSHOT_OFFER: "HERO_REVEAL",
};

export function decideProductPresentationSequence(scenes: CommercialScene[], direction: CommercialDirection): Array<ProductPresentationStrategy | null> {
  const base = scenes.map((scene) => selectProductPresentationStrategy(scene, direction));

  const decided: Array<ProductPresentationStrategy | null> = [];
  base.forEach((strategy, index) => {
    const previous = decided[index - 1] ?? null;
    if (strategy !== null && strategy === previous) {
      decided.push(ALTERNATE_BY_STRATEGY[strategy]);
    } else {
      decided.push(strategy);
    }
  });

  return decided;
}
