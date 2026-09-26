// Radar Creative AI - Creative Director V2 / Decision Engine / Product Scale Decision
//
// Decide (nao so rotula) a escala do produto por cena e garante que campanhas
// product-centric abram com produto cedo. Reusa a mesma lista de purposes
// product-centric ja usada em product-presentation.ts (Fase 1).

import type { ScenePurpose, SellingArgument } from "@/lib/commercial-director/types";
import { isProductCentricPurpose } from "@/lib/creative-director-v2/product-presentation";
import type { ProductScaleTarget } from "@/lib/creative-director-v2/types";

// Mesmo conjunto de argumentos de venda product-centric usado em
// generic-ad-risk.ts - reaproveitado aqui, nao redeclarado com valores
// diferentes.
export const PRODUCT_CENTRIC_SELLING_ARGUMENTS = new Set<SellingArgument>(["DEMONSTRATION", "PRACTICAL_BENEFIT"]);

export const FORCE_EARLY_APPEARANCE_MAX_SECOND = 1.5;

export function isCampaignProductCentric(sellingArgument: SellingArgument): boolean {
  return PRODUCT_CENTRIC_SELLING_ARGUMENTS.has(sellingArgument);
}

export function decideProductScale(purpose: ScenePurpose, productCentric: boolean): ProductScaleTarget {
  if (!isProductCentricPurpose(purpose)) return "SMALL";

  // HOOK/OFFER sao os momentos de maior impacto comercial - preferem HERO
  // quando a campanha e product-centric, em vez de deixar o produto pequeno
  // so porque V1 deixava.
  if (purpose === "HOOK" || purpose === "OFFER") return productCentric ? "HERO_FULL_FRAME" : "LARGE";
  if (purpose === "CTA") return "LARGE";
  if (purpose === "PRODUCT") return "LARGE";
  return "MEDIUM"; // BENEFIT
}

export function shouldForceHookCarryProduct(sellingArgument: SellingArgument): boolean {
  return isCampaignProductCentric(sellingArgument);
}
