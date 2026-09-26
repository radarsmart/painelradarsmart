// Radar Creative AI - Commercial Generation Runner V1 / Quality Gate
//
// PURO - AGREGA resultados de quality gates que ja existem (Narration
// Quality, elegibilidade de cena, resolucao de asset). Nunca substitui ou
// remede nenhum deles - so combina o que ja foi decidido em outro lugar.
// audioQuality/finalVideoQuality ficam NOT_EVALUATED nesta V1 porque
// nenhuma sintese/composicao real acontece (so EXECUTE faria isso, ainda
// nao implementado).

import type { NarrationQualityResult } from "@/lib/commercial-video/narration/types";
import type { RunnerQualityAggregate, RunnerQualityStatus, SceneRunnerPlan } from "@/lib/commercial-video/runner/types";

// Ordem de severidade (pior primeiro) - usada so pra escolher o pior dos
// dois status ao combinar componentes independentes.
const QUALITY_SEVERITY_ORDER: RunnerQualityStatus[] = ["FAIL", "PASS_WITH_OBSERVATIONS", "NOT_EVALUATED", "PASS"];

function worstOf(a: RunnerQualityStatus, b: RunnerQualityStatus): RunnerQualityStatus {
  return QUALITY_SEVERITY_ORDER.indexOf(a) <= QUALITY_SEVERITY_ORDER.indexOf(b) ? a : b;
}

export function assessSceneEligibilityQuality(scenes: SceneRunnerPlan[]): RunnerQualityStatus {
  if (scenes.length === 0) return "NOT_EVALUATED";
  const blocked = scenes.filter((s) => s.eligibility !== "ELIGIBLE" && s.eligibility !== "SKIPPED");
  return blocked.length > 0 ? "FAIL" : "PASS";
}

export function assessAssetResolutionQuality(scenes: SceneRunnerPlan[]): RunnerQualityStatus {
  const withCandidate = scenes.filter((s) => s.existingAsset !== null);
  if (withCandidate.length === 0) return "NOT_EVALUATED";
  const missing = withCandidate.filter((s) => s.existingAsset?.status === "MISSING_ASSET");
  return missing.length > 0 ? "FAIL" : "PASS";
}

export function mapNarrationQualityStatus(result: NarrationQualityResult | null): RunnerQualityStatus {
  if (!result) return "NOT_EVALUATED";
  return result.status;
}

export function aggregateRunnerQuality(
  scenes: SceneRunnerPlan[],
  narrationQuality: NarrationQualityResult | null,
  videoCostGuardOk: boolean,
  ttsCostGuardOk: boolean,
): RunnerQualityAggregate {
  const sceneEligibility = assessSceneEligibilityQuality(scenes);
  const assetResolution = assessAssetResolutionQuality(scenes);
  const narrationStatus = mapNarrationQualityStatus(narrationQuality);
  const audioQuality: RunnerQualityStatus = "NOT_EVALUATED";
  const finalVideoQuality: RunnerQualityStatus = "NOT_EVALUATED";

  let finalStatus: RunnerQualityStatus = worstOf(sceneEligibility, assetResolution);
  finalStatus = worstOf(finalStatus, narrationStatus);
  if (!videoCostGuardOk || !ttsCostGuardOk) finalStatus = "FAIL";

  // NOT_EVALUATED nunca deve "vencer" como resultado final quando os
  // componentes que IMPORTAM (sceneEligibility/narrationQuality) ja
  // passaram - so mostra a mensagem mais honesta disponivel.
  if (finalStatus === "NOT_EVALUATED" && (sceneEligibility === "PASS" || narrationStatus === "PASS")) {
    finalStatus = "PASS";
  }

  return { sceneEligibility, assetResolution, narrationQuality: narrationStatus, audioQuality, finalVideoQuality, finalStatus };
}
