// Radar Creative AI - Product Intelligence
// Tipos explicitos (sem `any`) para a analise de publico/dor/desejo/
// objecoes/motivacao de uma oferta, usada pelo Creative Brain para
// escolher framework/angulo/persona.

export type ProductIntelligenceCategory =
  | "suplementos"
  | "perfumes"
  | "eletronicos"
  | "casa"
  | "cozinha"
  | "ferramentas"
  | "pet"
  | "moda"
  | "beleza"
  | "geral";

export type TargetAudience = {
  description: string;
  ageRange?: string;
  gender?: "feminino" | "masculino" | "misto";
  interests: string[];
};

export type RecommendedAngle = {
  slug: string;
  score: number;
  reason: string;
};

export type RecommendedFramework = {
  slug: string;
  score: number;
  reason: string;
};

export type ProductIntelligenceDraft = {
  category: ProductIntelligenceCategory;
  subcategory: string | null;
  targetAudience: TargetAudience;
  painPoints: string[];
  desires: string[];
  objections: string[];
  purchaseMotivations: string[];
  keyBenefits: string[];
  emotionalBenefits: string[];
  functionalBenefits: string[];
  recommendedAngles: RecommendedAngle[];
  recommendedFrameworks: RecommendedFramework[];
  summary: string;
  source: string;
  model: string | null;
};

export type ProductIntelligence = ProductIntelligenceDraft & {
  id: string;
  offerId: string;
  version: number;
  createdByUserId: string | null;
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
};

// Subconjunto de `offers` necessario para analisar o produto - evita
// acoplar essa camada ao shape completo da tabela.
export type OfferForAnalysis = {
  id: string;
  title: string | null;
  category?: string | null;
  marketplace?: string | null;
  price?: number | null;
  originalPrice?: number | null;
  discountPct?: number | null;
};
