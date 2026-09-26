// Radar Creative AI - Creative Director V2 / Scene Blueprint Builder
//
// Monta o SceneBlueprintV2 de cada cena combinando as pecas decididas pelos
// outros modulos do V2 com campos que JA existem em CommercialScene (motion,
// camera, textOverlay etc. - reaproveitados, nunca reescritos) e reusando
// buildOverlayPlan() (lib/prompt-builder/overlay-plan.ts) em vez de recriar
// overlay. O blueprint NUNCA escolhe provider.

import type { CommercialDirection, CommercialScene, ScenePurpose } from "@/lib/commercial-director/types";
import { buildOverlayPlan } from "@/lib/prompt-builder/overlay-plan";
import { selectTransitionIntent } from "@/lib/creative-director-v2/pacing-director";
import { isProductCentricPurpose, selectProductPresentationStrategy, selectVisualEffectDirections } from "@/lib/creative-director-v2/product-presentation";
import { HOOK_STRENGTH_MIN_SCORE } from "@/lib/creative-director-v2/hook-engine";
import type {
  CharacterRoleDirection,
  CreativeConcept,
  EmotionalAngle,
  HookStrengthEvaluation,
  NarrationIntent,
  OfferPresentationV2,
  PacingStyleV2,
  ProductPresentationStrategy,
  ProductRole,
  SceneBlueprintV2,
  SubjectPriority,
  TransitionIntentV2,
} from "@/lib/creative-director-v2/types";

const CONCEPT_LABEL: Record<CreativeConcept, string> = {
  SURPRISING_DISCOVERY: "descoberta surpreendente",
  ACCESSIBLE_LUXURY: "luxo acessivel",
  VISUAL_TRANSFORMATION: "transformacao visual",
  IRRESISTIBLE_PRICE: "preco irresistivel",
  SMART_COMPARISON: "comparacao inteligente",
  QUICK_DEMONSTRATION: "demonstracao rapida",
  PROBLEM_SOLUTION: "problema -> solucao",
  TREND_DESIRE: "tendencia/desejo",
  VISUAL_PROOF: "prova visual",
  ASPIRATIONAL_LIFESTYLE: "lifestyle aspiracional",
};

const TONE_BY_EMOTIONAL_ANGLE: Record<EmotionalAngle, string> = {
  EXCITEMENT: "energico",
  RELIEF: "acolhedor",
  ASPIRATION: "aspiracional",
  CURIOSITY: "intrigante",
  TRUST: "confiante",
  URGENCY: "urgente",
  PRIDE: "orgulhoso",
};

const NARRATION_INTENT_BY_PURPOSE: Record<ScenePurpose, NarrationIntent> = {
  HOOK: "DISCOVERY",
  PROBLEM: "DESIRE",
  PRODUCT: "DESIRE",
  BENEFIT: "BENEFIT",
  PROOF: "BENEFIT",
  OFFER: "OFFER",
  CTA: "CTA",
};

const ENVIRONMENT_BY_VISUAL_STYLE: Record<string, string> = {
  PREMIUM_COMMERCIAL: "estudio premium, fundo controlado",
  UGC_NATIVE: "ambiente cotidiano, luz natural",
  PRODUCT_HERO: "estudio com fundo neutro, foco total no produto",
  LIFESTYLE: "ambiente real de uso do produto",
  LUXURY: "cenario sofisticado, iluminacao dourada/quente",
  TECH: "ambiente minimalista, luz fria/azulada",
  BEAUTY: "estudio com luz suave e reflexos",
  FITNESS: "ambiente ativo, energia e movimento",
  HOME_DEMO: "ambiente domestico real",
};

function buildCreativeIntent(concept: CreativeConcept, purpose: ScenePurpose): string {
  return `${CONCEPT_LABEL[concept]} aplicado ao momento de "${purpose}"`;
}

function buildVisualObjective(scene: CommercialScene, purpose: ScenePurpose, productStrategy: string | null): string {
  if (productStrategy !== null) {
    return `apresentar o produto com estrategia "${productStrategy}"`;
  }
  switch (purpose) {
    case "HOOK":
      return "prender atencao nos primeiros segundos";
    case "PROBLEM":
      return "nomear a dor/situacao do publico de forma clara";
    case "PROOF":
      return "reforcar confianca com prova real disponivel";
    default:
      return scene.visualSubject;
  }
}

function buildSubjectPriority(scene: CommercialScene, characterRole: CharacterRoleDirection): SubjectPriority {
  if (characterRole.role !== "NONE") return "CHARACTER";
  if (isProductCentricPurpose(scene.purpose)) return "PRODUCT";
  if (scene.textOverlay !== null) return "TEXT_OVERLAY";
  return "ENVIRONMENT";
}

function buildProductRole(scene: CommercialScene): ProductRole {
  if (!isProductCentricPurpose(scene.purpose)) return "NONE";
  if (scene.purpose === "PRODUCT" || scene.purpose === "OFFER") return "HERO";
  if (scene.purpose === "BENEFIT") return "SUPPORTING";
  return "BACKGROUND";
}

function buildEnvironmentDirection(visualStyle: string): string {
  return ENVIRONMENT_BY_VISUAL_STYLE[visualStyle] ?? "ambiente neutro, coerente com a identidade visual da marca";
}

export type SceneBlueprintContext = {
  concept: CreativeConcept;
  emotionalAngle: EmotionalAngle;
  pacingStyle: PacingStyleV2;
  offerPresentation: OfferPresentationV2;
  hookStrength: HookStrengthEvaluation | null;
  // Overrides OPCIONAIS - usados so pelo Decision Engine
  // (lib/creative-director-v2/decision-engine/**), que decide esses 3 campos
  // com regras proprias por cena (ambiente variando dentro do mesmo Visual
  // World, sequencia de transicao sem repeticao, estrategia de produto sem
  // repeticao adjacente). Quando omitidos (todo o resto do V2, Fase 1,
  // sempre omite), o comportamento e IDENTICO ao anterior - nao e uma
  // mudanca de default, so uma capacidade nova opcional.
  environmentOverride?: string;
  transitionOverride?: TransitionIntentV2;
  productPresentationOverride?: ProductPresentationStrategy | null;
  // productRole/subjectPriority tambem opcionais - usados so quando o
  // Decision Engine determina (via SceneSubjectDirection, nunca so por
  // purpose) que uma cena != PRODUCT/BENEFIT/OFFER/CTA (ex.: HOOK) ja mostra
  // o produto como sujeito real. buildProductRole/buildSubjectPriority (por
  // purpose, Fase 1) continuam intocadas - so nao sao usadas quando o
  // override vem preenchido.
  productRoleOverride?: ProductRole;
  subjectPriorityOverride?: SubjectPriority;
};

export function buildSceneBlueprint(
  scene: CommercialScene,
  direction: CommercialDirection,
  characterRole: CharacterRoleDirection,
  context: SceneBlueprintContext,
): SceneBlueprintV2 {
  const productPresentationStrategy =
    context.productPresentationOverride !== undefined ? context.productPresentationOverride : selectProductPresentationStrategy(scene, direction);
  const hasCharacterInScene = characterRole.role !== "NONE";

  const overlayPlan = buildOverlayPlan({
    purpose: scene.purpose,
    offerStrategy: direction.offerStrategy,
    ctaStrategy: direction.ctaStrategy,
    hasCharacterInScene,
  });

  const narrationIntent = NARRATION_INTENT_BY_PURPOSE[scene.purpose];
  const messagePriority =
    scene.purpose === "OFFER"
      ? context.offerPresentation.pricePriority
      : scene.purpose === "CTA"
        ? context.offerPresentation.ctaPriority
        : scene.purpose === "HOOK"
          ? "HIGH"
          : "MEDIUM";

  return {
    sceneId: scene.id,
    purpose: scene.purpose,
    creativeIntent: buildCreativeIntent(context.concept, scene.purpose),
    visualObjective: buildVisualObjective(scene, scene.purpose, productPresentationStrategy),
    subjectPriority: context.subjectPriorityOverride ?? buildSubjectPriority(scene, characterRole),
    productRole: context.productRoleOverride ?? buildProductRole(scene),
    productPresentationStrategy,
    characterRole,
    motionDirection: scene.motion,
    cameraDirection: scene.camera,
    environmentDirection: context.environmentOverride ?? buildEnvironmentDirection(direction.visualStyle),
    effectDirection: selectVisualEffectDirections(scene, direction.visualStyle),
    overlayPlan,
    narrationRole: {
      intent: narrationIntent,
      tone: TONE_BY_EMOTIONAL_ANGLE[context.emotionalAngle],
      energy: direction.audioDirection.musicEnergy,
      messagePriority,
    },
    transitionIntent: context.transitionOverride ?? selectTransitionIntent(scene.purpose, context.pacingStyle),
    desiredDuration: scene.endSecond - scene.startSecond,
    qualityTargets: {
      minHookStrength: scene.purpose === "HOOK" ? HOOK_STRENGTH_MIN_SCORE : null,
      requiresProductVisible: isProductCentricPurpose(scene.purpose),
      requiresCtaVisualAction: scene.purpose === "CTA" && hasCharacterInScene,
    },
  };
}
