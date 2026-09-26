// Radar Creative AI - Creative Director V2 / Validation / Cinematic Benchmark
//
// Perfil PROPRIO, mais exigente que SHORT_FORM_PREMIUM_COMMERCE
// (benchmark-profile.ts, que fica INTOCADO - nao e estendido nem
// substituido). Consome os scores JA calculados pelos outros modulos de
// validacao (density/redundancy/character-performance/arc) - nao recalcula
// nada.

import { PRODUCT_SCALE_RANK } from "@/lib/creative-director-v2/benchmark-profile";
import type { BenchmarkCheckResult, BenchmarkComparisonResult, HookStrengthEvaluation, PacingDirectionV2, ProductScaleTarget } from "@/lib/creative-director-v2/types";
import { SCENE_REDUNDANCY_RISK_RANK } from "@/lib/creative-director-v2/validation/scene-redundancy";
import type {
  CharacterPerformanceDirection,
  CinematicBenchmarkProfile,
  CommercialArcCoverage,
  CreativeDensityScore,
  SceneRedundancyAnalysis,
} from "@/lib/creative-director-v2/validation/types";

// Mais exigente em TODOS os eixos que SHORT_FORM_PREMIUM_COMMERCE
// (minHookScore 55->75, minProductScaleTarget MEDIUM->LARGE,
// maxAverageSceneDurationSeconds 6->4), mais 4 criterios que o benchmark
// antigo simplesmente nao tinha (densidade, redundancia, performance de
// personagem, cobertura de arco).
export const SHORT_FORM_CINEMATIC_COMMERCE: CinematicBenchmarkProfile = {
  slug: "SHORT_FORM_CINEMATIC_COMMERCE",
  name: "Anuncio cinematografico premium (padrao mais exigente que SHORT_FORM_PREMIUM_COMMERCE)",
  minHookScore: 75,
  minProductScaleTarget: "LARGE",
  maxAverageSceneDurationSeconds: 4,
  minCreativeDensityScore: 70,
  maxSceneRedundancyRisk: "LOW",
  disallowsStaticPresence: true,
  minCommercialArcStagesCovered: 4,
};

export type CinematicBenchmarkInput = {
  hookStrength: HookStrengthEvaluation;
  productScaleTarget: ProductScaleTarget;
  pacing: PacingDirectionV2;
  creativeDensity: CreativeDensityScore;
  sceneRedundancy: SceneRedundancyAnalysis;
  characterPerformance: CharacterPerformanceDirection[];
  commercialArc: CommercialArcCoverage;
};

export function compareAgainstCinematicBenchmark(input: CinematicBenchmarkInput, profile: CinematicBenchmarkProfile): BenchmarkComparisonResult {
  const checks: BenchmarkCheckResult[] = [];

  checks.push({
    criterion: "hookImmediate",
    met: input.hookStrength.overallScore >= profile.minHookScore,
    detail: `hookStrength.overallScore=${input.hookStrength.overallScore}, minimo cinematic=${profile.minHookScore}`,
  });

  checks.push({
    criterion: "productLarge",
    met: PRODUCT_SCALE_RANK[input.productScaleTarget] >= PRODUCT_SCALE_RANK[profile.minProductScaleTarget],
    detail: `productScaleTarget=${input.productScaleTarget}, minimo cinematic=${profile.minProductScaleTarget}`,
  });

  checks.push({
    criterion: "highMobileClarity",
    met: input.pacing.averageSceneDurationSeconds <= profile.maxAverageSceneDurationSeconds,
    detail: `averageSceneDurationSeconds=${input.pacing.averageSceneDurationSeconds}, maximo cinematic=${profile.maxAverageSceneDurationSeconds}`,
  });

  checks.push({
    criterion: "creativeDensity",
    met: input.creativeDensity.overallScore >= profile.minCreativeDensityScore,
    detail: `creativeDensityScore=${input.creativeDensity.overallScore}, minimo=${profile.minCreativeDensityScore}`,
  });

  checks.push({
    criterion: "noRedundancy",
    met: SCENE_REDUNDANCY_RISK_RANK[input.sceneRedundancy.overallRisk] <= SCENE_REDUNDANCY_RISK_RANK[profile.maxSceneRedundancyRisk],
    detail: `sceneRedundancy.overallRisk=${input.sceneRedundancy.overallRisk}, maximo aceitavel=${profile.maxSceneRedundancyRisk}`,
  });

  const staticPresenceScenes = input.characterPerformance.filter((c) => c.staticPresenceRisk);
  checks.push({
    criterion: "noStaticPresence",
    met: !profile.disallowsStaticPresence || staticPresenceScenes.length === 0,
    detail:
      staticPresenceScenes.length === 0
        ? "nenhuma cena com apresentadora estatica (sem gesto/emocao)"
        : `${staticPresenceScenes.length} cena(s) com risco de apresentadora estatica: ${staticPresenceScenes.map((c) => c.sceneId).join(", ")}`,
  });

  checks.push({
    criterion: "arcCoverage",
    met: input.commercialArc.covered.length >= profile.minCommercialArcStagesCovered,
    detail: `${input.commercialArc.covered.length}/5 estagios cobertos (minimo cinematic=${profile.minCommercialArcStagesCovered}) - faltando: ${input.commercialArc.missing.join(", ") || "nenhum"}`,
  });

  const matchScore = Math.round((checks.filter((c) => c.met).length / checks.length) * 100);

  return { benchmarkSlug: profile.slug, matchScore, checks };
}
