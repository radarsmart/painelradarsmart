// Radar Creative AI - Commercial Video Pipeline / Candidate Selection
//
// PURO - decide, entre os candidatos registrados para uma cena, qual (se
// algum) e elegivel pra entrar na timeline final. Nenhuma leitura de disco/
// rede aqui (isso e responsabilidade de real-scene-asset-resolver.ts).

import type {
  LocalAssetCandidate,
  SceneAssetCandidate,
  SceneAssetResolutionOptions,
  SceneQualityStatus,
} from "@/lib/commercial-video/scene-asset-types";

export const HYBRID_STRATEGY_VALUE = "HYBRID_PRODUCT_COMPOSITE";

export function isSceneHybridStrategy(strategy: string | null | undefined): boolean {
  return strategy === HYBRID_STRATEGY_VALUE;
}

function isLocalOrMockCandidate(candidate: SceneAssetCandidate): candidate is LocalAssetCandidate {
  return candidate.source === "LOCAL_ASSET" || candidate.source === "MOCK";
}

function candidateStatus(candidate: SceneAssetCandidate): string {
  return isLocalOrMockCandidate(candidate) ? "COMPLETED" : candidate.status;
}

/**
 * Regra dura, sem override: FAILED/SKIPPED nunca sao elegiveis, seja qual
 * for a qualidade anexada.
 */
export function isCandidateStatusEligible(candidate: SceneAssetCandidate): boolean {
  return candidateStatus(candidate) === "COMPLETED";
}

/**
 * PASS -> sempre elegivel. PASS_WITH_OBSERVATIONS -> so com opt-in
 * explicito. PARTIAL -> bloqueado por padrao, so com opt-in explicito.
 * FAIL -> nunca elegivel (sem override). Ausencia de avaliacao (undefined/
 * null) -> elegivel (ver GAP CONHECIDO em scene-asset-types.ts).
 */
export function isCandidateQualityEligible(
  quality: SceneQualityStatus | null | undefined,
  options: Pick<SceneAssetResolutionOptions, "allowPassWithObservations" | "allowPartialQuality">,
): boolean {
  switch (quality) {
    case undefined:
    case null:
      return true;
    case "PASS":
      return true;
    case "PASS_WITH_OBSERVATIONS":
      return options.allowPassWithObservations === true;
    case "PARTIAL":
      return options.allowPartialQuality === true;
    case "FAIL":
      return false;
    default:
      return false;
  }
}

/**
 * Score maior = prioridade maior. -Infinity = inelegivel. Ordem (do
 * enunciado original): 1) aprovado (PASS) 2) "ultimo COMPLETED aprovado"
 * (PASS_WITH_OBSERVATIONS, so quando permitido) 3) COMPLETED sem avaliacao
 * 4) nunca FAILED. PARTIAL (quando permitido explicitamente) fica abaixo de
 * "sem avaliacao" porque e uma aprovacao mais fraca que "nao avaliado" -
 * decisao de design documentada aqui por nao constar no enunciado original.
 */
export function scoreCandidate(
  candidate: SceneAssetCandidate,
  options: Pick<SceneAssetResolutionOptions, "allowPassWithObservations" | "allowPartialQuality">,
): number {
  if (!isCandidateStatusEligible(candidate)) return -Infinity;
  if (!isCandidateQualityEligible(candidate.quality, options)) return -Infinity;

  switch (candidate.quality) {
    case "PASS":
      return 3;
    case "PASS_WITH_OBSERVATIONS":
      return 2;
    case undefined:
    case null:
      return 1.5;
    case "PARTIAL":
      return 1;
    default:
      return -Infinity;
  }
}

export type CandidateSelectionResult = {
  candidate: SceneAssetCandidate | null;
  rejectionReason: string | null;
};

function describeCandidate(candidate: SceneAssetCandidate): string {
  const status = candidateStatus(candidate);
  const quality = candidate.quality ? `/${candidate.quality}` : "";
  return `${candidate.source}:${status}${quality}`;
}

/**
 * Entre TODOS os candidatos registrados para sceneId, escolhe o melhor
 * elegivel. Se a cena exigir HYBRID_PRODUCT_COMPOSITE (strategy real vinda
 * do Generation Orchestrator), candidatos GENERATION_RESULT sao
 * DESCARTADOS de saida - o background bruto nunca substitui o composite
 * final, mesmo que COMPLETED e com quality PASS.
 */
export function selectBestCandidateForScene(
  sceneId: string,
  candidates: SceneAssetCandidate[],
  strategy: string | null | undefined,
  options: Pick<SceneAssetResolutionOptions, "allowPassWithObservations" | "allowPartialQuality">,
): CandidateSelectionResult {
  const sceneCandidates = candidates.filter((c) => c.sceneId === sceneId);
  if (sceneCandidates.length === 0) {
    return { candidate: null, rejectionReason: "Nenhum candidato registrado para esta cena." };
  }

  const hybridRequired = isSceneHybridStrategy(strategy);
  const pool = hybridRequired ? sceneCandidates.filter((c) => c.source === "HYBRID_COMPOSITE") : sceneCandidates;

  if (hybridRequired && pool.length === 0) {
    return {
      candidate: null,
      rejectionReason:
        "Cena exige HYBRID_PRODUCT_COMPOSITE mas nenhum resultado do Hybrid Compositor foi registrado - o background bruto nunca e usado como substituto.",
    };
  }

  let best: SceneAssetCandidate | null = null;
  let bestScore = -Infinity;

  for (const candidate of pool) {
    const score = scoreCandidate(candidate, options);
    if (score === -Infinity) continue;

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    } else if (score === bestScore) {
      // Empate: mais recente (completedAt) vence; sem completedAt em
      // nenhum dos dois, o ULTIMO da lista (ordem de registro) vence.
      const bestTime = best?.completedAt ?? "";
      const candidateTime = candidate.completedAt ?? "";
      if (candidateTime >= bestTime) best = candidate;
    }
  }

  if (!best) {
    const reasons = pool.map(describeCandidate).join(", ");
    return { candidate: null, rejectionReason: `Nenhum candidato elegivel (status/qualidade reprovados): ${reasons}` };
  }

  return { candidate: best, rejectionReason: null };
}
