// Radar Creative AI - Commercial Generation Runner V1 / Traceability
//
// PURO - so RECOMBINA dados ja calculados (SceneRunnerPlan + NarrationPlan)
// numa lista plana de "como esse comercial foi/seria produzido". Nunca
// persiste no banco nesta fase.

import type { NarrationPlan } from "@/lib/commercial-video/narration/types";
import type { RunnerTraceabilityEntry, SceneRunnerPlan } from "@/lib/commercial-video/runner/types";

export function buildRunnerTraceability(
  scenes: SceneRunnerPlan[],
  narrationPlan: NarrationPlan | null,
  voiceProfileVoiceId: string | null,
  voiceProfileVoiceName: string | null = null,
): RunnerTraceabilityEntry[] {
  return scenes.map((scene) => {
    const narrationScene = narrationPlan?.scenes.find((s) => s.sceneId === scene.sceneId) ?? null;
    const usesOfficialVoice = narrationScene?.status === "READY";

    return {
      sceneId: scene.sceneId,
      purpose: scene.purpose,
      productGenerationStrategy: scene.productGenerationStrategy,
      selectedProvider: scene.selectedProvider,
      providerStatus: scene.providerStatus,
      existingAssetSource: scene.existingAsset?.source ?? null,
      narrationText: narrationScene?.text ?? null,
      narrationStatus: narrationScene?.status ?? "NOT_PLANNED",
      voiceProfileVoiceId: usesOfficialVoice ? voiceProfileVoiceId : null,
      voiceProfileVoiceName: usesOfficialVoice ? voiceProfileVoiceName : null,
      estimatedVideoCredits: scene.estimatedCost.estimatedCredits,
      estimatedTtsCredits: narrationScene?.text?.length ?? 0,
    };
  });
}
