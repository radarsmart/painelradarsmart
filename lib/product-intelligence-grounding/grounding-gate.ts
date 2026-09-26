// Radar Creative AI - Product Intelligence Grounding V1 - Grounding Gate
//
// PURO - agrega os 9 checks pedidos (item 16) num veredito PASS/
// PASS_WITH_OBSERVATIONS/FAIL. Thresholds fixados aqui, ANTES de rodar
// qualquer DRY_RUN real - nunca ajustados depois pra forcar um resultado
// (mesma regra ja seguida pelo Commercial Persuasion Quality Gate).

import type { GroundedProductIntelligence, GroundingCheckName, GroundingCheckResult, GroundingCheckStatus, ProductIntelligenceGroundingGateResult } from "@/lib/product-intelligence-grounding/types";

const CLAIM_GROUNDING_FAIL_RATIO = 0.3;
const CONTAMINATION_FAIL_SCORE = 50;
const CONTAMINATION_OBSERVATION_SCORE = 20;
const BENEFIT_GROUNDING_FAIL_POINTS = 7; // de um maximo de 10 (ver contamination-score.ts)
const DOMAIN_CONSISTENCY_SYSTEMIC_RATIO = 0.6;

function worstStatus(statuses: GroundingCheckStatus[]): GroundingCheckStatus {
  if (statuses.includes("FAIL")) return "FAIL";
  if (statuses.includes("PASS_WITH_OBSERVATIONS")) return "PASS_WITH_OBSERVATIONS";
  return "PASS";
}

export function buildProductIntelligenceGroundingGate(grounded: GroundedProductIntelligence): ProductIntelligenceGroundingGateResult {
  const checks: GroundingCheckResult[] = [];

  // 1. PRODUCT_IDENTITY
  checks.push({
    name: "PRODUCT_IDENTITY",
    status: grounded.identity.confidence === "UNKNOWN" ? "FAIL" : grounded.identity.confidence === "LOW" ? "PASS_WITH_OBSERVATIONS" : "PASS",
    reasons:
      grounded.identity.confidence === "UNKNOWN"
        ? ["Impossivel determinar a identidade real do produto a partir de TIER1/TIER2 - nenhuma validacao downstream e confiavel sem isso."]
        : [`Identidade real detectada com confidence=${grounded.identity.confidence} (clusters: ${grounded.identity.identityClusters.join(", ") || "nenhum"}).`],
  });

  // 2. CATEGORY_GROUNDING
  checks.push({
    name: "CATEGORY_GROUNDING",
    status: grounded.categoryGrounding.status === "CONTRADICTED" ? "FAIL" : grounded.categoryGrounding.status === "AMBIGUOUS" ? "PASS_WITH_OBSERVATIONS" : "PASS",
    reasons: [grounded.categoryGrounding.reason],
  });

  // 3. CLAIM_GROUNDING
  const contaminatedRatio = grounded.allClaims.length > 0 ? grounded.quarantinedClaims.length / grounded.allClaims.length : 0;
  checks.push({
    name: "CLAIM_GROUNDING",
    status: contaminatedRatio > CLAIM_GROUNDING_FAIL_RATIO ? "FAIL" : contaminatedRatio > 0 ? "PASS_WITH_OBSERVATIONS" : "PASS",
    reasons: [`${grounded.quarantinedClaims.length}/${grounded.allClaims.length} claim(s) em quarentena (CONTAMINATED/CONTRADICTED) - ratio=${(contaminatedRatio * 100).toFixed(0)}%.`],
  });

  // 4. DOMAIN_CONSISTENCY - contaminacao sistemica (um unico dominio errado
  // dominando) e um sinal mais grave que ruido espalhado entre varios
  // dominios (provavelmente o registro inteiro pertence a outro produto).
  const clusterCounts = new Map<string, number>();
  for (const c of grounded.quarantinedClaims) {
    for (const cluster of c.claimClusters) clusterCounts.set(cluster, (clusterCounts.get(cluster) ?? 0) + 1);
  }
  const dominantClusterCount = clusterCounts.size > 0 ? Math.max(...clusterCounts.values()) : 0;
  const systemicRatio = grounded.quarantinedClaims.length > 0 ? dominantClusterCount / grounded.quarantinedClaims.length : 0;
  // Exige pelo menos 2 claims em quarentena antes de falar em "sistemico" -
  // com 1 unica claim isolada, o ratio e sempre 100% por construcao, o que
  // rotularia incorretamente ruido isolado como um padrao sistemico.
  const isSystemic = grounded.quarantinedClaims.length >= 2 && systemicRatio >= DOMAIN_CONSISTENCY_SYSTEMIC_RATIO;
  checks.push({
    name: "DOMAIN_CONSISTENCY",
    status: isSystemic ? "FAIL" : grounded.quarantinedClaims.length > 0 ? "PASS_WITH_OBSERVATIONS" : "PASS",
    reasons: isSystemic
      ? [`Contaminacao SISTEMICA: ${(systemicRatio * 100).toFixed(0)}% das claims em quarentena vem de um unico dominio errado - forte indicio de que o registro inteiro de product_intelligence pertence a outro produto (nao ruido isolado).`]
      : grounded.quarantinedClaims.length > 0
        ? ["Contaminacao presente, mas espalhada entre dominios sem um padrao sistemico dominante."]
        : ["Nenhuma contaminacao de claims detectada."],
  });

  // 5. BENEFIT_GROUNDING
  checks.push({
    name: "BENEFIT_GROUNDING",
    status: grounded.contamination.benefitMismatchPoints >= BENEFIT_GROUNDING_FAIL_POINTS ? "FAIL" : grounded.contamination.benefitMismatchPoints > 0 ? "PASS_WITH_OBSERVATIONS" : "PASS",
    reasons: [`benefitMismatchPoints=${grounded.contamination.benefitMismatchPoints} (max 10).`],
  });

  // 6. USAGE_CONTEXT
  checks.push({
    name: "USAGE_CONTEXT",
    status: grounded.contamination.usageContextMismatchPoints > 0 ? "FAIL" : "PASS",
    reasons: [
      grounded.contamination.usageContextMismatchPoints > 0
        ? "Contexto de uso provavelmente incorreto - mesma raiz da category grounding (ver contamination-score.ts)."
        : "Nenhum sinal de contexto de uso incorreto.",
    ],
  });

  // 7. AUDIENCE_CONSISTENCY - nunca PASS/FAIL sem dado real disponivel.
  checks.push({
    name: "AUDIENCE_CONSISTENCY",
    status: "PASS_WITH_OBSERVATIONS",
    reasons: ["Nao avaliado nesta versao - target_audience nao faz parte das colunas de product_intelligence lidas por esta camada (ver contamination-score.ts)."],
  });

  // 8. CONTAMINATION (score agregado)
  checks.push({
    name: "CONTAMINATION",
    status: grounded.contamination.score >= CONTAMINATION_FAIL_SCORE ? "FAIL" : grounded.contamination.score >= CONTAMINATION_OBSERVATION_SCORE ? "PASS_WITH_OBSERVATIONS" : "PASS",
    reasons: [`contaminationScore=${grounded.contamination.score}/100.`],
  });

  // 9. DOWNSTREAM_SAFETY - agrega os checks mais criticos (nunca calculado
  // isoladamente - reflete se e seguro deixar este Product Intelligence
  // alimentar o Desire Engine/Creative Director).
  const criticalCheckNames: GroundingCheckName[] = ["CATEGORY_GROUNDING", "CLAIM_GROUNDING", "CONTAMINATION", "DOMAIN_CONSISTENCY"];
  const criticalChecks = checks.filter((c) => criticalCheckNames.includes(c.name));
  const downstreamSafetyStatus = worstStatus(criticalChecks.map((c) => c.status));
  checks.push({
    name: "DOWNSTREAM_SAFETY",
    status: downstreamSafetyStatus,
    reasons:
      downstreamSafetyStatus === "FAIL"
        ? [`Checks criticos reprovados: ${criticalChecks.filter((c) => c.status === "FAIL").map((c) => c.name).join(", ")} - NAO seguro alimentar o Desire Engine/Creative Director com este Product Intelligence sem passar pela camada de grounding.`]
        : ["Nenhum check critico reprovado."],
  });

  const status = worstStatus(checks.map((c) => c.status));
  const blockingReasons = checks.filter((c) => c.status === "FAIL").flatMap((c) => c.reasons.map((r) => `${c.name}: ${r}`));
  const observations = checks.filter((c) => c.status === "PASS_WITH_OBSERVATIONS").flatMap((c) => c.reasons.map((r) => `${c.name}: ${r}`));

  return {
    status,
    checks,
    downstreamReady: status !== "FAIL",
    blockingReasons,
    observations,
  };
}
