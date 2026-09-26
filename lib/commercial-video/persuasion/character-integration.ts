// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Character Integration
//
// PURO - vai alem de "characterPresent=true". Achado real do CANARY: a
// Garota Radar so aparece no ultimo segundo como card de CTA, desconectada
// do resto do comercial. NAO obriga personagem em toda campanha, NAO
// altera decisao de provider - so avalia INTEGRACAO NARRATIVA quando o
// Creative Director ja decidiu usar apresentadora.

import type { CharacterIntegrationResult, CharacterNarrativeRole, PersuasionSceneConcept } from "@/lib/commercial-video/persuasion/types";

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreCharacterIntegration(scenes: PersuasionSceneConcept[]): CharacterIntegrationResult {
  const scenesWithCharacter = scenes.filter((s) => s.characterNarrativeRole !== "NONE");

  if (scenesWithCharacter.length === 0) {
    // Sem personagem em nenhuma cena - nao e um defeito (campanha pode ser
    // legitimamente PRODUCT_ONLY) - score neutro, nunca penalizado por
    // "falta de personagem" quando isso nunca foi decidido.
    return { score: 100, appearsInScenes: [], disconnected: false, reasons: ["Nenhuma cena usa personagem - N/A (nao penalizado)."] };
  }

  const appearsInScenes = scenesWithCharacter.map((s) => s.sceneId);
  const onlyInLastScene = scenesWithCharacter.length === 1 && scenesWithCharacter[0].sceneId === scenes[scenes.length - 1].sceneId;
  const onlyRoleIsCtaCloser = scenesWithCharacter.every((s) => s.characterNarrativeRole === "CTA_CLOSER");

  const disconnected = onlyInLastScene && onlyRoleIsCtaCloser;

  const rolesUsed = new Set<CharacterNarrativeRole>(scenesWithCharacter.map((s) => s.characterNarrativeRole));
  const roleDiversityScore = clamp((rolesUsed.size / 3) * 100);
  const presenceRatioScore = clamp((scenesWithCharacter.length / scenes.length) * 100);

  const score = disconnected ? 20 : clamp(roleDiversityScore * 0.5 + presenceRatioScore * 0.5);

  const reasons: string[] = [];
  if (disconnected) {
    reasons.push("Personagem aparece SOMENTE na ultima cena, so como CTA_CLOSER - parece pertencer a outro comercial (DISCONNECTED_PRESENTER). Recomendado: personagem aparecer tambem em pelo menos uma cena de BENEFIT/PRODUCT_GUIDE/TRUST_ANCHOR antes do CTA.");
  } else {
    reasons.push(`Personagem aparece em ${scenesWithCharacter.length}/${scenes.length} cena(s), com ${rolesUsed.size} papel(is) narrativo(s) distinto(s).`);
  }

  return { score, appearsInScenes, disconnected, reasons };
}
