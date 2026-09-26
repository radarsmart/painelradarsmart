// Radar Creative AI - Creative Director V2 / Validation / Orchestrator
//
// Roda todos os diagnosticos de validacao e monta o CreativeValidationResult
// final, incluindo a decisao READY_FOR_V2_PIPELINE_INTEGRATION. Pura leitura
// sobre V1/V2 ja calculados - nenhuma chamada de provider, nenhuma escrita.

import type { CommercialDirection } from "@/lib/commercial-director/types";
import type { CommercialCreativeDirectionV2 } from "@/lib/creative-director-v2/types";

import { auditBenchmarkStrength } from "@/lib/creative-director-v2/validation/benchmark-strength-audit";
import { auditHookStrength } from "@/lib/creative-director-v2/validation/hook-audit";
import { scoreProductFirst } from "@/lib/creative-director-v2/validation/product-first-score";
import { scoreCreativeDensity } from "@/lib/creative-director-v2/validation/creative-density-score";
import { analyzeSceneRedundancy } from "@/lib/creative-director-v2/validation/scene-redundancy";
import { assessCharacterPerformance } from "@/lib/creative-director-v2/validation/character-performance";
import { assessCommercialArcCoverage } from "@/lib/creative-director-v2/validation/commercial-arc";
import { compareAgainstCinematicBenchmark, SHORT_FORM_CINEMATIC_COMMERCE } from "@/lib/creative-director-v2/validation/cinematic-benchmark";
import { buildV1V2StoryboardDiff } from "@/lib/creative-director-v2/validation/v1-v2-storyboard-diff";
import { SHORT_FORM_PREMIUM_COMMERCE } from "@/lib/creative-director-v2/benchmark-profile";
import type { CreativeValidationResult } from "@/lib/creative-director-v2/validation/types";

const READY_MIN_CINEMATIC_MATCH_SCORE = 70;
const READY_MAX_MISSING_ARC_STAGES = 1;

// Checklist de CAPACIDADE (nao de qualidade) - cada item e uma decisao
// estruturada que so existe em V2 hoje. V2 sempre pontua 100% aqui POR
// CONSTRUCAO (essas sao literalmente as coisas que V2 foi feito pra
// adicionar) e V1 sempre pontua 0% (essas coisas nao existem no contrato de
// V1). Isso e TAUTOLOGICO de proposito - documentado aqui e no relatorio -
// serve pra listar o que foi adicionado na camada de PLANEJAMENTO, nao como
// evidencia de qualidade visual (isso e hookAudit/cinematicBenchmark/
// creativeDensity/sceneRedundancy, que usam dado real e podem reprovar V2).
const V2_ONLY_CAPABILITIES = [
  "creativeConcept nomeado explicitamente",
  "hook com score mensuravel (nao so label de estrategia)",
  "estrategia de apresentacao de produto por cena",
  "papel comercial da apresentadora com motivo explicito",
  "hierarquia visual de oferta (price/discount/cta priority)",
  "acao visual estruturada do CTA",
  "gate de qualidade pre-geracao (PASS/FAIL)",
  "deteccao de risco de anuncio generico",
  "intencao de transicao estruturada (enum, nao string livre)",
  "narrationRole (intent/tom/energia/prioridade) por cena",
];

function planningCapabilityScore(hasCapabilities: boolean): number {
  return hasCapabilities ? 100 : 0;
}

export function runCreativeValidation(v1: CommercialDirection, v2: CommercialCreativeDirectionV2): CreativeValidationResult {
  const hookScene = v1.scenes.find((s) => s.purpose === "HOOK") ?? v1.scenes[0];
  const hookAudit = auditHookStrength(hookScene, v1, v2.hookStrength);

  const productFirst = scoreProductFirst(v2);
  const creativeDensity = scoreCreativeDensity(v2.sceneBlueprints);
  const sceneRedundancy = analyzeSceneRedundancy(v2.sceneBlueprints);
  const characterPerformance = assessCharacterPerformance(v2.sceneBlueprints);
  const commercialArc = assessCommercialArcCoverage(v1, v2.sceneBlueprints);

  const cinematicBenchmark = compareAgainstCinematicBenchmark(
    {
      hookStrength: v2.hookStrength,
      productScaleTarget: v2.productScaleTarget,
      pacing: v2.pacingStyle,
      creativeDensity,
      sceneRedundancy,
      characterPerformance,
      commercialArc,
    },
    SHORT_FORM_CINEMATIC_COMMERCE,
  );

  const benchmarkStrengthAudit = auditBenchmarkStrength(v2.benchmarkComparison, SHORT_FORM_PREMIUM_COMMERCE);
  const storyboardDiff = buildV1V2StoryboardDiff(v1, v2);

  const reasons: string[] = [];
  if (v2.storyboardQualityGate.status === "FAIL") reasons.push(`storyboardQualityGate.status=FAIL (${v2.storyboardQualityGate.blockingReasons.join("; ")})`);
  if (cinematicBenchmark.matchScore < READY_MIN_CINEMATIC_MATCH_SCORE) {
    reasons.push(`cinematicBenchmark.matchScore=${cinematicBenchmark.matchScore}% abaixo do minimo (${READY_MIN_CINEMATIC_MATCH_SCORE}%)`);
  }
  if (sceneRedundancy.overallRisk === "HIGH") reasons.push("sceneRedundancy.overallRisk=HIGH");
  const staticCtaPresenter = characterPerformance.find((c) => c.role === "CTA_PRESENTER" && c.staticPresenceRisk);
  if (staticCtaPresenter) reasons.push(`apresentadora estatica na cena de CTA (${staticCtaPresenter.sceneId})`);
  if (commercialArc.missing.length > READY_MAX_MISSING_ARC_STAGES) {
    reasons.push(`commercialArc.missing=[${commercialArc.missing.join(", ")}] acima do maximo aceitavel (${READY_MAX_MISSING_ARC_STAGES})`);
  }

  const readyForV2PipelineIntegration = reasons.length === 0;
  const readyForV2PipelineIntegrationReasons =
    reasons.length > 0
      ? reasons
      : [
          `storyboardQualityGate.status=${v2.storyboardQualityGate.status}`,
          `cinematicBenchmark.matchScore=${cinematicBenchmark.matchScore}% (minimo ${READY_MIN_CINEMATIC_MATCH_SCORE}%)`,
          `sceneRedundancy.overallRisk=${sceneRedundancy.overallRisk}`,
          "nenhuma apresentadora estatica na cena de CTA",
          `commercialArc.missing.length=${commercialArc.missing.length} (maximo ${READY_MAX_MISSING_ARC_STAGES})`,
        ];

  return {
    v1Score: planningCapabilityScore(false),
    v2Score: planningCapabilityScore(true),
    premiumBenchmarkScore: v2.benchmarkComparison.matchScore,
    cinematicBenchmarkScore: cinematicBenchmark.matchScore,
    hookScore: v2.hookStrength.overallScore,
    productFirstScore: productFirst.score,
    creativeDensityScore: creativeDensity.overallScore,
    commercialArcScore: Math.round((commercialArc.covered.length / 5) * 100),
    genericAdRisk: v2.genericAdRisk.risk,
    sceneRedundancyRisk: sceneRedundancy.overallRisk,
    storyboardQualityGateStatus: v2.storyboardQualityGate.status,
    readyForV2PipelineIntegration,
    readyForV2PipelineIntegrationReasons,
    benchmarkStrengthAudit,
    hookAudit,
    productFirst,
    creativeDensity,
    sceneRedundancy,
    characterPerformance,
    commercialArc,
    cinematicBenchmark,
    storyboardDiff,
  };
}

export { V2_ONLY_CAPABILITIES };
