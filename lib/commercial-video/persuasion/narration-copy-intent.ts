// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Narration Copy Intent
//
// PURO - NUNCA chama ElevenLabs. Gera so intencao/copy textual para
// avaliacao. Frases curtas, grounded (nunca reusa claims FORBIDDEN/
// UNVERIFIED como fato), evita repetir literalmente o texto do overlay
// (item 25 do pedido).

import type { PersuasionSceneConcept } from "@/lib/commercial-video/persuasion/types";

export type NarrationCopyIntent = { sceneId: string; narrationIntent: string; suggestedNarration: string };

const INTENT_BY_ARC_STAGE: Record<PersuasionSceneConcept["arcStage"], string> = {
  ATTENTION: "Criar curiosidade especifica (nunca generica) que justifique continuar assistindo.",
  INTEREST: "Apresentar o produto real de forma que conecte com o desejo/categoria correta.",
  DESIRE: "Demonstrar/expressar o beneficio real de forma sensorial - nunca prometer resultado nao sustentado.",
  VALUE: "Comunicar o preco real como argumento de valor, nunca inventar desconto.",
  ACTION: "Fechar com convite direto, reforcando o que ja foi dito - nunca introduzir informacao nova.",
};

export function buildNarrationCopyIntent(scene: PersuasionSceneConcept, overlayTexts: string[]): NarrationCopyIntent {
  const narrationIntent = INTENT_BY_ARC_STAGE[scene.arcStage];

  let suggestedNarration = scene.suggestedNarration;
  // Nunca repetir literalmente o texto do overlay - se colidir, marca
  // como PENDING_REVIEW em vez de silenciosamente deixar igual.
  const collidesWithOverlay = overlayTexts.some((t) => t.trim().length > 0 && suggestedNarration.trim().toLowerCase() === t.trim().toLowerCase());
  if (collidesWithOverlay) {
    suggestedNarration = `${suggestedNarration} [REVISAR: identico ao overlay - narracao deve complementar, nao repetir]`;
  }

  return { sceneId: scene.sceneId, narrationIntent, suggestedNarration };
}

export function buildNarrationCopyIntentForStoryboard(scenes: PersuasionSceneConcept[], overlayTextsBySceneId: Record<string, string[]>): NarrationCopyIntent[] {
  return scenes.map((scene) => buildNarrationCopyIntent(scene, overlayTextsBySceneId[scene.sceneId] ?? []));
}
