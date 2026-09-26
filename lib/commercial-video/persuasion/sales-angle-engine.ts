// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Sales Angle Engine
//
// PURO e deterministico - gera candidatos de SalesAngle, pontua cada um a
// partir de PersuasionEvidence/ProductDesireProfile REAIS (nunca por
// "potencial cinematografico") e seleciona o vencedor. Angulos que
// exigiriam evidencia que nao existe (BEFORE_AFTER_CONCEPT/SOCIAL_PROOF
// sem rating/reviews reais, por exemplo) ficam eligible=false - nunca
// escolhidos, mesmo que pontuassem alto em outros eixos.

import type { PersuasionEvidence, ProductDesireProfile, SalesAngle, SalesAngleCandidate } from "@/lib/commercial-video/persuasion/types";

const ALL_ANGLES: SalesAngle[] = [
  "PRICE_DISCOVERY",
  "PROBLEM_SOLUTION",
  "DESIRE_TRANSFORMATION",
  "PRODUCT_DISCOVERY",
  "VALUE_FOR_MONEY",
  "PREMIUM_FOR_LESS",
  "ROUTINE_UPGRADE",
  "CONVENIENCE",
  "DEMONSTRATION",
  "SOCIAL_PROOF",
  "INGREDIENT_STORY",
  "BEFORE_AFTER_CONCEPT",
  "GIFTABILITY",
  "LIFESTYLE_ASPIRATION",
  "SURPRISING_FIND",
  "CATEGORY_COMPARISON",
];

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function evaluateAngle(angle: SalesAngle, evidence: PersuasionEvidence, desireProfile: ProductDesireProfile): SalesAngleCandidate {
  const reasons: string[] = [];
  let relevanceScore = 40;
  let evidenceStrength = 40;
  let emotionalPotential = 40;
  let visualPotential = 40;
  let offerCompatibility = 40;
  let productCompatibility = 40;
  let hallucinationRisk: SalesAngleCandidate["hallucinationRisk"] = "LOW";
  let genericAdRisk: SalesAngleCandidate["genericAdRisk"] = "MEDIUM";
  let eligible = true;

  const hasCheapPrice = evidence.price !== null && evidence.price < 30;
  const hasRealDiscount = Boolean(evidence.discountPercent && evidence.discountPercent > 0);
  const hasPackagingEvidence = evidence.packagingClaims.length > 0;
  const hasSocialProof = evidence.offerClaims.some((c) => c.id === "offer-social-proof" && c.status === "OFFER_SUPPORTED");
  const hasConsumerProblem = desireProfile.consumerProblem !== null;

  switch (angle) {
    case "PRICE_DISCOVERY":
      relevanceScore = hasCheapPrice ? 90 : 40;
      evidenceStrength = evidence.price !== null ? 95 : 20;
      emotionalPotential = 70;
      visualPotential = 65;
      offerCompatibility = 95;
      productCompatibility = 60;
      reasons.push(hasCheapPrice ? "Preco real baixo (< R$30) sustenta curiosidade de preco." : "Preco nao especialmente baixo - angulo perde forca.");
      break;
    case "PROBLEM_SOLUTION":
      relevanceScore = hasConsumerProblem ? 85 : 20;
      evidenceStrength = hasConsumerProblem ? 70 : 10;
      eligible = hasConsumerProblem;
      reasons.push(hasConsumerProblem ? "Existe consumerProblem real mapeado." : "Sem consumerProblem confiavel (categoria com mismatch ou sem dado) - angulo nao elegivel.");
      break;
    case "DESIRE_TRANSFORMATION":
      relevanceScore = 55;
      evidenceStrength = 30;
      hallucinationRisk = "MEDIUM";
      reasons.push("Transformacao generica sem evidencia de resultado especifico - risco medio de overclaim se mal executado.");
      break;
    case "PRODUCT_DISCOVERY":
      relevanceScore = 70;
      evidenceStrength = 80;
      visualPotential = 75;
      offerCompatibility = 60;
      reasons.push("Sempre elegivel - descobrir o produto real nunca depende de claim nao verificada.");
      break;
    case "VALUE_FOR_MONEY":
      relevanceScore = hasCheapPrice ? 85 : 50;
      evidenceStrength = 85;
      offerCompatibility = 90;
      reasons.push("Preco real sustenta valor pelo dinheiro.");
      break;
    case "PREMIUM_FOR_LESS":
      relevanceScore = hasRealDiscount ? 80 : hasCheapPrice ? 60 : 30;
      evidenceStrength = hasRealDiscount ? 90 : 40;
      hallucinationRisk = hasRealDiscount ? "LOW" : "MEDIUM";
      reasons.push(
        hasRealDiscount
          ? `Desconto real de ${evidence.discountPercent}% sustenta 'menos pelo mesmo produto' sem inventar qualidade premium.`
          : "Sem desconto real - exigiria alegacao implicita de 'qualidade premium' sem evidencia direta, usar com cautela.",
      );
      break;
    case "ROUTINE_UPGRADE":
      relevanceScore = 65;
      evidenceStrength = hasPackagingEvidence ? 65 : 35;
      reasons.push("Compativel com categorias de uso recorrente (beleza/cuidado pessoal).");
      break;
    case "CONVENIENCE":
      relevanceScore = 55;
      evidenceStrength = hasPackagingEvidence ? 55 : 25;
      reasons.push("So forte se embalagem/uso real sustentar praticidade.");
      break;
    case "DEMONSTRATION":
      relevanceScore = hasPackagingEvidence ? 90 : 30;
      evidenceStrength = hasPackagingEvidence ? 90 : 20;
      visualPotential = 90;
      productCompatibility = 90;
      eligible = hasPackagingEvidence;
      reasons.push(hasPackagingEvidence ? "Claims de embalagem reais (textura/aplicacao) sustentam demonstracao visual." : "Sem claim de embalagem/uso real - demonstracao ficaria generica.");
      break;
    case "SOCIAL_PROOF":
      relevanceScore = hasSocialProof ? 80 : 10;
      evidenceStrength = hasSocialProof ? 90 : 0;
      eligible = hasSocialProof;
      hallucinationRisk = hasSocialProof ? "LOW" : "HIGH";
      reasons.push(hasSocialProof ? "rating/reviewsCount reais disponiveis." : "Sem rating/reviewsCount reais - NUNCA elegivel (inventaria prova social).");
      break;
    case "INGREDIENT_STORY":
      relevanceScore = hasPackagingEvidence ? 75 : 20;
      evidenceStrength = hasPackagingEvidence ? 80 : 10;
      eligible = hasPackagingEvidence;
      visualPotential = 70;
      reasons.push(hasPackagingEvidence ? "Ingrediente real visivel na embalagem (ex: oleo de copaiba) sustenta a historia." : "Sem ingrediente real confirmado.");
      break;
    case "BEFORE_AFTER_CONCEPT":
      relevanceScore = 20;
      evidenceStrength = 0;
      eligible = false;
      hallucinationRisk = "HIGH";
      reasons.push("Exigiria alegacao de resultado antes/depois sem evidencia real - NUNCA elegivel sem dado de resultado verificado.");
      break;
    case "GIFTABILITY":
      relevanceScore = 30;
      evidenceStrength = 20;
      reasons.push("Sem sinal real de posicionamento como presente.");
      break;
    case "LIFESTYLE_ASPIRATION":
      relevanceScore = 35;
      evidenceStrength = 25;
      genericAdRisk = "HIGH";
      reasons.push("Alto risco de virar 'produto flutuando em cenario aspiracional generico' sem contexto de uso real - exatamente o padrao ja observado como fraco.");
      break;
    case "SURPRISING_FIND":
      relevanceScore = hasCheapPrice ? 80 : 45;
      evidenceStrength = 60;
      emotionalPotential = 75;
      reasons.push(hasCheapPrice ? "Preco baixo real sustenta framing de 'achado surpreendente'." : "Framing de achado surpreendente menos forte sem preco baixo real.");
      break;
    case "CATEGORY_COMPARISON":
      relevanceScore = 25;
      evidenceStrength = 15;
      eligible = false;
      hallucinationRisk = "HIGH";
      reasons.push("Comparar com concorrentes exigiria dado real de mercado nao disponivel - nao elegivel.");
      break;
    default:
      break;
  }

  const totalScore = eligible
    ? clamp(
        relevanceScore * 0.25 +
          evidenceStrength * 0.25 +
          emotionalPotential * 0.15 +
          visualPotential * 0.15 +
          offerCompatibility * 0.1 +
          productCompatibility * 0.1 -
          (hallucinationRisk === "HIGH" ? 30 : hallucinationRisk === "MEDIUM" ? 10 : 0) -
          (genericAdRisk === "HIGH" ? 15 : genericAdRisk === "MEDIUM" ? 5 : 0),
      )
    : 0;

  return {
    angle,
    relevanceScore: clamp(relevanceScore),
    evidenceStrength: clamp(evidenceStrength),
    emotionalPotential: clamp(emotionalPotential),
    visualPotential: clamp(visualPotential),
    offerCompatibility: clamp(offerCompatibility),
    productCompatibility: clamp(productCompatibility),
    hallucinationRisk,
    genericAdRisk,
    totalScore,
    reasons,
    eligible,
  };
}

export function generateSalesAngleCandidates(evidence: PersuasionEvidence, desireProfile: ProductDesireProfile): SalesAngleCandidate[] {
  return ALL_ANGLES.map((angle) => evaluateAngle(angle, evidence, desireProfile)).sort((a, b) => b.totalScore - a.totalScore);
}

/**
 * Deterministico: maior totalScore entre os eligible=true. Nunca escolhe
 * um angulo nao elegivel mesmo que tenha pontuacao teoricamente alta (a
 * pontuacao de um angulo nao elegivel ja e forcada a 0 acima, mas o filtro
 * explicito aqui documenta a regra em vez de depender so do numero).
 */
export function selectWinningSalesAngle(candidates: SalesAngleCandidate[]): SalesAngleCandidate {
  const eligible = candidates.filter((c) => c.eligible);
  if (eligible.length === 0) {
    throw new Error("Nenhum SalesAngle elegivel - impossivel selecionar vencedor sem inventar evidencia.");
  }
  return [...eligible].sort((a, b) => b.totalScore - a.totalScore)[0];
}
