// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - CURRENT_V2 Adapter
//
// PURO, SOMENTE LEITURA - converte um CommercialCreativeDirectionV2 JA
// REAL (nunca recalculado/alterado) num PersuasionStoryboard generico, para
// que o MESMO scorer.ts avalie CURRENT_V2 e DESIRE_ENGINE_V1 com os
// EXATOS mesmos criterios (item 27 do pedido - comparacao justa, nunca
// numeros calibrados a mao). Este arquivo NUNCA importa/altera nada de
// lib/creative-director-v2/** alem de TIPOS (leitura) - a Creative
// Director V2 real permanece intocada (item 14 do pedido anterior,
// continua valendo).

import type { CommercialCreativeDirectionV2, SceneBlueprintV2 } from "@/lib/creative-director-v2/types";
import type { CharacterNarrativeRole, EnvironmentRelevance, PersuasionArcStage, PersuasionSceneConcept, PersuasionStoryboard, ProductInteraction, ProductVisualRole } from "@/lib/commercial-video/persuasion/types";

const ARC_STAGE_BY_PURPOSE: Record<string, PersuasionArcStage> = {
  HOOK: "ATTENTION",
  PROBLEM: "INTEREST",
  PRODUCT: "INTEREST",
  BENEFIT: "DESIRE",
  PROOF: "DESIRE",
  OFFER: "VALUE",
  CTA: "ACTION",
};

const CHARACTER_ROLE_MAP: Record<string, CharacterNarrativeRole> = {
  NONE: "NONE",
  HOOK_PRESENTER: "HOOK_PRESENTER",
  EXPLAINER: "PRODUCT_GUIDE",
  SOCIAL_PROOF_PRESENTER: "TRUST_ANCHOR",
  OFFER_PRESENTER: "OFFER_PRESENTER",
  CTA_PRESENTER: "CTA_CLOSER",
};

const FLOATING_STRATEGIES = new Set(["HERO_REVEAL", "FLOATING_PREMIUM", "ROTATION_SHOWCASE", "ENVIRONMENTAL_STAGE", "PACKSHOT_OFFER"]);

function mapProductVisualRole(strategy: string | null): ProductVisualRole {
  if (!strategy) return "PACKSHOT";
  if (strategy === "MACRO_DETAIL") return "PACKSHOT";
  if (FLOATING_STRATEGIES.has(strategy)) return "FLOATING_HERO";
  if (strategy === "BENEFIT_DEMO") return "DEMONSTRATION";
  if (strategy === "LIFESTYLE_CONTEXT") return "EXPERIENCE";
  if (strategy === "COMPARISON" || strategy === "BEFORE_AFTER") return "RESULT_VISUALIZATION";
  return "PACKSHOT";
}

// visualStyle "apropriado" por categoria EFETIVA (corrigida) - lista
// pequena e generica, usada so para classificar CURRENT_V2 (que decidiu
// visualStyle com base na categoria ERRADA "suplementos" - ver
// claim-grounding.ts#detectCategoryMismatch). "FITNESS" para uma categoria
// != suplementos e o proprio bug real observado.
const CATEGORY_APPROPRIATE_VISUAL_STYLES: Record<string, string[]> = {
  beleza: ["BEAUTY", "LUXURY", "PRODUCT_HERO", "PREMIUM_COMMERCIAL"],
  suplementos: ["FITNESS", "PRODUCT_HERO", "PREMIUM_COMMERCIAL"],
  geral: ["PREMIUM_COMMERCIAL", "PRODUCT_HERO", "UGC_NATIVE", "HOME_DEMO"],
};

function classifyEnvironmentRelevance(visualStyle: string, effectiveCategory: string): EnvironmentRelevance {
  if (visualStyle === "FITNESS" && effectiveCategory !== "suplementos") return "UNRELATED_ASPIRATIONAL";
  const appropriate = CATEGORY_APPROPRIATE_VISUAL_STYLES[effectiveCategory] ?? CATEGORY_APPROPRIATE_VISUAL_STYLES.geral;
  if (appropriate.includes(visualStyle)) return "PRODUCT_NATIVE_CONTEXT";
  return "LIFESTYLE_ADJACENT";
}

function mapProductInteraction(blueprint: SceneBlueprintV2): ProductInteraction {
  if (blueprint.characterRole.role !== "NONE" && blueprint.productRole === "HERO") return "POINTED_AT";
  if (blueprint.productPresentationStrategy === "BENEFIT_DEMO") return "APPLIED";
  return "NONE";
}

export function adaptCommercialDirectionV2ToPersuasionStoryboard(
  v2: CommercialCreativeDirectionV2,
  effectiveCategory: string,
  realNarrationBySceneId: Record<string, string> = {},
): PersuasionStoryboard {
  const visualStyle = v2.visualWorld;

  const scenes: PersuasionSceneConcept[] = v2.sceneBlueprints.map((blueprint, index) => {
    const environmentRelevance = classifyEnvironmentRelevance(visualStyle, effectiveCategory);
    const characterNarrativeRole = CHARACTER_ROLE_MAP[blueprint.characterRole.role] ?? "NONE";
    const overlayCategories: PersuasionSceneConcept["overlayCategories"] = [];
    if (blueprint.overlayPlan.overlayInstructions.priceText) overlayCategories.push("PRICE_TEXT");
    if (blueprint.overlayPlan.overlayInstructions.discountText) overlayCategories.push("PRICE_TEXT");
    if (blueprint.overlayPlan.overlayInstructions.ctaText) overlayCategories.push("CTA_TEXT");

    return {
      sceneId: blueprint.sceneId,
      order: index + 1,
      purpose: blueprint.purpose,
      durationSecondsHint: blueprint.desiredDuration,
      arcStage: ARC_STAGE_BY_PURPOSE[blueprint.purpose] ?? "INTEREST",
      productVisualRole: mapProductVisualRole(blueprint.productPresentationStrategy),
      productInteraction: mapProductInteraction(blueprint),
      environmentDescription: blueprint.environmentDirection,
      environmentRelevance,
      environmentJustification: null, // CURRENT_V2 nunca registra uma justificativa criativa explicita de ambiente
      characterNarrativeRole,
      characterPerformanceIntent: null,
      // CURRENT_V2 nunca teve uma claim REAL grounded por tras do BENEFIT
      // (a unica fonte disponivel era product_intelligence de categoria
      // errada) - honesto deixar null em vez de fingir que havia base.
      benefitClaimId: null,
      salesAngleAlignment: false, // CURRENT_V2 nunca teve um SalesAngle explicito
      offerRole: blueprint.purpose === "OFFER" ? "REVEAL" : "NONE",
      ctaRole: blueprint.purpose === "CTA" ? "PRIMARY" : "NONE",
      overlayCategories,
      whyContinueWatching: blueprint.creativeIntent,
      narrationIntent: `${blueprint.narrationRole.intent} / tom ${blueprint.narrationRole.tone}`,
      suggestedNarration: realNarrationBySceneId[blueprint.sceneId] ?? "(narracao real nao disponivel neste adapter)",
      visualConcept: blueprint.visualObjective,
      consumerState: `${blueprint.narrationRole.intent}`,
      persuasionObjective: blueprint.creativeIntent,
    };
  });

  return {
    label: "CURRENT_V2",
    scenes,
    sceneCount: scenes.length,
    salesAngle: "PRODUCT_DISCOVERY", // rotulo neutro - CURRENT_V2 nunca decidiu um angulo explicito
    totalDurationSecondsHint: scenes.reduce((sum, s) => sum + (s.durationSecondsHint ?? 0), 0),
  };
}
