// Radar Creative AI - Generation Orchestrator
//
// Orquestrador PURO: monta o CampaignExecutionPlan inteiro a partir de um
// CampaignPromptPlan ja pronto (Prompt Builder) + as referencias ja
// resolvidas por cena (URLs reais - resolucao e feita fora, em
// reference-resolver.ts, que e a unica parte impura desta fase). Nao
// chama nenhum provider.

import { buildSceneExecutionPlan } from "@/lib/generation-orchestrator/scene-execution-plan";
import type {
  CampaignExecutionPlan,
  GenerationMode,
  ResolvedSceneReferences,
} from "@/lib/generation-orchestrator/types";
import type { CampaignPromptPlan } from "@/lib/prompt-builder/types";

export function buildCampaignExecutionPlan(
  campaignId: string,
  mode: GenerationMode,
  promptPlan: CampaignPromptPlan,
  resolvedRefsBySceneId: Record<string, ResolvedSceneReferences>,
): CampaignExecutionPlan {
  const scenes = promptPlan.scenes.map((scene) =>
    buildSceneExecutionPlan(
      scene,
      resolvedRefsBySceneId[scene.sceneId] ?? {
        identityReferenceUrl: null,
        supportReferenceAssetId: null,
        supportReferenceUrl: null,
        productReferenceUrl: null,
        supportReferenceError: null,
        productReferenceQuality: null,
      },
    ),
  );

  const withKnownCost = scenes.filter((s) => s.estimatedCost.estimatedCredits !== null);
  const totalEstimatedCredits = withKnownCost.length
    ? withKnownCost.reduce((sum, s) => sum + (s.estimatedCost.estimatedCredits ?? 0), 0)
    : null;
  const totalEstimatedCurrencyCostCents = withKnownCost.length
    ? withKnownCost.reduce((sum, s) => sum + (s.estimatedCost.estimatedCurrencyCostCents ?? 0), 0)
    : null;
  const withKnownUsdCost = scenes.filter((s) => s.estimatedCost.estimatedUsdCostCents !== null);
  const totalEstimatedUsdCostCents = withKnownUsdCost.length
    ? withKnownUsdCost.reduce((sum, s) => sum + (s.estimatedCost.estimatedUsdCostCents ?? 0), 0)
    : null;

  return {
    campaignId,
    mode,
    promptPlan,
    scenes,
    estimatedCost: {
      totalEstimatedCredits,
      totalEstimatedCurrencyCostCents,
      totalEstimatedUsdCostCents,
    },
  };
}
