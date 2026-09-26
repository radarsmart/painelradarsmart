// Radar Creative AI - Product Intelligence Grounding V1 - Claim Domain Grounding
//
// PURO - classifica CADA claim de product_intelligence individualmente
// (item 5 do pedido). Evita regra fragil baseada em uma unica palavra
// isolada: usa os clusters de dominio (varias palavras por cluster) e so
// marca CONTAMINATED quando a claim tem sinal de dominio CLARO e esse
// dominio e disjunto da identidade real do produto.

import { clustersWithHits, detectClustersInText } from "@/lib/product-intelligence-grounding/domain-clusters";
import type { DomainClusterId, GroundedClaim, ProductIdentityProfile, ProductIntelligenceFieldName, RawProductIntelligenceInput } from "@/lib/product-intelligence-grounding/types";

const DISCOUNT_LANGUAGE_KEYWORDS = ["desconto", "promocao", "promoção", "oferta relampago", "% off"];

// Pares de dominio GENUINAMENTE compativeis, mesmo sem overlap direto de
// cluster (item E do pedido - "produto genuinamente hibrido - nao gerar
// falso positivo automaticamente"). Exemplo real comum: suplemento
// INGERIVEL de colageno que reivindica beneficio de pele/cabelo - isso NAO
// e contaminacao, e a proposta de venda legitima da categoria.
//
// DIRECIONAL, nunca simetrico: um suplemento ingerivel PODE legitimamente
// reivindicar beneficio de pele/cabelo (a claim usa linguagem
// SKINCARE/HAIRCARE, mas a identidade real e FOOD_SUPPLEMENT - compativel).
// O INVERSO nao e valido - um produto TOPICO (identidade SKINCARE/HAIRCARE)
// descrito com linguagem de INGESTAO ("consumo diario", "dose diaria") e
// justamente o padrao real observado no bug do Kokeshi ("praticidade no
// consumo diario" para um creme facial, que nunca e "consumido") - isso
// continua CONTAMINATED. Lista pequena e generica (nunca especifica de um
// produto), documentada ANTES de rodar qualquer DRY_RUN real.
const COMPATIBLE_CLUSTER_DIRECTIONS: Array<{ identity: DomainClusterId; claim: DomainClusterId }> = [
  { identity: "FOOD_SUPPLEMENT", claim: "SKINCARE" },
  { identity: "FOOD_SUPPLEMENT", claim: "HAIRCARE" },
];

function isClaimClusterCompatibleWithIdentity(claimCluster: DomainClusterId, identityCluster: DomainClusterId): boolean {
  return COMPATIBLE_CLUSTER_DIRECTIONS.some((d) => d.identity === identityCluster && d.claim === claimCluster);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function classifyClaim(id: string, field: ProductIntelligenceFieldName, text: string, identity: ProductIdentityProfile): GroundedClaim {
  const hits = detectClustersInText(text, (c) => c.domainLanguageKeywords);
  const claimClusters = clustersWithHits(hits);
  const matchedKeywords = claimClusters.flatMap((c) => hits[c]);

  // Contradicao factual direta (TIER1 real vs texto da claim) - regra
  // estreita, nao um "pega tudo": so dispara quando a claim afirma
  // linguagem de desconto/promocao e a oferta real nao tem desconto.
  const normalizedText = normalize(text);
  const claimsDiscount = DISCOUNT_LANGUAGE_KEYWORDS.some((kw) => normalizedText.includes(normalize(kw)));
  if (claimsDiscount && (identity.discountPercent === null || identity.discountPercent === 0)) {
    return {
      id,
      field,
      originalText: text,
      source: "PRODUCT_INTELLIGENCE",
      groundingStatus: "CONTRADICTED",
      claimClusters,
      evidence: [`offers.discountPct=${identity.discountPercent ?? "null"} - claim menciona desconto/promocao que nao existe realmente.`],
      confidence: "HIGH",
      contaminationSignals: [],
    };
  }

  if (identity.confidence === "UNKNOWN") {
    return {
      id,
      field,
      originalText: text,
      source: "PRODUCT_INTELLIGENCE",
      groundingStatus: "UNSUPPORTED",
      claimClusters,
      evidence: ["Identidade do produto e UNKNOWN (sem TIER1/TIER2 suficiente) - impossivel confirmar ou contradizer esta claim."],
      confidence: "LOW",
      contaminationSignals: [],
    };
  }

  if (claimClusters.length === 0) {
    return {
      id,
      field,
      originalText: text,
      source: "PRODUCT_INTELLIGENCE",
      groundingStatus: "PLAUSIBLE",
      claimClusters: [],
      evidence: ["Claim sem sinal de dominio especifico (linguagem generica) - nao contradiz a identidade real do produto."],
      confidence: "MEDIUM",
      contaminationSignals: [],
    };
  }

  const overlapsIdentity = claimClusters.some((c) => identity.identityClusters.includes(c));
  if (overlapsIdentity) {
    return {
      id,
      field,
      originalText: text,
      source: "PRODUCT_INTELLIGENCE",
      groundingStatus: "SUPPORTED",
      claimClusters,
      evidence: [`Dominio da claim (${claimClusters.join(", ")}) coincide com a identidade real do produto (${identity.identityClusters.join(", ")}).`],
      confidence: identity.confidence === "HIGH" ? "HIGH" : "MEDIUM",
      contaminationSignals: [],
    };
  }

  const compatiblePair = claimClusters.some((cc) => identity.identityClusters.some((ic) => isClaimClusterCompatibleWithIdentity(cc, ic)));
  if (compatiblePair) {
    return {
      id,
      field,
      originalText: text,
      source: "PRODUCT_INTELLIGENCE",
      groundingStatus: "PLAUSIBLE",
      claimClusters,
      evidence: [`Dominio da claim (${claimClusters.join(", ")}) e diferente da identidade (${identity.identityClusters.join(", ")}), mas e uma combinacao GENUINAMENTE compativel conhecida (ex: suplemento ingerivel com beneficio de pele/cabelo) - nao tratado como contaminacao.`],
      confidence: "MEDIUM",
      contaminationSignals: [],
    };
  }

  return {
    id,
    field,
    originalText: text,
    source: "PRODUCT_INTELLIGENCE",
    groundingStatus: "CONTAMINATED",
    claimClusters,
    evidence: [`Claim usa linguagem de dominio ${claimClusters.join(", ")} (palavras: ${matchedKeywords.join(", ")}), mas a identidade real do produto e ${identity.identityClusters.join(", ")} - claim provavelmente pertence a outro produto.`],
    confidence: identity.confidence === "HIGH" ? "HIGH" : "MEDIUM",
    contaminationSignals: matchedKeywords,
  };
}

export function groundProductIntelligenceClaims(productIntelligence: RawProductIntelligenceInput, identity: ProductIdentityProfile): GroundedClaim[] {
  const fieldEntries: Array<[ProductIntelligenceFieldName, string[]]> = [
    ["painPoints", productIntelligence.painPoints],
    ["desires", productIntelligence.desires],
    ["objections", productIntelligence.objections],
    ["purchaseMotivations", productIntelligence.purchaseMotivations],
    ["keyBenefits", productIntelligence.keyBenefits],
    ["emotionalBenefits", productIntelligence.emotionalBenefits],
    ["functionalBenefits", productIntelligence.functionalBenefits],
  ];

  const claims: GroundedClaim[] = [];
  for (const [field, texts] of fieldEntries) {
    texts.forEach((text, index) => {
      claims.push(classifyClaim(`${field}-${index}`, field, text, identity));
    });
  }
  return claims;
}
