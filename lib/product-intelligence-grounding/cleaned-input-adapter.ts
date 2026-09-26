// Radar Creative AI - Product Intelligence Grounding V1 - Cleaned Input Adapter
//
// PURO, SOMENTE LEITURA - converte um GroundedProductIntelligence (ja
// classificado) numa visao "limpa" no MESMO formato que o Commercial
// Persuasion / Desire Engine V1 ja consome
// (lib/commercial-video/persuasion/claim-grounding.ts#ProductIntelligenceInput)
// - permite reavaliar o Desire Engine com dados limpos SEM alterar nenhum
// arquivo daquela camada (item "não integrar ao pipeline real" respeitado -
// esta funcao so prepara o INPUT, nunca importa/altera a logica de scoring).
//
// So claims trustedClaims (SUPPORTED + PLAUSIBLE) entram na saida -
// quarantinedClaims/unknownClaims ficam de fora (nunca deletadas do
// GroundedProductIntelligence original, so nao propagadas para frente).

import type { GroundedProductIntelligence, ProductIntelligenceFieldName, RawProductIntelligenceInput } from "@/lib/product-intelligence-grounding/types";

function textsForField(grounded: GroundedProductIntelligence, field: ProductIntelligenceFieldName): string[] {
  return grounded.trustedClaims.filter((c) => c.field === field).map((c) => c.originalText);
}

export function buildCleanedProductIntelligenceInput(grounded: GroundedProductIntelligence): RawProductIntelligenceInput {
  const category = grounded.categoryGrounding.status === "CONTRADICTED" ? grounded.categoryGrounding.groundedCategoryProposal ?? grounded.identity.declaredCategory : grounded.identity.declaredCategory;

  return {
    category,
    painPoints: textsForField(grounded, "painPoints"),
    desires: textsForField(grounded, "desires"),
    objections: textsForField(grounded, "objections"),
    purchaseMotivations: textsForField(grounded, "purchaseMotivations"),
    keyBenefits: textsForField(grounded, "keyBenefits"),
    emotionalBenefits: textsForField(grounded, "emotionalBenefits"),
    functionalBenefits: textsForField(grounded, "functionalBenefits"),
  };
}
