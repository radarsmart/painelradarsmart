// Radar Creative AI - Commercial Generation Runner / EXECUTE Resume
//
// PURO - traduz o resultado PERSISTIDO de um job anterior (mesma
// campanha+modo) em candidatos que o proximo job pode reaproveitar sem
// pagar de novo (ver item 24/26/28 do enunciado - "preparar contrato de
// resume", sem worker/fila). Quem decide se cada candidato realmente e
// aceito continua sendo o Runner (fingerprint precisa bater - ver
// scene-fingerprint.ts) - esta camada so PROPOE.
//
// GAP CONHECIDO E DOCUMENTADO: cenas HYBRID_PRODUCT_COMPOSITE NAO entram
// no resume entre jobs aqui. O real-scene-asset-resolver.ts existente (ja
// validado, nao alterado nesta tarefa) so aceita HYBRID_COMPOSITE via
// caminho LOCAL (fs.existsSync direto, nunca baixa uma URL remota pra
// esse source - ver resolveCandidate em real-scene-asset-resolver.ts).
// Como o output persistido de uma cena HYBRID e uma URL do nosso Storage
// (nao um caminho local que sobrevive entre jobs/processos), reusar exigiria
// baixar a URL pra um arquivo local ANTES de virar candidato - fora do
// escopo desta V1 (documentado, nunca escondido). Na pratica isso hoje e
// irrelevante: nenhum provider TEXT_TO_VIDEO esta ACTIVE, entao nenhuma
// cena HYBRID chega a ser executada de verdade.

import type { CommercialGenerationResult } from "@/lib/commercial-video/runner/types";
import type { SceneExecutionPlan } from "@/lib/generation-orchestrator/types";
import type { NarrationExecutionRecord } from "@/lib/commercial-video/runner/types";
import type { GenerationResultCandidate, SceneAssetCandidate } from "@/lib/commercial-video/scene-asset-types";

export function buildReusableSceneCandidates(
  previousResult: CommercialGenerationResult | null,
  currentScenes: SceneExecutionPlan[],
): SceneAssetCandidate[] {
  if (!previousResult) return [];

  const candidates: SceneAssetCandidate[] = [];
  for (const record of previousResult.sceneExecutionRecords) {
    if (record.status !== "COMPLETED" && record.status !== "REUSED") continue;
    if (!record.outputUrl) continue;

    const scenePlan = currentScenes.find((s) => s.sceneId === record.sceneId);
    if (scenePlan?.productGenerationStrategy === "HYBRID_PRODUCT_COMPOSITE") continue; // ver docstring acima

    const candidate: GenerationResultCandidate = {
      source: "GENERATION_RESULT",
      sceneId: record.sceneId,
      provider: record.provider,
      generationId: record.generationId,
      status: "COMPLETED",
      outputUrl: record.outputUrl,
      durationSeconds: record.durationSeconds ?? 0,
      quality: null,
      completedAt: record.completedAt,
      fingerprint: record.fingerprint,
    };
    candidates.push(candidate);
  }

  return candidates;
}

export function buildReusableNarrationRecords(previousResult: CommercialGenerationResult | null): NarrationExecutionRecord[] {
  if (!previousResult) return [];
  return previousResult.narrationExecutionRecords.filter((record) => record.status === "COMPLETED" || record.status === "REUSED");
}
