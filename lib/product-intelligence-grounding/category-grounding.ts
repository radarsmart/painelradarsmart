// Radar Creative AI - Product Intelligence Grounding V1 - Category Grounding
//
// PURO - compara product_intelligence.category (declarada) contra a
// identidade REAL do produto (ProductIdentityProfile, construida so de
// TIER1/TIER2). Nunca hardcoda um produto especifico - so usa os clusters
// genericos de domain-clusters.ts.

import type { DomainClusterId, ProductCategoryGroundingResult, ProductIdentityProfile } from "@/lib/product-intelligence-grounding/types";

// Mapeamento categoria declarada (enum real do projeto, ver
// lib/product-intelligence/types.ts#ProductIntelligenceCategory) -> quais
// clusters de dominio essa categoria deveria produzir se o produto for
// realmente dessa categoria. Categorias sem cluster generico mapeado
// (perfumes/eletronicos-parcial/casa/cozinha/ferramentas/pet) ficam de fora
// deliberadamente - nao afirmamos nada sobre elas (retornam null =
// "nao avaliavel", nunca um falso PASS/FAIL).
const CATEGORY_TO_EXPECTED_CLUSTERS: Partial<Record<string, DomainClusterId[]>> = {
  suplementos: ["SPORTS_FITNESS", "FOOD_SUPPLEMENT"],
  beleza: ["SKINCARE", "HAIRCARE"],
  moda: ["FASHION"],
  eletronicos: ["ELECTRONICS"],
};

// Reverso - usado so para propor um valor corrigido quando CONTRADICTED
// (nunca aplicado automaticamente, so uma proposta textual no resultado).
const CLUSTER_TO_CATEGORY: Partial<Record<DomainClusterId, string>> = {
  SPORTS_FITNESS: "suplementos",
  FOOD_SUPPLEMENT: "suplementos",
  SKINCARE: "beleza",
  HAIRCARE: "beleza",
  FASHION: "moda",
  ELECTRONICS: "eletronicos",
  HOME: "casa",
};

export function groundProductCategory(identity: ProductIdentityProfile): ProductCategoryGroundingResult {
  const declaredCategory = identity.declaredCategory;
  const expectedClusters = CATEGORY_TO_EXPECTED_CLUSTERS[declaredCategory] ?? null;

  if (identity.identityClusters.length === 0) {
    return {
      status: "AMBIGUOUS",
      declaredCategory,
      identityClusters: [],
      expectedClusters,
      groundedCategoryProposal: null,
      reason: "Identidade do produto nao pode ser determinada com confianca a partir das fontes TIER1/TIER2 disponiveis (titulo/embalagem) - nenhuma contradicao pode ser afirmada, mas tambem nenhuma confirmacao.",
    };
  }

  if (expectedClusters === null) {
    return {
      status: "PLAUSIBLE",
      declaredCategory,
      identityClusters: identity.identityClusters,
      expectedClusters: null,
      groundedCategoryProposal: null,
      reason: `Categoria declarada ("${declaredCategory}") nao tem cluster de dominio mapeado nesta versao - nenhuma contradicao pode ser afirmada automaticamente.`,
    };
  }

  const intersects = identity.identityClusters.some((c) => expectedClusters.includes(c));
  if (intersects) {
    return {
      status: "MATCH",
      declaredCategory,
      identityClusters: identity.identityClusters,
      expectedClusters,
      groundedCategoryProposal: null,
      reason: `Identidade real do produto (${identity.identityClusters.join(", ")}) e compativel com a categoria declarada ("${declaredCategory}").`,
    };
  }

  // Identidade detectada, mas nenhum cluster em comum com o esperado -
  // so afirmamos CONTRADICTED quando a confianca de identidade e
  // MEDIUM/HIGH (sinal disjunto fraco vira AMBIGUOUS, nunca uma acusacao).
  if (identity.confidence === "MEDIUM" || identity.confidence === "HIGH") {
    const proposedCluster = identity.identityClusters[0];
    return {
      status: "CONTRADICTED",
      declaredCategory,
      identityClusters: identity.identityClusters,
      expectedClusters,
      groundedCategoryProposal: CLUSTER_TO_CATEGORY[proposedCluster] ?? null,
      reason: `Titulo/embalagem real do produto indicam ${identity.identityClusters.join(", ")} (confidence=${identity.confidence}), mas a categoria declarada ("${declaredCategory}") esperaria ${expectedClusters.join(" ou ")} - nenhum cluster em comum.`,
    };
  }

  return {
    status: "AMBIGUOUS",
    declaredCategory,
    identityClusters: identity.identityClusters,
    expectedClusters,
    groundedCategoryProposal: null,
    reason: `Sinal de identidade fraco (confidence=${identity.confidence}) e disjunto do esperado para "${declaredCategory}" - insuficiente para afirmar contradicao.`,
  };
}
