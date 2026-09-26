// Radar Creative AI - Creative Director V2 / Validation / Commercial Arc
//
// Mapa fixo ScenePurpose -> estagio do arco publicitario (ATTENTION/DESIRE/
// BENEFIT/OFFER/ACTION). "missing" e um FATO estrutural, nao um veredito de
// qualidade sozinho - estruturas curtas (DIRECT_OFFER: HOOK+OFFER+CTA) nao
// cobrem DESIRE/BENEFIT por escolha deliberada de V1 (ver STRUCTURE_TEMPLATES
// em scene-planner.ts), o que e legitimo pra oferta direta.

import type { CommercialDirection, ScenePurpose } from "@/lib/commercial-director/types";
import type { SceneBlueprintV2 } from "@/lib/creative-director-v2/types";
import type { CommercialArcCoverage, CommercialArcStage } from "@/lib/creative-director-v2/validation/types";

const ARC_STAGE_BY_PURPOSE: Record<ScenePurpose, CommercialArcStage> = {
  HOOK: "ATTENTION",
  PROBLEM: "DESIRE",
  PRODUCT: "DESIRE",
  BENEFIT: "BENEFIT",
  PROOF: "BENEFIT",
  OFFER: "OFFER",
  CTA: "ACTION",
};

const ALL_STAGES: CommercialArcStage[] = ["ATTENTION", "DESIRE", "BENEFIT", "OFFER", "ACTION"];

export function assessCommercialArcCoverage(direction: CommercialDirection, sceneBlueprints: SceneBlueprintV2[]): CommercialArcCoverage {
  const coveredSet = new Set<CommercialArcStage>(sceneBlueprints.map((b) => ARC_STAGE_BY_PURPOSE[b.purpose]));
  const covered = ALL_STAGES.filter((stage) => coveredSet.has(stage));
  const missing = ALL_STAGES.filter((stage) => !coveredSet.has(stage));

  const note =
    missing.length === 0
      ? "todos os 5 estagios do arco comercial estao cobertos por pelo menos uma cena."
      : `estagio(s) ausente(s): ${missing.join(", ")} - estrutura "${direction.storyStructure}" pode nao precisar deles (ex.: DIRECT_OFFER e deliberadamente curta); avaliar caso a caso, ausencia nao e automaticamente defeito.`;

  return { covered, missing, note };
}
