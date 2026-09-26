// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Commercial Persuasion Quality Gate
//
// PURO - agrega todos os checks num veredito PASS/PASS_WITH_OBSERVATIONS/
// FAIL. Thresholds definidos AQUI, como constantes nomeadas, ANTES de
// rodar o DRY_RUN desta tarefa contra a campanha Kokeshi real - nunca
// ajustados depois para fazer o resultado passar (item 21 do pedido).
//
// Um comercial pode ter CinematicBenchmark=100/ProductFidelity=PASS e
// mesmo assim FAIL aqui (item 2 do pedido) - os dois gates sao
// INDEPENDENTES, nunca fundidos num so numero.

import { detectFakeUrgency } from "@/lib/commercial-video/persuasion/purchase-motivation-questions";
import type {
  BenefitVisualizationScore,
  CharacterIntegrationResult,
  CommercialPersuasionQualityGateResult,
  EmotionalProgressionResult,
  GenericAiAdRiskV2Result,
  HookPersuasionResult,
  PersuasionCheckResult,
  PersuasionEvidence,
  PersuasionRedundancyResult,
  ProductContextRelevanceResult,
  PurchaseMotivationAnswers,
  PurchaseMotivationScoreResult,
  ScrollStopResult,
} from "@/lib/commercial-video/persuasion/types";

// Sugestao inicial do pedido, revisada e adotada como esta (documentado):
// CHARACTER_INTEGRATION so se aplica quando ha personagem em pelo menos
// uma cena (ver scoreCharacterIntegration - N/A vira score=100, nunca
// bloqueia campanhas PRODUCT_ONLY legitimas).
export const PERSUASION_THRESHOLDS = {
  DESIRE_SCORE: 75,
  HOOK_PERSUASION: 75,
  SCROLL_STOP_POWER: 70,
  PRODUCT_CONTEXT_RELEVANCE: 75,
  PURCHASE_MOTIVATION: 75,
  EMOTIONAL_PROGRESSION: 70,
  CHARACTER_INTEGRATION: 70,
  BENEFIT_VISUALIZATION: 60,
  PERSUASION_REDUNDANCY: 70,
} as const;

function statusFromScore(score: number, threshold: number, severity: PersuasionCheckResult["severity"] = "BLOCKING"): PersuasionCheckResult["status"] {
  if (score >= threshold) return "PASS";
  if (score >= threshold - 15) return "PASS_WITH_OBSERVATIONS";
  return severity === "CRITICAL" || severity === "BLOCKING" ? "FAIL" : "PASS_WITH_OBSERVATIONS";
}

export type BuildPersuasionQualityGateInput = {
  evidence: PersuasionEvidence;
  hookPersuasion: HookPersuasionResult;
  scrollStop: ScrollStopResult;
  contextRelevance: ProductContextRelevanceResult;
  benefitVisualization: BenefitVisualizationScore;
  purchaseMotivation: PurchaseMotivationScoreResult;
  emotionalProgression: EmotionalProgressionResult;
  redundancy: PersuasionRedundancyResult;
  characterIntegration: CharacterIntegrationResult;
  genericAdRisk: GenericAiAdRiskV2Result;
  desireScore: number;
  characterUsedInStoryboard: boolean;
  motivationAnswers: PurchaseMotivationAnswers;
};

export function buildCommercialPersuasionQualityGate(input: BuildPersuasionQualityGateInput): CommercialPersuasionQualityGateResult {
  const checks: PersuasionCheckResult[] = [];

  checks.push({
    name: "CLAIM_SAFETY",
    status: input.evidence.forbiddenClaims.length > 0 ? (input.evidence.categoryMismatch.detected ? "PASS_WITH_OBSERVATIONS" : "FAIL") : "PASS",
    score: null,
    threshold: null,
    severity: "CRITICAL",
    reasons:
      input.evidence.forbiddenClaims.length > 0
        ? [
            `${input.evidence.forbiddenClaims.length} claim(s) FORBIDDEN detectada(s) e EXCLUIDAS do desire profile.` +
              (input.evidence.categoryMismatch.detected ? ` Causa raiz: ${input.evidence.categoryMismatch.reason}` : ""),
          ]
        : ["Nenhuma claim proibida usada."],
    affectedScenes: [],
  });

  checks.push({ name: "DESIRE_SCORE", status: statusFromScore(input.desireScore, PERSUASION_THRESHOLDS.DESIRE_SCORE), score: input.desireScore, threshold: PERSUASION_THRESHOLDS.DESIRE_SCORE, severity: "BLOCKING", reasons: [], affectedScenes: [] });

  checks.push({
    name: "HOOK_PERSUASION",
    status: statusFromScore(input.hookPersuasion.score, PERSUASION_THRESHOLDS.HOOK_PERSUASION),
    score: input.hookPersuasion.score,
    threshold: PERSUASION_THRESHOLDS.HOOK_PERSUASION,
    severity: "BLOCKING",
    reasons: input.hookPersuasion.reasons,
    affectedScenes: [],
  });

  checks.push({
    name: "SCROLL_STOP_POWER",
    status: statusFromScore(input.scrollStop.score, PERSUASION_THRESHOLDS.SCROLL_STOP_POWER),
    score: input.scrollStop.score,
    threshold: PERSUASION_THRESHOLDS.SCROLL_STOP_POWER,
    severity: "BLOCKING",
    reasons: input.scrollStop.reasons,
    affectedScenes: [],
  });

  checks.push({
    name: "PRODUCT_CONTEXT_RELEVANCE",
    status: statusFromScore(input.contextRelevance.score, PERSUASION_THRESHOLDS.PRODUCT_CONTEXT_RELEVANCE),
    score: input.contextRelevance.score,
    threshold: PERSUASION_THRESHOLDS.PRODUCT_CONTEXT_RELEVANCE,
    severity: "BLOCKING",
    reasons: input.contextRelevance.reasons,
    affectedScenes: input.contextRelevance.perScene.filter((s) => s.relevance === "UNRELATED_ASPIRATIONAL").map((s) => s.sceneId),
  });

  checks.push({
    name: "BENEFIT_VISUALIZATION",
    status: statusFromScore(input.benefitVisualization.score, PERSUASION_THRESHOLDS.BENEFIT_VISUALIZATION),
    score: input.benefitVisualization.score,
    threshold: PERSUASION_THRESHOLDS.BENEFIT_VISUALIZATION,
    severity: "BLOCKING",
    reasons: input.benefitVisualization.reasons,
    affectedScenes: [],
  });

  checks.push({
    name: "PURCHASE_MOTIVATION",
    status: statusFromScore(input.purchaseMotivation.score, PERSUASION_THRESHOLDS.PURCHASE_MOTIVATION),
    score: input.purchaseMotivation.score,
    threshold: PERSUASION_THRESHOLDS.PURCHASE_MOTIVATION,
    severity: "CRITICAL",
    reasons: input.purchaseMotivation.reasons,
    affectedScenes: [],
  });

  checks.push({
    name: "EMOTIONAL_PROGRESSION",
    status: statusFromScore(input.emotionalProgression.score, PERSUASION_THRESHOLDS.EMOTIONAL_PROGRESSION),
    score: input.emotionalProgression.score,
    threshold: PERSUASION_THRESHOLDS.EMOTIONAL_PROGRESSION,
    severity: "BLOCKING",
    reasons: input.emotionalProgression.reasons,
    affectedScenes: [],
  });

  checks.push({
    name: "PERSUASION_REDUNDANCY",
    status: statusFromScore(input.redundancy.score, PERSUASION_THRESHOLDS.PERSUASION_REDUNDANCY),
    score: input.redundancy.score,
    threshold: PERSUASION_THRESHOLDS.PERSUASION_REDUNDANCY,
    severity: "BLOCKING",
    reasons: input.redundancy.reasons,
    affectedScenes: input.redundancy.redundantPairs.flatMap((p) => [p.sceneA, p.sceneB]),
  });

  // So bloqueia quando personagem foi de fato usado (item 14 do pedido -
  // nao obriga personagem em toda campanha).
  checks.push({
    name: "CHARACTER_INTEGRATION",
    status: input.characterUsedInStoryboard ? statusFromScore(input.characterIntegration.score, PERSUASION_THRESHOLDS.CHARACTER_INTEGRATION) : "PASS",
    score: input.characterUsedInStoryboard ? input.characterIntegration.score : null,
    threshold: input.characterUsedInStoryboard ? PERSUASION_THRESHOLDS.CHARACTER_INTEGRATION : null,
    severity: "BLOCKING",
    reasons: input.characterIntegration.reasons,
    affectedScenes: input.characterIntegration.disconnected ? input.characterIntegration.appearsInScenes : [],
  });

  const fakeUrgency = detectFakeUrgency(input.motivationAnswers);
  checks.push({
    name: "FAKE_URGENCY",
    status: fakeUrgency.detected ? "FAIL" : "PASS",
    score: null,
    threshold: null,
    severity: "CRITICAL",
    reasons: [fakeUrgency.reason],
    affectedScenes: [],
  });

  checks.push({
    name: "GENERIC_AI_AD_RISK",
    status: input.genericAdRisk.riskLevel === "HIGH" ? "FAIL" : input.genericAdRisk.riskLevel === "MEDIUM" ? "PASS_WITH_OBSERVATIONS" : "PASS",
    score: null,
    threshold: null,
    severity: "CRITICAL",
    reasons: input.genericAdRisk.reasons,
    affectedScenes: Object.values(input.genericAdRisk.affectedScenes).flat(),
  });

  const blockingReasons: string[] = [];
  const observations: string[] = [];
  for (const check of checks) {
    if (check.status === "FAIL") blockingReasons.push(`${check.name}: ${check.reasons.join(" ") || "abaixo do threshold."}`);
    if (check.status === "PASS_WITH_OBSERVATIONS") observations.push(`${check.name}: ${check.reasons.join(" ") || "proximo do threshold."}`);
  }

  const status: CommercialPersuasionQualityGateResult["status"] = checks.some((c) => c.status === "FAIL") ? "FAIL" : checks.some((c) => c.status === "PASS_WITH_OBSERVATIONS") ? "PASS_WITH_OBSERVATIONS" : "PASS";

  return { status, checks, blockingReasons, observations };
}
