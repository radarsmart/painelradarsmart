// Radar Creative AI - Commercial Video Pipeline / Real Scene Asset Resolver
//
// Camada de integracao: recebe candidatos JA CONHECIDOS (SceneExecutionResult
// do Generation Orchestrator, HybridCompositeResult do Hybrid Product
// Compositor, ou assets locais/mock) e decide, cena a cena, qual arquivo
// local final entra na timeline. Nao chama nenhum provider - so materializa
// (download+validacao) um outputUrl remoto quando necessario. O Timeline
// Builder continua recebendo so um Record<sceneId, path> pronto, exatamente
// como antes desta integracao (ver toSceneVideoPaths).

import fs from "node:fs";

import { materializeRemoteAsset } from "@/lib/commercial-video/asset-materializer";
import { selectBestCandidateForScene } from "@/lib/commercial-video/candidate-selection";
import type {
  LocalAssetCandidate,
  ResolvedCommercialSceneAsset,
  SceneAssetCandidate,
  SceneAssetResolutionOptions,
  SceneAssetTraceEntry,
} from "@/lib/commercial-video/scene-asset-types";

const REMOTE_URL_PATTERN = /^https?:\/\//i;

function isLocalOrMockCandidate(candidate: SceneAssetCandidate): candidate is LocalAssetCandidate {
  return candidate.source === "LOCAL_ASSET" || candidate.source === "MOCK";
}

function emptyResolution(sceneId: string, rejectionReason: string): ResolvedCommercialSceneAsset {
  return {
    sceneId,
    source: null,
    inputVideoPath: null,
    provider: null,
    generationId: null,
    hybridComposite: false,
    durationSeconds: 0,
    status: "MISSING_ASSET",
    rejectionReason,
  };
}

async function resolveCandidate(
  candidate: SceneAssetCandidate,
  options: SceneAssetResolutionOptions,
  inFlightCache: Map<string, string>,
): Promise<ResolvedCommercialSceneAsset> {
  const { sceneId, durationSeconds } = candidate;

  if (isLocalOrMockCandidate(candidate)) {
    const exists = fs.existsSync(candidate.localPath);
    return {
      sceneId,
      source: candidate.source,
      inputVideoPath: exists ? candidate.localPath : null,
      provider: null,
      generationId: null,
      hybridComposite: false,
      durationSeconds,
      status: exists ? "READY" : "MISSING_ASSET",
      rejectionReason: exists ? null : `Arquivo local nao encontrado: ${candidate.localPath}`,
    };
  }

  if (candidate.source === "HYBRID_COMPOSITE") {
    const exists = candidate.outputPath ? fs.existsSync(candidate.outputPath) : false;
    return {
      sceneId,
      source: "HYBRID_COMPOSITE",
      inputVideoPath: exists ? candidate.outputPath : null,
      provider: null,
      generationId: null,
      hybridComposite: true,
      durationSeconds,
      status: exists ? "READY" : "MISSING_ASSET",
      rejectionReason: exists ? null : `Output do Hybrid Compositor nao encontrado em disco: ${candidate.outputPath ?? "(null)"}`,
    };
  }

  // GENERATION_RESULT
  if (!candidate.outputUrl) {
    return {
      sceneId,
      source: "GENERATION_RESULT",
      inputVideoPath: null,
      provider: candidate.provider,
      generationId: candidate.generationId,
      hybridComposite: false,
      durationSeconds,
      status: "MISSING_ASSET",
      rejectionReason: "GenerationResult COMPLETED mas sem outputUrl.",
    };
  }

  if (!REMOTE_URL_PATTERN.test(candidate.outputUrl)) {
    const exists = fs.existsSync(candidate.outputUrl);
    return {
      sceneId,
      source: "GENERATION_RESULT",
      inputVideoPath: exists ? candidate.outputUrl : null,
      provider: candidate.provider,
      generationId: candidate.generationId,
      hybridComposite: false,
      durationSeconds,
      status: exists ? "READY" : "MISSING_ASSET",
      rejectionReason: exists ? null : `Caminho local do GenerationResult nao encontrado: ${candidate.outputUrl}`,
    };
  }

  const materialized = await materializeRemoteAsset(candidate.outputUrl, options.cacheDir, inFlightCache);
  return {
    sceneId,
    source: "GENERATION_RESULT",
    inputVideoPath: materialized.ok ? materialized.localPath : null,
    provider: candidate.provider,
    generationId: candidate.generationId,
    hybridComposite: false,
    durationSeconds,
    status: materialized.ok ? "READY" : "MISSING_ASSET",
    rejectionReason: materialized.ok ? null : materialized.error,
  };
}

/**
 * Resolve TODAS as cenas de uma timeline, sequencialmente (nunca em
 * paralelo - garante que o dedupe em memoria do materializador funcione
 * sem corrida). Para cenas HYBRID_PRODUCT_COMPOSITE, so candidatos
 * HYBRID_COMPOSITE sao considerados (ver candidate-selection.ts) - o
 * background bruto nunca e usado como substituto do composite final.
 */
export async function resolveRealSceneAssets(
  sceneIds: string[],
  candidates: SceneAssetCandidate[],
  options: SceneAssetResolutionOptions,
): Promise<ResolvedCommercialSceneAsset[]> {
  const inFlightCache = new Map<string, string>();
  const resolved: ResolvedCommercialSceneAsset[] = [];

  for (const sceneId of sceneIds) {
    const strategy = options.productGenerationStrategyByScene?.[sceneId] ?? null;
    const { candidate, rejectionReason } = selectBestCandidateForScene(sceneId, candidates, strategy, options);

    if (!candidate) {
      resolved.push(emptyResolution(sceneId, rejectionReason ?? "Nenhum candidato elegivel."));
      continue;
    }

    resolved.push(await resolveCandidate(candidate, options, inFlightCache));
  }

  return resolved;
}

export function toSceneVideoPaths(resolved: ResolvedCommercialSceneAsset[]): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  for (const entry of resolved) {
    map[entry.sceneId] = entry.status === "READY" ? entry.inputVideoPath : null;
  }
  return map;
}

export function toSceneTraceability(resolved: ResolvedCommercialSceneAsset[]): Record<string, SceneAssetTraceEntry> {
  const map: Record<string, SceneAssetTraceEntry> = {};
  for (const entry of resolved) {
    map[entry.sceneId] = {
      source: entry.source,
      provider: entry.provider,
      generationId: entry.generationId,
      hybridComposite: entry.hybridComposite,
      status: entry.status,
      rejectionReason: entry.rejectionReason,
    };
  }
  return map;
}
