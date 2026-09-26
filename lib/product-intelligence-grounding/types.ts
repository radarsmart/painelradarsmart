// Radar Creative AI - Product Intelligence Grounding & Contamination Guard V1 - Types
//
// Camada NOVA, deterministica, que roda ANTES do Commercial Persuasion /
// Desire Engine V1 (lib/commercial-video/persuasion/**, nunca alterado por
// esta tarefa). Objetivo: detectar quando o Product Intelligence
// persistido (product_intelligence.*) e semanticamente incompativel com a
// identidade REAL do produto (titulo/embalagem/oferta), ANTES que essa
// contaminacao vire ambiente errado, sales angle errado, ou narracao
// generica la na frente.
//
// Achado real que motivou esta tarefa (2026-08-11, campanha Kokeshi,
// 660d53b5-...): product_intelligence.category="suplementos" para um creme
// FACIAL - rastreado ate lib/product-intelligence/analyze.ts#detectCategory
// (colisao de palavra-chave "colageno", que pertence tanto a suplementos
// quanto a skincare, resolvida por match-order em vez de especificidade) e
// lib/commercial-director/creative-style.ts#CATEGORY_VISUAL_STYLE
// ("suplementos" -> "FITNESS"), causa raiz code-provada do ambiente de
// academia. Ver environment-contamination-trace.ts.

// --- 2. Source hierarchy -----------------------------------------------------

export type SourceTier =
  | "TIER_1_PRIMARY_FACTUAL" // titulo/marketplace/preco/desconto/URL/imagem real
  | "TIER_2_PRODUCT_SUPPORTED" // texto de embalagem real, metadata verificada
  | "TIER_3_DERIVED" // product_intelligence.category/beneficios/publico inferido
  | "TIER_4_CREATIVE_INFERENCE"; // lifestyle/angulo emocional/metafora visual

// --- 6. Domain clusters (genericos - nunca especificos de um produto) -------

export const DOMAIN_CLUSTER_IDS = [
  "SPORTS_FITNESS",
  "FOOD_SUPPLEMENT",
  "SKINCARE",
  "HAIRCARE",
  "HOME",
  "ELECTRONICS",
  "FASHION",
] as const;
export type DomainClusterId = (typeof DOMAIN_CLUSTER_IDS)[number];

export type DomainClusterProfile = {
  id: DomainClusterId;
  // Palavras que indicam que o PRODUTO EM SI pertence a este dominio
  // (usadas contra titulo real + texto de embalagem real - TIER1/TIER2).
  identityKeywords: string[];
  // Palavras que indicam que um TEXTO/CLAIM esta falando sobre este
  // dominio (usadas contra pain_points/desires/objections/etc - TIER3).
  domainLanguageKeywords: string[];
};

// --- 3. Product Identity Profile --------------------------------------------

export type ProductIdentityProfile = {
  productName: string;
  brand: string | null;
  declaredCategory: string;
  price: number | null;
  discountPercent: number | null;
  marketplace: string | null;
  factualDescriptors: string[]; // texto TIER1/TIER2 usado para detectar identidade (titulo + embalagem)
  identityClusters: DomainClusterId[]; // clusters detectados a partir de factualDescriptors
  identityKeywordHits: Record<string, string[]>; // clusterId -> keywords que bateram
  confidence: "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH";
  evidence: Array<{ field: string; value: string; tier: SourceTier; source: string }>;
};

// --- 4. Category validation --------------------------------------------------

export type ProductCategoryGroundingStatus = "MATCH" | "PLAUSIBLE" | "AMBIGUOUS" | "CONTRADICTED";

export type ProductCategoryGroundingResult = {
  status: ProductCategoryGroundingStatus;
  declaredCategory: string;
  identityClusters: DomainClusterId[];
  expectedClusters: DomainClusterId[] | null; // null = categoria sem cluster mapeado (nao avaliavel)
  groundedCategoryProposal: string | null; // so preenchido quando CONTRADICTED
  reason: string;
};

// --- 5. Claim contamination detection ----------------------------------------

export type ClaimGroundingStatus = "SUPPORTED" | "PLAUSIBLE" | "UNSUPPORTED" | "CONTRADICTED" | "CONTAMINATED";

export type ProductIntelligenceFieldName =
  | "painPoints"
  | "desires"
  | "objections"
  | "purchaseMotivations"
  | "keyBenefits"
  | "emotionalBenefits"
  | "functionalBenefits";

export type GroundedClaim = {
  id: string;
  field: ProductIntelligenceFieldName;
  originalText: string;
  source: "PRODUCT_INTELLIGENCE";
  groundingStatus: ClaimGroundingStatus;
  claimClusters: DomainClusterId[]; // clusters detectados no proprio texto da claim
  evidence: string[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
  contaminationSignals: string[]; // keywords/clusters que causaram CONTAMINATED
};

// --- 7. Contamination score ---------------------------------------------------

export type ProductIntelligenceContaminationResult = {
  score: number; // 0 (consistente) - 100 (severamente contaminado)
  categoryMismatchPoints: number;
  claimMismatchPoints: number;
  usageContextMismatchPoints: number;
  benefitMismatchPoints: number;
  audienceMismatchPoints: number;
  environmentMismatchPoints: number;
  reasons: string[];
  affectedFields: ProductIntelligenceFieldName[];
};

// --- 8/9. Quarantine + Grounded Product Intelligence view --------------------

export type GroundedProductIntelligence = {
  identity: ProductIdentityProfile;
  categoryGrounding: ProductCategoryGroundingResult;
  allClaims: GroundedClaim[];
  trustedClaims: GroundedClaim[]; // SUPPORTED + PLAUSIBLE
  quarantinedClaims: GroundedClaim[]; // CONTAMINATED + CONTRADICTED
  unknownClaims: GroundedClaim[]; // UNSUPPORTED
  contamination: ProductIntelligenceContaminationResult;
  groundingQuality: "HIGH" | "MEDIUM" | "LOW";
};

// --- 10. Environment contamination trace -------------------------------------

export type EnvironmentContaminationTraceStep = {
  step: number;
  stage: "SOURCE" | "PRODUCT_INTELLIGENCE" | "CLAIM_CLASSIFICATION" | "CREATIVE_DECISION" | "ENVIRONMENT";
  description: string;
  evidence: string[]; // citacoes literais (codigo/dados), nunca suposicao
  codeReference: string | null; // "arquivo.ts:linha" quando aplicavel
};

export type EnvironmentContaminationTrace = {
  proven: boolean; // true somente se a cadeia inteira foi confirmada por codigo/dados reais
  steps: EnvironmentContaminationTraceStep[];
  conclusion: string;
};

// --- 16. Product Intelligence Grounding Gate ---------------------------------

export type GroundingCheckName =
  | "PRODUCT_IDENTITY"
  | "CATEGORY_GROUNDING"
  | "CLAIM_GROUNDING"
  | "DOMAIN_CONSISTENCY"
  | "BENEFIT_GROUNDING"
  | "USAGE_CONTEXT"
  | "AUDIENCE_CONSISTENCY"
  | "CONTAMINATION"
  | "DOWNSTREAM_SAFETY";

export type GroundingCheckStatus = "PASS" | "PASS_WITH_OBSERVATIONS" | "FAIL";

export type GroundingCheckResult = {
  name: GroundingCheckName;
  status: GroundingCheckStatus;
  reasons: string[];
};

export type ProductIntelligenceGroundingGateResult = {
  status: GroundingCheckStatus;
  checks: GroundingCheckResult[];
  downstreamReady: boolean;
  blockingReasons: string[];
  observations: string[];
};

// --- 22. Remote data repair recommendation (NUNCA executado) -----------------

export type RemoteDataRepairRecommendation = {
  table: string;
  recordId: string;
  fieldsAffected: string[];
  currentValue: Record<string, unknown>;
  proposedValue: Record<string, unknown>;
  reason: string;
  sourceOfTruth: string;
  executed: false; // sempre false - este tipo so representa uma PROPOSTA
};

export type CodeDefectFinding = {
  file: string;
  lines: string;
  defect: string;
  proposedFix: string;
  executed: false;
  // "OPEN" quando reportado mas nao corrigido nesta tarefa; atualizado para
  // "FIXED_IN_FOLLOW_UP_TASK" quando uma tarefa POSTERIOR desta sessao
  // efetivamente aplicou a correcao (ver lib/product-intelligence/
  // category-detection.ts) - nunca reescrito silenciosamente, sempre com
  // referencia explicita de onde foi corrigido.
  status: "OPEN" | "FIXED_IN_FOLLOW_UP_TASK";
  fixedReference?: string;
};

// --- Fixtures / testes anti-gaming ------------------------------------------

export type RawProductIntelligenceInput = {
  category: string;
  painPoints: string[];
  desires: string[];
  objections: string[];
  purchaseMotivations: string[];
  keyBenefits: string[];
  emotionalBenefits: string[];
  functionalBenefits: string[];
};

export type RawOfferInput = {
  title: string;
  price: number | null;
  originalPrice: number | null;
  discountPct: number | null;
  marketplace: string | null;
  brand: string | null;
};

export type ObservedPackagingTextInput = { text: string; observedVia: string };
