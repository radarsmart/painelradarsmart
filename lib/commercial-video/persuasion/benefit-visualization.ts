// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Benefit Visualization
//
// PURO - responde "como MOSTRAR o motivo de compra?", nao so "como mostrar
// o produto?". Penaliza comerciais compostos quase exclusivamente por
// PACKSHOT (item 10 do pedido) - exatamente o padrao observado no
// COMMERCIAL V2 FULL CANARY real (produto grande/flutuando repetido).
//
// V2 (PRODUCT INTELLIGENCE CATEGORY FIX + PURPOSE-AWARE BENEFIT
// VISUALIZATION V1): achado real do DRY_RUN anterior - o score V1 penalizava
// PACKSHOT em QUALQUER cena, inclusive OFFER/CTA, onde parar no produto com
// preco/CTA em evidencia e a finalidade CORRETA da cena, nao um defeito.
// Isso travava BENEFIT_VISUALIZATION em 40/100 mesmo com dado 100% limpo.
// Agora o score deriva de CommercialBenefitCoverage (purpose-aware,
// buildCommercialBenefitCoverage abaixo) - so cobra demonstracao de cenas
// com responsabilidade PRIMARY (purpose BENEFIT/PROOF, ou qualquer cena que
// ja carrega uma claim real atribuida). packshotRatio/demonstrationRatio
// continuam calculados e expostos (usados por outros modulos - nunca
// removidos), so pararam de ser a formula de .score.

import type {
  BenefitResponsibility,
  BenefitVisualizationPlan,
  BenefitVisualizationScore,
  CommercialBenefitCoverage,
  DemonstrationType,
  PersuasionClaim,
  PersuasionEvidence,
  PersuasionSceneConcept,
  ProductDesireProfile,
} from "@/lib/commercial-video/persuasion/types";

const DEMONSTRATION_ROLES = new Set(["DEMONSTRATION", "EXPERIENCE", "RESULT_VISUALIZATION", "INGREDIENT_STORY", "HUMAN_REACTION"]);
const PACKSHOT_ROLES = new Set(["PACKSHOT", "FLOATING_HERO"]);
const WHOLE_COMMERCIAL_PACKSHOT_DOMINANCE_RATIO = 0.8;
const WHOLE_COMMERCIAL_PACKSHOT_DOMINANCE_PENALTY = 20;

function isDemonstrationRole(role: string): boolean {
  return DEMONSTRATION_ROLES.has(role);
}

function isPackshotRole(role: string): boolean {
  return PACKSHOT_ROLES.has(role);
}

// Nunca decide so pelo ScenePurpose isolado (item 7 do pedido) - uma cena
// que ja carrega uma claim real atribuida (benefitClaimId != null) assume
// responsabilidade SUPPORTING mesmo fora de BENEFIT/PROOF, e PRODUCT so
// vira PRIMARY quando a propria estrategia visual ja e de demonstracao.
export function resolveBenefitResponsibility(scene: PersuasionSceneConcept): BenefitResponsibility {
  if (scene.purpose === "BENEFIT" || scene.purpose === "PROOF") return "PRIMARY";
  if (scene.benefitClaimId !== null) return "SUPPORTING";
  if (scene.purpose === "PRODUCT") return isDemonstrationRole(scene.productVisualRole) ? "PRIMARY" : "SUPPORTING";
  if (scene.purpose === "HOOK") return scene.salesAngleAlignment ? "SUPPORTING" : "NONE";
  // OFFER/CTA: packshot com preco/acao em evidencia e a finalidade
  // correta, nunca uma falha de demonstracao (item 9 do pedido).
  return "NONE";
}

export function buildCommercialBenefitCoverage(scenes: PersuasionSceneConcept[]): CommercialBenefitCoverage {
  if (scenes.length === 0) {
    return { requiredBenefits: [], visualizedBenefits: [], unsupportedBenefits: [], responsibleScenes: [], coverageScore: 0, packshotDominancePenalty: 0, reasons: ["Nenhuma cena para avaliar."] };
  }

  const responsibleScenes = scenes.map((s) => ({
    sceneId: s.sceneId,
    purpose: s.purpose,
    responsibility: resolveBenefitResponsibility(s),
    demonstrated: isDemonstrationRole(s.productVisualRole),
  }));

  const primaryScenes = responsibleScenes.filter((s) => s.responsibility === "PRIMARY");
  const demonstratedPrimary = primaryScenes.filter((s) => s.demonstrated);

  const requiredBenefits = Array.from(new Set(scenes.map((s) => s.benefitClaimId).filter((id): id is string => id !== null)));
  const visualizedBenefits = Array.from(
    new Set(scenes.filter((s) => s.benefitClaimId !== null && isDemonstrationRole(s.productVisualRole)).map((s) => s.benefitClaimId as string)),
  );
  const unsupportedBenefits = requiredBenefits.filter((id) => !visualizedBenefits.includes(id));

  const primaryFulfillmentRatio = primaryScenes.length > 0 ? demonstratedPrimary.length / primaryScenes.length : 0;
  // requiredBenefits vazio nunca vira "cobertura total por omissao" -
  // tratado como 0 (nada foi tentado, isso nao e neutro-bom).
  const coverageRatio = requiredBenefits.length > 0 ? visualizedBenefits.length / requiredBenefits.length : 0;

  const overallPackshotRatio = scenes.filter((s) => isPackshotRole(s.productVisualRole)).length / scenes.length;
  const packshotDominancePenalty = overallPackshotRatio > WHOLE_COMMERCIAL_PACKSHOT_DOMINANCE_RATIO ? WHOLE_COMMERCIAL_PACKSHOT_DOMINANCE_PENALTY : 0;

  const anyResponsibilityAssumed = primaryScenes.length > 0 || requiredBenefits.length > 0;

  const reasons: string[] = [];
  if (primaryScenes.length === 0) {
    reasons.push("Nenhuma cena tem responsabilidade PRIMARY de demonstrar beneficio (nenhum purpose BENEFIT/PROOF, nenhuma claim real atribuida a uma cena de demonstracao).");
  } else if (demonstratedPrimary.length === 0) {
    reasons.push(`${primaryScenes.length} cena(s) com responsabilidade PRIMARY de demonstrar beneficio, mas NENHUMA realmente demonstra (packshot no lugar de demonstracao).`);
  } else if (demonstratedPrimary.length < primaryScenes.length) {
    reasons.push(`${primaryScenes.length - demonstratedPrimary.length}/${primaryScenes.length} cena(s) PRIMARY nao demonstram beneficio de fato.`);
  }
  if (unsupportedBenefits.length > 0) {
    reasons.push(`${unsupportedBenefits.length} beneficio(s) referenciados no storyboard mas nunca realmente visualizados: ${unsupportedBenefits.join(", ")}.`);
  }
  if (packshotDominancePenalty > 0) {
    reasons.push(`${Math.round(overallPackshotRatio * 100)}% de TODAS as cenas sao packshot/produto flutuando - dominancia excessiva independente da finalidade de cada cena.`);
  }

  const coverageScore = Math.max(
    0,
    Math.min(100, Math.round(primaryFulfillmentRatio * 50 + coverageRatio * 40 + (anyResponsibilityAssumed ? 10 : 0) - packshotDominancePenalty)),
  );

  return { requiredBenefits, visualizedBenefits, unsupportedBenefits, responsibleScenes, coverageScore, packshotDominancePenalty, reasons };
}

function recommendDemonstrationType(claim: PersuasionClaim): DemonstrationType {
  const text = claim.text.toLowerCase();
  if (text.includes("textura") || text.includes("absorcao") || text.includes("absorção") || text.includes("aplica")) return "DEMONSTRATION";
  if (text.includes("oleo") || text.includes("óleo") || text.includes("ingrediente") || text.includes("colageno") || text.includes("colágeno")) return "INGREDIENT_STORY";
  return "EXPERIENCE";
}

export function buildBenefitVisualizationPlans(evidence: PersuasionEvidence, desireProfile: ProductDesireProfile): BenefitVisualizationPlan[] {
  const usableClaims = [...evidence.packagingClaims, ...evidence.factualClaims.filter((c) => c.id !== "fact-title")];

  return usableClaims.map((claim) => {
    const demonstrationType = recommendDemonstrationType(claim);
    return {
      benefit: claim.text,
      evidence: claim,
      visualMetaphor: demonstrationType === "DEMONSTRATION" ? "close-up de aplicacao/textura real" : demonstrationType === "INGREDIENT_STORY" ? "ingrediente real em destaque" : "produto em uso cotidiano",
      demonstrationType,
      productInteraction: demonstrationType === "DEMONSTRATION" ? "APPLIED" : demonstrationType === "INGREDIENT_STORY" ? "POINTED_AT" : "HELD",
      humanInteraction: demonstrationType === "EXPERIENCE" ? "mao/rosto aplicando o produto" : "nenhuma obrigatoria",
      environmentRelevance: `contexto de ${desireProfile.productCategory} (banheiro/bancada/rotina de cuidado) - nunca ambiente nao relacionado`,
      riskOfOverclaim: claim.status === "PACKAGING_SUPPORTED" || claim.status === "FACTUAL" ? "LOW" : "MEDIUM",
      recommendedScenePurpose: "BENEFIT",
    };
  });
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreBenefitVisualization(scenes: PersuasionSceneConcept[]): BenefitVisualizationScore {
  const coverage = buildCommercialBenefitCoverage(scenes);

  if (scenes.length === 0) return { score: 0, packshotRatio: 1, demonstrationRatio: 0, reasons: coverage.reasons, coverage };

  const packshotOrFloating = scenes.filter((s) => isPackshotRole(s.productVisualRole)).length;
  const demonstrationLike = scenes.filter((s) => isDemonstrationRole(s.productVisualRole)).length;

  // packshotRatio/demonstrationRatio continuam calculados (outros modulos
  // dependem deles - purchase-motivation-score.ts#demonstrationStrength,
  // generic-ai-ad-risk-v2.ts#EXCESSIVE_PACKSHOT), mas o .score agora vem de
  // CommercialBenefitCoverage (purpose-aware) - nunca mais penaliza
  // packshot legitimo em OFFER/CTA.
  const packshotRatio = packshotOrFloating / scenes.length;
  const demonstrationRatio = demonstrationLike / scenes.length;

  return { score: clamp(coverage.coverageScore), packshotRatio, demonstrationRatio, reasons: coverage.reasons, coverage };
}
