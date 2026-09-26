// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Product Desire Profile
//
// PURO - constroi o ProductDesireProfile SO a partir de PersuasionEvidence
// ja gerada (claim-grounding.ts) - nunca inventa desejo/beneficio que nao
// tenha uma claim FACTUAL/PACKAGING_SUPPORTED/OFFER_SUPPORTED por tras.
// Quando a categoria esta com mismatch (ver categoryMismatch), os desejos
// caem para inferencia generica e SEGURA por categoria corrigida (nunca
// reusa pain_points/desires do registro errado).

import type { ClaimConfidence, DesireDriver, PersuasionClaim, PersuasionEvidence, ProductDesireProfile } from "@/lib/commercial-video/persuasion/types";

// Inferencia SEGURA por categoria REAL (corrigida, nunca a declarada
// quando ha mismatch) - generica, nunca especifica de um produto. So
// cobre "beleza" (a categoria correta desta fixture) e um fallback
// generico - adicionar categoria nova aqui deve vir com evidencia real,
// nunca suposicao.
const SAFE_CATEGORY_GOAL: Record<string, string> = {
  beleza: "cuidado pessoal/rotina de beleza acessivel",
  suplementos: "performance fisica/rotina de treino",
  geral: "resolver uma necessidade cotidiana com praticidade",
};

function driver(text: string, confidence: ClaimConfidence, source: DesireDriver["source"]): DesireDriver {
  return { text, confidence, source };
}

function claimToDriver(c: PersuasionClaim): DesireDriver {
  return { text: c.text, confidence: c.confidence, source: c.source };
}

/**
 * Categoria EFETIVA usada para inferencia - nunca a categoria declarada
 * quando categoryMismatch.detected=true (ver claim-grounding.ts). Sem essa
 * correcao, qualquer inferencia por categoria repetiria o mesmo erro que
 * causou o problema original (ambiente/beneficio de academia para um
 * creme facial).
 */
export function resolveEffectiveCategory(evidence: PersuasionEvidence): string {
  if (evidence.categoryMismatch.detected) {
    // Sinal de titulo (facial/creme/gel/pele) ja aponta pra "beleza" -
    // unica correcao aplicada, documentada, nunca silenciosa.
    return "beleza";
  }
  return evidence.category;
}

export function buildProductDesireProfile(evidence: PersuasionEvidence): ProductDesireProfile {
  const effectiveCategory = resolveEffectiveCategory(evidence);
  const likelyConsumerGoal = SAFE_CATEGORY_GOAL[effectiveCategory] ?? SAFE_CATEGORY_GOAL.geral;

  // packagingClaims sao a fonte MAIS confiavel para desejo primario quando
  // ha mismatch de categoria (evidence.unknownClaims/forbiddenClaims nunca
  // usadas aqui) - ex: "Textura leve, rapida absorcao" observado
  // diretamente na embalagem real.
  const usablePackaging = evidence.packagingClaims;
  const primaryDesireSource = usablePackaging[0] ?? evidence.factualClaims[0];
  const primaryDesire: DesireDriver = primaryDesireSource
    ? claimToDriver(primaryDesireSource)
    : driver(likelyConsumerGoal, "LOW", "CATEGORY_INFERENCE");

  const secondaryDesires: DesireDriver[] = usablePackaging.slice(1).map(claimToDriver);
  if (secondaryDesires.length === 0 && !evidence.categoryMismatch.detected) {
    secondaryDesires.push(...evidence.unknownClaims.slice(0, 2).map(claimToDriver));
  }

  // consumerProblem: sem product_intelligence.pain_points confiavel (caso
  // de mismatch), nunca inventamos um problema especifico - fica null
  // (honesto) em vez de reusar "falta de energia no treino" pra um creme
  // facial.
  const consumerProblem = evidence.categoryMismatch.detected
    ? null
    : evidence.inferredClaims.find((c) => c.id.startsWith("pi-pain"))
      ? claimToDriver(evidence.inferredClaims.find((c) => c.id.startsWith("pi-pain"))!)
      : null;

  const priceDriver = evidence.factualClaims.find((c) => c.id === "fact-price");
  const purchaseMotivation: DesireDriver = priceDriver
    ? driver(`Preco de entrada baixo (${priceDriver.text}) reduz risco percebido de experimentar.`, "MEDIUM", "OFFER")
    : driver("Motivacao de compra nao determinada por falta de dado de preco.", "LOW", "CATEGORY_INFERENCE");

  const objections: DesireDriver[] = evidence.categoryMismatch.detected
    ? [driver("Sem objecoes reais mapeadas para este produto (product_intelligence.objections descreve outra categoria).", "LOW", "CATEGORY_INFERENCE")]
    : evidence.inferredClaims.filter((c) => c.id.startsWith("pi-objection")).map(claimToDriver);

  const trustNeeds: string[] = [];
  if (evidence.rating === null || evidence.reviewsCount === null || (evidence.reviewsCount ?? 0) === 0) {
    trustNeeds.push("Sem rating/reviews reais - fidelidade de embalagem/marca real precisa carregar a confianca sozinha (nunca inventar prova social).");
  }

  const demonstrationOpportunities = usablePackaging.map((c) => c.text);

  const impulsePurchasePotential: ProductDesireProfile["impulsePurchasePotential"] =
    evidence.price !== null && evidence.price < 30 ? "HIGH" : evidence.price !== null && evidence.price < 100 ? "MEDIUM" : "LOW";

  const priceSensitivity: ProductDesireProfile["priceSensitivity"] = evidence.price !== null && evidence.price < 30 ? "HIGH" : "MEDIUM";

  return {
    productCategory: effectiveCategory,
    purchaseType: impulsePurchasePotential === "HIGH" ? "IMPULSE" : "CONSIDERED",
    likelyConsumerGoal,
    primaryDesire,
    secondaryDesires,
    consumerProblem,
    consumerTension: consumerProblem ? consumerProblem.text : null,
    purchaseMotivation,
    emotionalDrivers: usablePackaging.length > 0 ? [driver("confianca na rotina de cuidado - embalagem real, sem promessa de resultado especifico", "MEDIUM", "PACKAGING")] : [],
    rationalDrivers: priceDriver ? [claimToDriver(priceDriver)] : [],
    visualDesireDrivers: usablePackaging.map((c) => c.text),
    objections,
    trustNeeds,
    demonstrationOpportunities,
    offerLeverage: evidence.discountPercent && evidence.discountPercent > 0 ? `Desconto real de ${evidence.discountPercent}%` : "Preco baixo em si (sem desconto real a comunicar - discount_pct=0)",
    impulsePurchasePotential,
    priceSensitivity,
    noveltyPotential: "MEDIUM",
  };
}
