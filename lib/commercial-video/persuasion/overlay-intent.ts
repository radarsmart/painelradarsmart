// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Overlay Intent
//
// PURO - decide QUANDO um overlay de texto ajuda a venda (item 26 do
// pedido). Nunca cria overlay "so porque tem espaco" - so quando a cena
// tem um papel persuasivo especifico que se beneficia de reforco textual.

import type { OfferRevealPlan, OverlayIntentCategory, PersuasionSceneConcept } from "@/lib/commercial-video/persuasion/types";

export type OverlayIntentPlan = { sceneId: string; categories: OverlayIntentCategory[]; text: string[]; reason: string };

export function buildOverlayIntentPlan(scene: PersuasionSceneConcept, offerReveal: OfferRevealPlan): OverlayIntentPlan {
  const categories: OverlayIntentCategory[] = [];
  const text: string[] = [];
  const reasons: string[] = [];

  if (scene.purpose === "HOOK" && scene.arcStage === "ATTENTION") {
    categories.push("HOOK_TEXT");
    text.push(scene.whyContinueWatching);
    reasons.push("Hook se beneficia de reforco textual curto da curiosidade/preco.");
  }

  if (scene.benefitClaimId !== null) {
    categories.push("BENEFIT_TEXT");
    reasons.push("Cena tem beneficio real (claim grounded) - overlay reforca sem inventar.");
  }

  if (scene.offerRole === "REVEAL" || (scene.offerRole === "REINFORCEMENT" && offerReveal.visualHierarchy.length > 0)) {
    categories.push("PRICE_TEXT");
    reasons.push("Cena revela/reforca preco real - overlay de preco justificado.");
  }

  if (scene.characterNarrativeRole === "TRUST_ANCHOR") {
    categories.push("PROOF_TEXT");
    reasons.push("Papel de TRUST_ANCHOR se beneficia de reforco de prova/confianca (so se houver claim real disponivel).");
  }

  if (scene.ctaRole !== "NONE") {
    categories.push("CTA_TEXT");
    reasons.push("Cena de CTA sempre justifica overlay de acao.");
  }

  return { sceneId: scene.sceneId, categories, text, reason: reasons.join(" ") || "Nenhum papel persuasivo especifico - sem overlay (evita poluicao visual sem funcao)." };
}

export function buildOverlayIntentForStoryboard(scenes: PersuasionSceneConcept[], offerReveal: OfferRevealPlan): OverlayIntentPlan[] {
  return scenes.map((scene) => buildOverlayIntentPlan(scene, offerReveal));
}
