// Radar Creative AI - Product Intelligence Grounding V1 - Product Identity Profile
//
// PURO - constroi a identidade do produto SOMENTE a partir de fontes
// TIER_1_PRIMARY_FACTUAL (titulo/marketplace/preco/desconto real) e
// TIER_2_PRODUCT_SUPPORTED (texto de embalagem real observado) - NUNCA lê
// product_intelligence aqui (essa e justamente a camada que estamos
// auditando, nunca pode se auto-validar). Campo sem evidencia fica
// null/UNKNOWN - "UNKNOWN e melhor que inventar" (item 3 do pedido).

import { DOMAIN_CLUSTERS, clustersWithHits, detectClustersInText } from "@/lib/product-intelligence-grounding/domain-clusters";
import type { ObservedPackagingTextInput, ProductIdentityProfile, RawOfferInput } from "@/lib/product-intelligence-grounding/types";

export function buildProductIdentityProfile(offer: RawOfferInput, declaredCategory: string, observedPackagingTexts: ObservedPackagingTextInput[] = []): ProductIdentityProfile {
  const evidence: ProductIdentityProfile["evidence"] = [
    { field: "title", value: offer.title, tier: "TIER_1_PRIMARY_FACTUAL", source: "offers.title" },
  ];
  if (offer.marketplace) evidence.push({ field: "marketplace", value: offer.marketplace, tier: "TIER_1_PRIMARY_FACTUAL", source: "offers.marketplace" });
  if (offer.brand) evidence.push({ field: "brand", value: offer.brand, tier: "TIER_1_PRIMARY_FACTUAL", source: "offers.brand" });
  for (const [index, obs] of observedPackagingTexts.entries()) {
    evidence.push({ field: `packaging-${index}`, value: obs.text, tier: "TIER_2_PRODUCT_SUPPORTED", source: obs.observedVia });
  }

  const factualDescriptors = [offer.title, ...observedPackagingTexts.map((o) => o.text)];
  const combinedText = factualDescriptors.join(" | ");

  const hits = detectClustersInText(combinedText, (c) => c.identityKeywords);
  const identityClusters = clustersWithHits(hits);
  const identityKeywordHits: Record<string, string[]> = {};
  for (const clusterId of identityClusters) identityKeywordHits[clusterId] = hits[clusterId];

  const totalKeywordHits = identityClusters.reduce((sum, id) => sum + hits[id].length, 0);
  let confidence: ProductIdentityProfile["confidence"] = "UNKNOWN";
  if (identityClusters.length === 0) confidence = "UNKNOWN";
  else if (identityClusters.length > 1) confidence = "LOW"; // sinais de multiplos dominios ao mesmo tempo - identidade ambigua, nunca escolher um arbitrariamente
  else if (totalKeywordHits >= 2) confidence = "HIGH";
  else confidence = "MEDIUM";

  return {
    productName: offer.title,
    brand: offer.brand,
    declaredCategory,
    price: offer.price,
    discountPercent: offer.discountPct,
    marketplace: offer.marketplace,
    factualDescriptors,
    identityClusters,
    identityKeywordHits,
    confidence,
    evidence,
  };
}

export { DOMAIN_CLUSTERS };
