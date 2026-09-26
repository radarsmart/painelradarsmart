// Radar Creative AI - Product Intelligence Grounding V1 - Remote Data Repair Recommendation
//
// PURO - constroi PROPOSTAS de correcao (dado persistido + defeito de
// codigo), nunca executa nenhuma (item 22 do pedido: "NAO UPDATE. NAO
// DELETE. NAO UPSERT"). Nenhuma funcao deste arquivo toca Supabase.

import type { CodeDefectFinding, GroundedProductIntelligence, RemoteDataRepairRecommendation } from "@/lib/product-intelligence-grounding/types";

export function buildRemoteDataRepairRecommendation(productIntelligenceId: string, grounded: GroundedProductIntelligence): RemoteDataRepairRecommendation | null {
  if (grounded.categoryGrounding.status !== "CONTRADICTED") return null;

  const fieldsAffected = ["category", ...grounded.contamination.affectedFields];

  return {
    table: "product_intelligence",
    recordId: productIntelligenceId,
    fieldsAffected,
    currentValue: {
      category: grounded.categoryGrounding.declaredCategory,
      ...Object.fromEntries(grounded.contamination.affectedFields.map((f) => [f, grounded.quarantinedClaims.filter((c) => c.field === f).map((c) => c.originalText)])),
    },
    proposedValue: {
      category: grounded.categoryGrounding.groundedCategoryProposal,
      ...Object.fromEntries(grounded.contamination.affectedFields.map((f) => [f, grounded.trustedClaims.filter((c) => c.field === f).map((c) => c.originalText)])),
    },
    reason: grounded.categoryGrounding.reason,
    sourceOfTruth: "Identidade real do produto (offers.title + texto de embalagem observado), nunca a inferencia de product_intelligence.",
    executed: false,
  };
}

// Defeito de CODIGO encontrado durante o rastreamento causal da tarefa
// original (Product Intelligence Grounding V1) - reportado inicialmente
// como achado separado, NAO corrigido naquela tarefa (fora de escopo
// naquele momento: "somente implementar, testar e executar DRY_RUN").
// ATUALIZADO por uma tarefa POSTERIOR desta mesma sessao (Product
// Intelligence Category Fix + Purpose-Aware Benefit Visualization V1), que
// efetivamente corrigiu isso em lib/product-intelligence/
// category-detection.ts - nunca reescrito silenciosamente, status
// explicito abaixo.
export function buildKnownCodeDefectFindings(): CodeDefectFinding[] {
  return [
    {
      file: "lib/product-intelligence/analyze.ts",
      lines: "detectCategory (funcao antiga, ja substituida)",
      defect:
        "\"colageno\" estava listado como keyword de suplementos, e detectCategory() retornava a PRIMEIRA categoria cujo keyword batesse no titulo (Object.entries em ordem de insercao, suplementos vinha antes de beleza). Um produto de skincare com \"colágeno\" no nome (ingrediente real e comum tambem em cosmeticos topicos) era classificado como suplementos antes que o loop chegasse a checar \"beleza\" - mesmo a categoria beleza nao tendo \"colageno\"/\"facial\"/\"creme\" na propria lista de keywords para competir.",
      proposedFix:
        "Substituir \"primeira categoria que bate\" por deteccao de evidencia ponderada (sinais FORTES vs FRACOS por categoria, nunca uma unica palavra ambigua decidindo sozinha) - aplicado.",
      executed: false,
      status: "FIXED_IN_FOLLOW_UP_TASK",
      fixedReference: "lib/product-intelligence/category-detection.ts#detectCategoryWithEvidence",
    },
  ];
}
