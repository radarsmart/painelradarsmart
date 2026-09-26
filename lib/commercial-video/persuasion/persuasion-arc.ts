// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Persuasion Arc
//
// PURO - vai alem do CommercialArc existente (que so verifica PRESENCA de
// estagios narrativos). Aqui cada cena precisa responder o que o
// consumidor SENTE/APRENDE/PORQUE CONTINUA - duas cenas consecutivas que
// so dizem "olhe o produto" sao detectadas como redundantes mesmo com
// camera/ambiente diferentes (ver persuasion-redundancy.ts, que reusa
// PersuasionArcSceneAssessment.stage).

import type { PersuasionArcResult, PersuasionArcSceneAssessment, PersuasionArcStage, PersuasionSceneConcept } from "@/lib/commercial-video/persuasion/types";

const ALL_STAGES: PersuasionArcStage[] = ["ATTENTION", "INTEREST", "DESIRE", "VALUE", "ACTION"];

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function contributionForScene(scene: PersuasionSceneConcept): number {
  let contribution = 30;
  if (scene.benefitClaimId !== null) contribution += 25;
  if (scene.offerRole !== "NONE") contribution += 20;
  if (scene.ctaRole !== "NONE") contribution += 15;
  if (scene.salesAngleAlignment) contribution += 10;
  if (scene.productVisualRole === "PACKSHOT" || scene.productVisualRole === "FLOATING_HERO") contribution -= 15;
  return clamp(contribution);
}

export function buildPersuasionArc(scenes: PersuasionSceneConcept[]): PersuasionArcResult {
  const sceneAssessments: PersuasionArcSceneAssessment[] = scenes.map((scene, index) => {
    const previous = index > 0 ? scenes[index - 1] : null;
    return {
      sceneId: scene.sceneId,
      stage: scene.arcStage,
      whatConsumerFeels: scene.consumerState,
      whatConsumerLearns: scene.benefitClaimId ? `Beneficio real (claim ${scene.benefitClaimId}).` : scene.offerRole !== "NONE" ? "Preco/oferta." : "Existencia/aparencia do produto.",
      whyTheyContinue: scene.whyContinueWatching,
      whatChangedFromPreviousScene: previous ? (previous.arcStage !== scene.arcStage ? `Progrediu de ${previous.arcStage} para ${scene.arcStage}.` : "Mesmo estagio da cena anterior - risco de estagnacao.") : "Primeira cena.",
      purchaseIntentContribution: contributionForScene(scene),
    };
  });

  const stagesCovered = ALL_STAGES.filter((stage) => scenes.some((s) => s.arcStage === stage));
  const missingStages = ALL_STAGES.filter((stage) => !stagesCovered.includes(stage));

  const avgContribution = sceneAssessments.length ? sceneAssessments.reduce((sum, s) => sum + s.purchaseIntentContribution, 0) / sceneAssessments.length : 0;
  const stageCoverageScore = (stagesCovered.length / ALL_STAGES.length) * 100;
  const score = clamp(stageCoverageScore * 0.5 + avgContribution * 0.5);

  const reasons: string[] = [];
  if (missingStages.length > 0) reasons.push(`Estagios ausentes no arco: ${missingStages.join(", ")}.`);
  const stagnantScenes = sceneAssessments.filter((s) => s.whatChangedFromPreviousScene.includes("estagnacao"));
  if (stagnantScenes.length > 0) reasons.push(`${stagnantScenes.length} cena(s) sem progressao de estagio em relacao a cena anterior.`);

  return { scenes: sceneAssessments, stagesCovered, missingStages, score, reasons };
}
