// Radar Creative AI - Creative Director V2 / Storyboard Quality Gate
//
// Gate de qualidade PRE-GERACAO (nenhum equivalente existia antes - o unico
// gate de qualidade do projeto ate aqui, lib/commercial-video/quality/*,
// avalia video JA renderizado). Espelha o mesmo padrao de resultado
// (status PASS/PASS_WITH_OBSERVATIONS/FAIL, agregacao "pior de todos") de
// lib/commercial-video/quality/commercial-quality-gate.ts, mas opera sobre
// o storyboard (CommercialCreativeDirectionV2), nunca sobre video renderizado.
//
// FAIL aqui e so INFORMATIVO nesta tarefa - nao ha EXECUTE para bloquear.
// Proxima etapa recomendada (nao implementada aqui): plugar isso em
// lib/commercial-video/runner/execute/execution-readiness.ts como um novo
// CampaignReadinessBlockedReason (ex.: BLOCKED_CREATIVE_QUALITY).

import type { CommercialDirection } from "@/lib/commercial-director/types";
import type {
  CharacterRoleSummary,
  CreativeQualityCheckResult,
  CreativeQualityStatus,
  CreativeStoryboardQualityGateResult,
  CtaDirectionV2,
  GenericAdRiskResult,
  HookStrengthEvaluation,
  OfferPresentationV2,
  PacingDirectionV2,
  SceneBlueprintV2,
} from "@/lib/creative-director-v2/types";

function aggregateCreativeQualityStatus(statuses: CreativeQualityStatus[]): CreativeQualityStatus {
  if (statuses.includes("FAIL")) return "FAIL";
  if (statuses.includes("PASS_WITH_OBSERVATIONS")) return "PASS_WITH_OBSERVATIONS";
  return "PASS";
}

export type StoryboardQualityGateInput = {
  direction: CommercialDirection;
  hookStrength: HookStrengthEvaluation;
  sceneBlueprints: SceneBlueprintV2[];
  pacing: PacingDirectionV2;
  offerPresentation: OfferPresentationV2;
  ctaDirection: CtaDirectionV2;
  characterRoleSummary: CharacterRoleSummary;
  genericAdRisk: GenericAdRiskResult;
};

function checkHookStrength(input: StoryboardQualityGateInput): CreativeQualityCheckResult {
  if (input.hookStrength.overallScore < 40) {
    return { name: "HOOK_STRENGTH", status: "FAIL", issues: input.hookStrength.weakSignals };
  }
  if (!input.hookStrength.passesMinimum) {
    return { name: "HOOK_STRENGTH", status: "PASS_WITH_OBSERVATIONS", issues: input.hookStrength.weakSignals };
  }
  return { name: "HOOK_STRENGTH", status: "PASS", issues: [] };
}

function checkProductVisibility(input: StoryboardQualityGateInput): CreativeQualityCheckResult {
  const hasProductScene = input.sceneBlueprints.some((b) => b.qualityTargets.requiresProductVisible);
  if (!hasProductScene) {
    return { name: "PRODUCT_VISIBILITY", status: "FAIL", issues: ["nenhuma cena marca o produto como visivel"] };
  }
  if (input.genericAdRisk.reasons.includes("PRODUCT_TOO_LATE")) {
    return { name: "PRODUCT_VISIBILITY", status: "PASS_WITH_OBSERVATIONS", issues: ["produto demora a aparecer para um argumento product-centric"] };
  }
  return { name: "PRODUCT_VISIBILITY", status: "PASS", issues: [] };
}

function checkVisualVariety(input: StoryboardQualityGateInput): CreativeQualityCheckResult {
  if (input.genericAdRisk.reasons.includes("REPETITIVE_COMPOSITION")) {
    return { name: "VISUAL_VARIETY", status: "FAIL", issues: ["composicao repetitiva entre cenas (mesma direcao de camera)"] };
  }
  return { name: "VISUAL_VARIETY", status: "PASS", issues: [] };
}

function checkPacing(input: StoryboardQualityGateInput): CreativeQualityCheckResult {
  if (input.pacing.averageSceneDurationSeconds > 10) {
    return { name: "PACING", status: "FAIL", issues: [`duracao media de cena muito alta para short-form (${input.pacing.averageSceneDurationSeconds}s)`] };
  }
  if (input.genericAdRisk.reasons.includes("NO_RELEVANT_MOTION")) {
    return { name: "PACING", status: "PASS_WITH_OBSERVATIONS", issues: ["nenhuma cena com movimento relevante"] };
  }
  return { name: "PACING", status: "PASS", issues: [] };
}

function checkScenePurposeClarity(input: StoryboardQualityGateInput): CreativeQualityCheckResult {
  if (input.genericAdRisk.reasons.includes("GENERIC_NARRATION_INTENT")) {
    return { name: "SCENE_PURPOSE_CLARITY", status: "PASS_WITH_OBSERVATIONS", issues: ["narrationRole.intent nao varia entre cenas"] };
  }
  return { name: "SCENE_PURPOSE_CLARITY", status: "PASS", issues: [] };
}

function checkOfferClarity(input: StoryboardQualityGateInput): CreativeQualityCheckResult {
  if (input.genericAdRisk.reasons.includes("PRICE_WITHOUT_HIERARCHY")) {
    return { name: "OFFER_CLARITY", status: "FAIL", issues: ["ha preco real disponivel mas sem prioridade visual definida"] };
  }
  return { name: "OFFER_CLARITY", status: "PASS", issues: [] };
}

function checkCtaStrength(input: StoryboardQualityGateInput): CreativeQualityCheckResult {
  if (input.genericAdRisk.reasons.includes("WEAK_CTA")) {
    return { name: "CTA_STRENGTH", status: "FAIL", issues: ["CTA sem acao visual definida apesar de haver apresentadora na campanha"] };
  }
  return { name: "CTA_STRENGTH", status: "PASS", issues: [] };
}

function checkCharacterUsage(input: StoryboardQualityGateInput): CreativeQualityCheckResult {
  if (input.genericAdRisk.reasons.includes("PRESENTER_WITHOUT_FUNCTION")) {
    return { name: "CHARACTER_USAGE", status: "FAIL", issues: ["apresentadora presente em cena sem funcao/fala associada"] };
  }
  return { name: "CHARACTER_USAGE", status: "PASS", issues: [input.characterRoleSummary.reason] };
}

function checkMobileReadability(input: StoryboardQualityGateInput): CreativeQualityCheckResult {
  const score = input.hookStrength.mobileReadability.score;
  if (score < 40) {
    return { name: "MOBILE_READABILITY", status: "FAIL", issues: [input.hookStrength.mobileReadability.reason] };
  }
  if (score < 70) {
    return { name: "MOBILE_READABILITY", status: "PASS_WITH_OBSERVATIONS", issues: [input.hookStrength.mobileReadability.reason] };
  }
  return { name: "MOBILE_READABILITY", status: "PASS", issues: [] };
}

function checkBrandIntegration(input: StoryboardQualityGateInput): CreativeQualityCheckResult {
  if (!input.ctaDirection.ctaOverlayLayout.brandOverlayRequired) {
    return { name: "BRAND_INTEGRATION", status: "FAIL", issues: ["cena de CTA nao marca brandOverlayRequired - logo/CTA da marca pode nao aparecer"] };
  }
  return { name: "BRAND_INTEGRATION", status: "PASS", issues: [] };
}

function checkGenericAdRisk(input: StoryboardQualityGateInput): CreativeQualityCheckResult {
  const status: CreativeQualityStatus = input.genericAdRisk.risk === "HIGH" ? "FAIL" : input.genericAdRisk.risk === "MEDIUM" ? "PASS_WITH_OBSERVATIONS" : "PASS";
  return { name: "GENERIC_AD_RISK", status, issues: input.genericAdRisk.details };
}

export function runCreativeStoryboardQualityGate(input: StoryboardQualityGateInput): CreativeStoryboardQualityGateResult {
  const checks: CreativeQualityCheckResult[] = [
    checkHookStrength(input),
    checkProductVisibility(input),
    checkVisualVariety(input),
    checkPacing(input),
    checkScenePurposeClarity(input),
    checkOfferClarity(input),
    checkCtaStrength(input),
    checkCharacterUsage(input),
    checkMobileReadability(input),
    checkBrandIntegration(input),
    checkGenericAdRisk(input),
  ];

  const status = aggregateCreativeQualityStatus(checks.map((c) => c.status));
  const blockingReasons = checks.filter((c) => c.status === "FAIL").flatMap((c) => c.issues);
  const observations = checks.filter((c) => c.status === "PASS_WITH_OBSERVATIONS").flatMap((c) => c.issues);

  return { status, checks, blockingReasons, observations };
}
