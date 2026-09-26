// Radar Creative AI - Product Intelligence Grounding V1 - Contamination Score
//
// PURO - pesos DOCUMENTADOS e FIXADOS aqui, ANTES de rodar qualquer DRY_RUN
// contra dados reais (item 20 do pedido - nunca ajustar depois de ver o
// resultado). 0 = totalmente consistente, 100 = severamente contaminado.

import type { GroundedClaim, ProductCategoryGroundingResult, ProductIntelligenceContaminationResult, ProductIntelligenceFieldName } from "@/lib/product-intelligence-grounding/types";

// Pesos maximos por dimensao (somam 100). Fixados antes de ver o resultado
// real da campanha Kokeshi.
const MAX_CATEGORY_MISMATCH_POINTS = 30;
const MAX_CLAIM_MISMATCH_POINTS = 40;
const MAX_USAGE_CONTEXT_MISMATCH_POINTS = 10;
const MAX_BENEFIT_MISMATCH_POINTS = 10;
// audienceMismatch nao tem peso reservado aqui - product_intelligence.
// target_audience nao e selecionado pela query usada por esta camada
// (ver comentario no corpo da funcao), entao nunca ha o que pesar.
const MAX_ENVIRONMENT_MISMATCH_POINTS = 10;
// Nota: os maximos somam 110, nao 100 - intencional (nenhuma campanha real
// aciona todas as dimensoes ao mesmo tempo com peso maximo simultaneamente
// sem ja ser um caso extremo; o total final e sempre clampado em 100).

const BENEFIT_FIELDS: ProductIntelligenceFieldName[] = ["keyBenefits", "emotionalBenefits", "functionalBenefits"];

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreProductIntelligenceContamination(categoryGrounding: ProductCategoryGroundingResult, claims: GroundedClaim[]): ProductIntelligenceContaminationResult {
  const reasons: string[] = [];
  const affectedFieldsSet = new Set<ProductIntelligenceFieldName>();

  const categoryMismatchPoints =
    categoryGrounding.status === "CONTRADICTED" ? MAX_CATEGORY_MISMATCH_POINTS : categoryGrounding.status === "AMBIGUOUS" ? 10 : 0;
  if (categoryMismatchPoints > 0) reasons.push(`Category grounding = ${categoryGrounding.status}: ${categoryGrounding.reason}`);

  const contaminatedClaims = claims.filter((c) => c.groundingStatus === "CONTAMINATED");
  const contradictedClaims = claims.filter((c) => c.groundingStatus === "CONTRADICTED");
  for (const c of [...contaminatedClaims, ...contradictedClaims]) affectedFieldsSet.add(c.field);

  const claimMismatchPoints = claims.length > 0 ? clamp((contaminatedClaims.length / claims.length) * MAX_CLAIM_MISMATCH_POINTS) : 0;
  if (claimMismatchPoints > 0) reasons.push(`${contaminatedClaims.length}/${claims.length} claim(s) classificadas como CONTAMINATED (linguagem de outro dominio de produto).`);

  // Usage context / environment: com o schema atual, o unico sinal
  // disponivel para ambos e a propria category grounding (ver
  // environment-contamination-trace.ts - visualStyle deriva diretamente de
  // product_intelligence.category, nunca de um campo separado de "contexto
  // de uso"). Documentado como limitacao, nao inventado.
  const usageContextMismatchPoints = categoryGrounding.status === "CONTRADICTED" ? MAX_USAGE_CONTEXT_MISMATCH_POINTS : 0;
  if (usageContextMismatchPoints > 0) reasons.push("Contexto de uso provavelmente incorreto - mesma raiz da category grounding (schema atual nao separa 'contexto de uso' de 'categoria').");

  const benefitClaims = claims.filter((c) => BENEFIT_FIELDS.includes(c.field));
  const contaminatedBenefitClaims = benefitClaims.filter((c) => c.groundingStatus === "CONTAMINATED");
  const benefitMismatchPoints = benefitClaims.length > 0 ? clamp((contaminatedBenefitClaims.length / benefitClaims.length) * MAX_BENEFIT_MISMATCH_POINTS) : 0;
  if (benefitMismatchPoints > 0) reasons.push(`${contaminatedBenefitClaims.length}/${benefitClaims.length} beneficio(s) (key/emotional/functional) contaminado(s).`);

  // Audience: product_intelligence.target_audience nao e selecionado pela
  // query usada por este DRY_RUN (mesmas colunas de
  // scripts/lib/creative-director-v2-fixture.js#PRODUCT_INTELLIGENCE_COLUMNS)
  // - nunca avaliado, nunca 0 por suposicao de que esta OK.
  const audienceMismatchPoints = 0;
  reasons.push("audienceMismatch nao avaliado nesta versao - target_audience nao faz parte das colunas de product_intelligence lidas por esta camada.");

  const environmentMismatchPoints = categoryGrounding.status === "CONTRADICTED" ? MAX_ENVIRONMENT_MISMATCH_POINTS : 0;
  if (environmentMismatchPoints > 0) reasons.push("Ambiente/visualStyle downstream provavelmente incorreto - ver environment-contamination-trace.ts para a cadeia code-provada.");

  const score = clamp(
    categoryMismatchPoints + claimMismatchPoints + usageContextMismatchPoints + benefitMismatchPoints + audienceMismatchPoints + environmentMismatchPoints,
  );

  return {
    score,
    categoryMismatchPoints,
    claimMismatchPoints,
    usageContextMismatchPoints,
    benefitMismatchPoints,
    audienceMismatchPoints,
    environmentMismatchPoints,
    reasons,
    affectedFields: Array.from(affectedFieldsSet),
  };
}
