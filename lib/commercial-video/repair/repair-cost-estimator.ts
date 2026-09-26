import { estimateSceneCost } from "@/lib/generation-orchestrator/cost-estimator";
import type { GenerationCostEstimate } from "@/lib/generation-orchestrator/types";
import type { RepairCostSummary, SceneRepairPlan } from "@/lib/commercial-video/repair/types";

export function estimateRepairSceneCost(provider: string | null, durationSeconds: number): GenerationCostEstimate | null {
  if (!provider) return null;
  return estimateSceneCost(provider, durationSeconds);
}

export function summarizeRepairCosts(scenes: SceneRepairPlan[]): RepairCostSummary {
  const summary: RepairCostSummary = {
    wanCredits: 0,
    klingCredits: 0,
    heygenUsdCents: 0,
    elevenLabsCredits: 0,
    unknownCostScenes: [],
  };

  for (const scene of scenes) {
    if (scene.action !== "REGENERATE") continue;
    const cost = scene.estimatedCost;
    if (!cost || cost.costUnit === "UNKNOWN") {
      summary.unknownCostScenes.push(scene.sceneId);
      continue;
    }
    if (scene.provider === "wan-2-5-t2v") summary.wanCredits += cost.estimatedCredits ?? 0;
    if (scene.provider === "freepik-kling-i2v") summary.klingCredits += cost.estimatedCredits ?? 0;
    if (scene.provider === "heygen-image-avatar") summary.heygenUsdCents += cost.estimatedUsdCostCents ?? 0;
  }

  return summary;
}
