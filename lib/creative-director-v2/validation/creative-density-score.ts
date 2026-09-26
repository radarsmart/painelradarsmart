// Radar Creative AI - Creative Director V2 / Validation / Creative Density Score
//
// Objetivo explicito: flagar um storyboard TECNICAMENTE valido (todos os
// campos preenchidos, gate PASS) mas VISUALMENTE raso - poucas cenas com
// sujeito claro, sem movimento, sem efeito, sem produto/personagem em foco.
// Conta sinais de densidade JA presentes no blueprint (nada novo decidido).

import type { SceneBlueprintV2 } from "@/lib/creative-director-v2/types";
import type { CreativeDensityScore, SceneDensityBreakdown } from "@/lib/creative-director-v2/validation/types";

const RELEVANT_MOTION_TERMS = ["rapido", "zoom", "dinamico"];

function hasRelevantMotion(motionDirection: string): boolean {
  const motion = motionDirection.toLowerCase();
  return RELEVANT_MOTION_TERMS.some((term) => motion.includes(term));
}

function hasOverlayText(blueprint: SceneBlueprintV2): boolean {
  const { priceText, discountText, ctaText } = blueprint.overlayPlan.overlayInstructions;
  return priceText !== null || discountText !== null || ctaText !== null;
}

export function scoreSceneDensity(blueprint: SceneBlueprintV2): SceneDensityBreakdown {
  const signals: Array<[string, boolean]> = [
    ["subjectClear", blueprint.subjectPriority !== "ENVIRONMENT"],
    ["relevantMotion", hasRelevantMotion(blueprint.motionDirection)],
    ["visualEffects", blueprint.effectDirection.effects.length > 0],
    ["productInFocus", blueprint.productRole !== "NONE"],
    ["overlayText", hasOverlayText(blueprint)],
    ["characterPresent", blueprint.characterRole.role !== "NONE"],
    ["energeticTransition", blueprint.transitionIntent !== "CUT"],
  ];

  const signalsPresent = signals.filter(([, present]) => present).map(([name]) => name);
  const score = Math.round((signalsPresent.length / signals.length) * 100);

  return { sceneId: blueprint.sceneId, purpose: blueprint.purpose, signalsPresent, signalsTotal: signals.length, score };
}

export function scoreCreativeDensity(sceneBlueprints: SceneBlueprintV2[]): CreativeDensityScore {
  const scenes = sceneBlueprints.map(scoreSceneDensity);
  const overallScore = scenes.length > 0 ? Math.round(scenes.reduce((sum, s) => sum + s.score, 0) / scenes.length) : 0;
  return { overallScore, scenes };
}
