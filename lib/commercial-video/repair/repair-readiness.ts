import type { CommercialRepairPlan, SceneRepairPlan } from "@/lib/commercial-video/repair/types";

function sceneBlocksAutoRepair(scene: SceneRepairPlan): string[] {
  const blockers: string[] = [];
  if (scene.action === "BLOCKED") blockers.push(...scene.blockingReasons);
  if (scene.action === "REVIEW_REQUIRED") blockers.push(`Cena ${scene.sceneId} exige revisao humana antes do repair.`);
  if (scene.action === "REGENERATE" && !scene.providerProductionEligible) {
    blockers.push(`Cena ${scene.sceneId} precisa regenerar, mas provider ${scene.provider ?? "null"} nao esta productionEligible.`);
  }
  if (scene.action === "REGENERATE" && (!scene.estimatedCost || scene.estimatedCost.costUnit === "UNKNOWN")) {
    blockers.push(`Cena ${scene.sceneId} precisa regenerar, mas o custo novo e desconhecido.`);
  }
  return blockers;
}

export function assessRepairReadiness(scenes: SceneRepairPlan[]): Pick<CommercialRepairPlan, "canAutoRepair" | "blockingReasons"> {
  const blockingReasons = scenes.flatMap(sceneBlocksAutoRepair);
  const hasRegeneration = scenes.some((scene) => scene.action === "REGENERATE");
  return {
    canAutoRepair: hasRegeneration && blockingReasons.length === 0,
    blockingReasons,
  };
}
