// Radar Creative AI - Creative Director V2 / Decision Engine / Redundancy Reducer
//
// Depois que o plano inicial e montado e avaliado (analyzeSceneRedundancy,
// reusada de validation/scene-redundancy.ts), muta dimensoes da cena mais
// tardia de cada par MEDIUM/HIGH. Escalada por passe (chamada pelo loop
// limitado em decision-engine.ts, MAX_REDUNDANCY_PASSES=2): passe 1 muda
// camera (angulo+distancia) + ambiente; passe 2 adiciona estrategia de
// produto + transicao. Nunca mais que 2 passes - se ainda ficar MEDIUM/HIGH
// depois disso, o resultado reporta isso honestamente (nao mascara).

import type { CommercialDirection } from "@/lib/commercial-director/types";
import type { SceneBlueprintOverride } from "@/lib/creative-director-v2/creative-director-v2";
import { buildSceneGeometry, renderGeometryToCameraString, type CameraAngleV2, type CameraDistanceV2 } from "@/lib/creative-director-v2/decision-engine/scene-geometry";
import { decideEnvironmentPurpose, deriveSceneEnvironment, type EnvironmentPurpose } from "@/lib/creative-director-v2/decision-engine/environment-decision";
import type { VisualWorldDirection } from "@/lib/creative-director-v2/decision-engine/visual-world";
import type { ProductPresentationStrategy } from "@/lib/creative-director-v2/types";

export const MAX_REDUNDANCY_PASSES = 2;

const CAMERA_ANGLE_CYCLE: CameraAngleV2[] = ["EYE_LEVEL", "SLIGHT_HIGH", "SLIGHT_LOW", "OVERHEAD"];
const CAMERA_DISTANCE_CYCLE: CameraDistanceV2[] = ["MACRO", "CLOSE", "MEDIUM", "WIDE"];
const ENVIRONMENT_PURPOSE_CYCLE: EnvironmentPurpose[] = ["HERO_STAGE", "MACRO_STUDIO", "LIFESTYLE_CONTEXT", "OFFER_STAGE", "CTA_BRAND_STAGE"];

const ALTERNATE_PRODUCT_PRESENTATION: Record<ProductPresentationStrategy, ProductPresentationStrategy> = {
  HERO_REVEAL: "FLOATING_PREMIUM",
  MACRO_DETAIL: "BENEFIT_DEMO",
  FLOATING_PREMIUM: "ROTATION_SHOWCASE",
  ENVIRONMENTAL_STAGE: "LIFESTYLE_CONTEXT",
  ROTATION_SHOWCASE: "MACRO_DETAIL",
  BENEFIT_DEMO: "MACRO_DETAIL",
  LIFESTYLE_CONTEXT: "ENVIRONMENTAL_STAGE",
  COMPARISON: "BEFORE_AFTER",
  BEFORE_AFTER: "COMPARISON",
  PACKSHOT_OFFER: "HERO_REVEAL",
};

function nextInCycle<T>(cycle: T[], current: T): T {
  const index = cycle.indexOf(current);
  return cycle[(index + 1) % cycle.length];
}

export function mutateSceneToReduceRedundancy(
  direction: CommercialDirection,
  sceneOverrides: SceneBlueprintOverride[],
  visualWorld: VisualWorldDirection,
  sceneIndex: number,
  passNumber: 1 | 2,
): { direction: CommercialDirection; sceneOverrides: SceneBlueprintOverride[] } {
  const scenes = [...direction.scenes];
  const overrides = [...sceneOverrides];
  const scene = scenes[sceneIndex];
  const purpose = scene.purpose;

  const geometry = buildSceneGeometry(purpose);
  const mutatedGeometry = {
    ...geometry,
    cameraAngle: nextInCycle(CAMERA_ANGLE_CYCLE, geometry.cameraAngle),
    cameraDistance: nextInCycle(CAMERA_DISTANCE_CYCLE, geometry.cameraDistance),
  };

  const currentEnvironmentPurpose = decideEnvironmentPurpose(purpose);
  const mutatedEnvironmentPurpose = nextInCycle(ENVIRONMENT_PURPOSE_CYCLE, currentEnvironmentPurpose);

  scenes[sceneIndex] = {
    ...scene,
    camera: renderGeometryToCameraString(mutatedGeometry),
    lighting: deriveSceneEnvironment(visualWorld, mutatedEnvironmentPurpose),
  };

  const currentOverride = overrides[sceneIndex];
  overrides[sceneIndex] = {
    ...currentOverride,
    environmentOverride: deriveSceneEnvironment(visualWorld, mutatedEnvironmentPurpose),
  };

  if (passNumber === 2) {
    const currentStrategy = currentOverride.productPresentationOverride ?? null;
    if (currentStrategy !== null && ALTERNATE_PRODUCT_PRESENTATION[currentStrategy]) {
      overrides[sceneIndex] = {
        ...overrides[sceneIndex],
        productPresentationOverride: ALTERNATE_PRODUCT_PRESENTATION[currentStrategy],
      };
    }
  }

  return { direction: { ...direction, scenes }, sceneOverrides: overrides };
}
