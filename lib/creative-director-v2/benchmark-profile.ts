// Radar Creative AI - Creative Director V2 / Benchmark Profile
//
// Representa o padrao qualitativo desejado (benchmark), so como criterios
// estruturados/booleanos - nao cita nenhuma marca/IA de terceiros no codigo,
// e um perfil qualitativo interno do produto.

import type {
  BenchmarkCheckResult,
  BenchmarkComparisonResult,
  CreativeBenchmarkProfile,
  ProductScaleTarget,
  SceneBlueprintV2,
} from "@/lib/creative-director-v2/types";
import type { HookStrengthEvaluation, PacingDirectionV2 } from "@/lib/creative-director-v2/types";

export const PRODUCT_SCALE_RANK: Record<ProductScaleTarget, number> = {
  SMALL: 0,
  MEDIUM: 1,
  LARGE: 2,
  HERO_FULL_FRAME: 3,
};

export const SHORT_FORM_PREMIUM_COMMERCE: CreativeBenchmarkProfile = {
  slug: "SHORT_FORM_PREMIUM_COMMERCE",
  name: "Anuncio premium de short-form (TikTok/Reels/Meta Ads)",
  minHookScore: 55,
  minProductScaleTarget: "MEDIUM",
  maxAverageSceneDurationSeconds: 6,
  requiresOneIdeaPerScene: true,
  requiresVisualOffer: true,
  requiresClearCta: true,
  disallowsEmptyScenes: true,
};

export type BenchmarkComparisonInput = {
  hookStrength: HookStrengthEvaluation;
  productScaleTarget: ProductScaleTarget;
  pacing: PacingDirectionV2;
  sceneBlueprints: SceneBlueprintV2[];
  hasVisualOffer: boolean;
  hasClearCta: boolean;
};

export function compareAgainstBenchmark(input: BenchmarkComparisonInput, benchmark: CreativeBenchmarkProfile): BenchmarkComparisonResult {
  const checks: BenchmarkCheckResult[] = [];

  checks.push({
    criterion: "hookImmediate",
    met: input.hookStrength.overallScore >= benchmark.minHookScore,
    detail: `hookStrength.overallScore=${input.hookStrength.overallScore}, minimo=${benchmark.minHookScore}`,
  });

  checks.push({
    criterion: "productLarge",
    met: PRODUCT_SCALE_RANK[input.productScaleTarget] >= PRODUCT_SCALE_RANK[benchmark.minProductScaleTarget],
    detail: `productScaleTarget=${input.productScaleTarget}, minimo=${benchmark.minProductScaleTarget}`,
  });

  checks.push({
    criterion: "highMobileClarity",
    met: input.pacing.averageSceneDurationSeconds <= benchmark.maxAverageSceneDurationSeconds,
    detail: `averageSceneDurationSeconds=${input.pacing.averageSceneDurationSeconds}, maximo=${benchmark.maxAverageSceneDurationSeconds}`,
  });

  const distinctObjectives = new Set(input.sceneBlueprints.map((b) => b.visualObjective)).size;
  checks.push({
    criterion: "oneIdeaPerScene",
    met: !benchmark.requiresOneIdeaPerScene || distinctObjectives === input.sceneBlueprints.length,
    detail: `${distinctObjectives} objetivos visuais distintos em ${input.sceneBlueprints.length} cenas`,
  });

  checks.push({
    criterion: "visualOffer",
    met: !benchmark.requiresVisualOffer || input.hasVisualOffer,
    detail: input.hasVisualOffer ? "oferta tem overlay/hierarquia visual" : "oferta sem overlay/hierarquia visual",
  });

  checks.push({
    criterion: "clearCta",
    met: !benchmark.requiresClearCta || input.hasClearCta,
    detail: input.hasClearCta ? "CTA tem overlay/texto claro" : "CTA sem overlay/texto claro",
  });

  const noEmptyScenes = input.sceneBlueprints.every((b) => b.subjectPriority !== "ENVIRONMENT");
  checks.push({
    criterion: "noEmptyScenes",
    met: !benchmark.disallowsEmptyScenes || noEmptyScenes,
    detail: noEmptyScenes ? "nenhuma cena sem sujeito claro" : "ha cena sem sujeito claro (produto/personagem/texto)",
  });

  const matchScore = Math.round((checks.filter((c) => c.met).length / checks.length) * 100);

  return { benchmarkSlug: benchmark.slug, matchScore, checks };
}
