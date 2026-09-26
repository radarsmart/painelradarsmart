// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - CTA Persuasion
//
// PURO - CTA como CONCLUSAO da venda, nao um card generico ("coloque a
// Garota Radar e diga clique"). continuityFromOffer=true so quando a
// oferta ja foi revelada antes do CTA (ver OfferRevealPlan) - CTA nunca
// deveria ser a primeira vez que preco aparece, a nao ser que a estrategia
// de reveal seja EARLY (hook), caso em que o CTA reforca em vez de revelar.

import type { CharacterNarrativeRole, CtaPersuasionPlan, OfferRevealPlan } from "@/lib/commercial-video/persuasion/types";

export function buildCtaPersuasionPlan(offerReveal: OfferRevealPlan, characterRole: CharacterNarrativeRole): CtaPersuasionPlan {
  const continuityFromOffer = offerReveal.revealTiming !== "LATE" || offerReveal.visualHierarchy.length > 0;

  return {
    purchaseStateBeforeCta: "Consumidor ja viu produto real, beneficio (quando disponivel) e preco - falta so a acao.",
    ctaObjective: "Reduzir friccao e converter interesse ja construido, nunca introduzir informacao nova de ultima hora.",
    ctaCopyIntent: "Reforcar o valor ja comunicado (preco/beneficio) + acao clara - nunca so 'clique aqui' generico.",
    visualAction: characterRole !== "NONE" ? "Personagem aponta/segura o produto real ou gesto de convite consistente com o papel narrativo anterior dela." : "Produto real + preco em destaque, sem elemento novo.",
    characterRole,
    continuityFromOffer,
    frictionReduction: "CTA reforca preco/beneficio ja visto - nao pede ao espectador para 'confiar' em algo novo.",
    secondaryMessageAllowed: false,
  };
}
