// Radar Creative AI - Creative Director V2 / Validation / Product-First Score
//
// So para campanhas product-centric: combina 4 sinais JA calculados pelo V2
// (nunca reavaliados aqui) num score 0-100 com pesos DOCUMENTADOS. Reaproveita
// PRODUCT_SCALE_RANK ja exportado de benchmark-profile.ts em vez de
// redeclarar a ordem SMALL..HERO_FULL_FRAME.

import { PRODUCT_SCALE_RANK } from "@/lib/creative-director-v2/benchmark-profile";
import type { CommercialCreativeDirectionV2 } from "@/lib/creative-director-v2/types";
import type { ProductFirstScore } from "@/lib/creative-director-v2/validation/types";

const WEIGHT_TIMING = 0.3;
const WEIGHT_COVERAGE = 0.25;
const WEIGHT_SCALE = 0.25;
const WEIGHT_MOVEMENT = 0.2;

const MAX_SCALE_RANK = Math.max(...Object.values(PRODUCT_SCALE_RANK));

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function scoreProductFirst(v2: CommercialCreativeDirectionV2): ProductFirstScore {
  const durationSeconds = v2.underlyingDirection.durationSeconds;

  const appearanceTimingScore =
    v2.firstProductAppearanceSecond === null
      ? 0
      : clamp(100 - (v2.firstProductAppearanceSecond / durationSeconds) * 100, 0, 100);

  const screenCoverageRatio = durationSeconds > 0 ? v2.heroProductDuration / durationSeconds : 0;
  const screenCoverageScore = clamp(screenCoverageRatio * 100, 0, 100);

  const productScaleScore = clamp((PRODUCT_SCALE_RANK[v2.productScaleTarget] / MAX_SCALE_RANK) * 100, 0, 100);

  // Mesma heuristica textual ja usada em generic-ad-risk.ts (hasRelevantMotion),
  // aplicada so a cena-heroi de produto - nao reimplementa deteccao de motion,
  // so reaplica a mesma regra de substring num escopo menor.
  const heroBlueprint = v2.sceneBlueprints.find((b) => b.productRole === "HERO") ?? null;
  const productMovementIntentPresent = heroBlueprint
    ? ["rapido", "zoom", "dinamico"].some((term) => heroBlueprint.motionDirection.toLowerCase().includes(term))
    : false;
  const productMovementScore = productMovementIntentPresent ? 100 : 30;

  const score = Math.round(
    appearanceTimingScore * WEIGHT_TIMING +
      screenCoverageScore * WEIGHT_COVERAGE +
      productScaleScore * WEIGHT_SCALE +
      productMovementScore * WEIGHT_MOVEMENT,
  );

  return {
    score,
    firstProductAppearanceSecond: v2.firstProductAppearanceSecond,
    appearanceTimingScore: Math.round(appearanceTimingScore),
    screenCoverageRatio: Number(screenCoverageRatio.toFixed(2)),
    screenCoverageScore: Math.round(screenCoverageScore),
    productScaleTarget: v2.productScaleTarget,
    productScaleScore: Math.round(productScaleScore),
    productMovementIntentPresent,
    productMovementScore,
  };
}
