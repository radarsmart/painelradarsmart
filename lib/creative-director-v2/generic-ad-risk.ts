// Radar Creative AI - Creative Director V2 / Generic Ad Risk
//
// Detecta storyboard com aparencia generica. Puro, deterministico, opera
// sobre a saida ja calculada dos outros modulos do V2 (nao reabre nenhuma
// decisao) - so aponta reasons estruturados.

import type { CommercialDirection } from "@/lib/commercial-director/types";
import type {
  CtaDirectionV2,
  GenericAdRiskReason,
  GenericAdRiskResult,
  HookStrengthEvaluation,
  OfferPresentationV2,
  SceneBlueprintV2,
} from "@/lib/creative-director-v2/types";
import { HOOK_STRENGTH_MIN_SCORE } from "@/lib/creative-director-v2/hook-engine";

const PRODUCT_CENTRIC_SELLING_ARGUMENTS = new Set(["DEMONSTRATION", "PRACTICAL_BENEFIT"]);

export type GenericAdRiskInput = {
  direction: CommercialDirection;
  sceneBlueprints: SceneBlueprintV2[];
  hookStrength: HookStrengthEvaluation;
  firstProductAppearanceSecond: number | null;
  offerPresentation: OfferPresentationV2;
  ctaDirection: CtaDirectionV2;
};

export function assessGenericAdRisk(input: GenericAdRiskInput): GenericAdRiskResult {
  const reasons: GenericAdRiskReason[] = [];
  const details: string[] = [];

  const hookBlueprint = input.sceneBlueprints.find((b) => b.purpose === "HOOK") ?? null;
  if (hookBlueprint && hookBlueprint.subjectPriority === "ENVIRONMENT") {
    reasons.push("EMPTY_OPENING_SECONDS");
    details.push("cena de HOOK nao tem sujeito claro (nem produto, nem personagem, nem overlay) - risco de abertura vazia");
  }

  if (!input.hookStrength.passesMinimum) {
    reasons.push("WEAK_HOOK_SCORE");
    details.push(`hookStrength.overallScore (${input.hookStrength.overallScore}) abaixo do minimo (${HOOK_STRENGTH_MIN_SCORE})`);
  }

  if (
    PRODUCT_CENTRIC_SELLING_ARGUMENTS.has(input.direction.sellingArgument) &&
    input.firstProductAppearanceSecond !== null &&
    input.firstProductAppearanceSecond > input.direction.durationSeconds * 0.4
  ) {
    reasons.push("PRODUCT_TOO_LATE");
    details.push(`produto so aparece em ${input.firstProductAppearanceSecond}s de ${input.direction.durationSeconds}s, mas o argumento e product-centric ("${input.direction.sellingArgument}")`);
  }

  const cameraSet = new Set(input.sceneBlueprints.map((b) => b.cameraDirection));
  if (input.sceneBlueprints.length >= 3 && cameraSet.size === 1) {
    reasons.push("REPETITIVE_COMPOSITION");
    details.push("todas as cenas usam a mesma direcao de camera - risco de composicao repetitiva");
  }

  const hasRelevantMotion = input.sceneBlueprints.some((b) => {
    const motion = b.motionDirection.toLowerCase();
    return motion.includes("rapido") || motion.includes("zoom") || motion.includes("dinamico");
  });
  if (!hasRelevantMotion) {
    reasons.push("NO_RELEVANT_MOTION");
    details.push("nenhuma cena tem movimento relevante (rapido/zoom/dinamico) - risco de video estatico demais");
  }

  const narrationIntents = new Set(input.sceneBlueprints.map((b) => b.narrationRole.intent));
  if (input.sceneBlueprints.length >= 3 && narrationIntents.size < 2) {
    reasons.push("GENERIC_NARRATION_INTENT");
    details.push("narrationRole.intent nao varia entre as cenas - mensagem pode soar repetitiva/generica");
  }

  const characterAppearsSomewhere = input.sceneBlueprints.some((b) => b.characterRole.role !== "NONE");
  if (characterAppearsSomewhere && input.ctaDirection.ctaVisualAction === "NONE") {
    reasons.push("WEAK_CTA");
    details.push("ha apresentadora na campanha mas o CTA nao tem acao visual definida");
  }

  const hasBenefitOrProof = input.direction.scenes.some((s) => s.purpose === "BENEFIT" || s.purpose === "PROOF");
  if (!hasBenefitOrProof) {
    reasons.push("NO_BENEFIT_SIGNAL");
    details.push("nenhuma cena de BENEFIT/PROOF no storyboard - anuncio pode nao comunicar beneficio real");
  }

  const presenterWithoutFunction = input.sceneBlueprints.some((b) => b.characterRole.role !== "NONE" && b.characterRole.line === null);
  if (presenterWithoutFunction) {
    reasons.push("PRESENTER_WITHOUT_FUNCTION");
    details.push("ha cena com apresentadora presente mas sem fala/direcao de voiceover associada");
  }

  if (input.offerPresentation.pricePriority === "NONE" && input.direction.offerStrategy.currentPrice !== null) {
    reasons.push("PRICE_WITHOUT_HIERARCHY");
    details.push("ha preco real disponivel mas pricePriority ficou NONE - oferta sem hierarquia visual");
  }

  const risk: GenericAdRiskResult["risk"] = reasons.length >= 3 ? "HIGH" : reasons.length >= 1 ? "MEDIUM" : "LOW";

  return { risk, reasons, details };
}
