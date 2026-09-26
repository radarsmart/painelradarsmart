// Radar Creative AI - Creative Director V2 / Decision Engine / Offer Hierarchy Decision
//
// So rotula PRIMARY/SECONDARY/TERTIARY em cima de OfferPresentationV2 (Fase
// 1, ja a fonte da verdade de "desconto e real ou nao" - nao redecide isso).
// Se nao ha desconto real, nao reserva espaco visual pra ele.

import type { OfferPresentationV2 } from "@/lib/creative-director-v2/types";

export type OfferCompositionRole = "PRODUCT" | "PRICE" | "DISCOUNT" | "CTA";

export type OfferCompositionDecision = {
  primary: OfferCompositionRole;
  secondary: OfferCompositionRole | null;
  tertiary: OfferCompositionRole;
};

export function decideOfferComposition(offerPresentation: OfferPresentationV2): OfferCompositionDecision {
  const primary: OfferCompositionRole = offerPresentation.pricePriority !== "NONE" ? "PRICE" : "PRODUCT";
  const secondary: OfferCompositionRole | null = offerPresentation.discountPriority !== "NONE" ? "DISCOUNT" : null;

  return { primary, secondary, tertiary: "CTA" };
}
