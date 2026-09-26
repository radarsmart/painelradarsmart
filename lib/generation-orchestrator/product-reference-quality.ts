// Radar Creative AI - Generation Orchestrator / Product Reference Quality Gate
//
// Aprendizado do CANARY #3 (Invictus Paco Rabanne, 2026-08-08): com
// PRESERVE_PACKAGE a GEOMETRIA generalizou bem (validado em duas classes
// visuais - embalagem opaca da Creatina e vidro/liquido do Invictus), mas
// o modelo fabricou texto/tipografia inexistente e deixou a cor do
// liquido derivar quando a referencia real era pequena (343x500) e tinha
// regioes ambiguas. Este modulo decide, de forma 100% deterministica, se
// a referencia disponivel e "boa o suficiente" para o nivel de
// preservacao que a cena exige - e se nao for, recomenda o nivel de
// protecao mais forte (PRESERVE_PACKAGE_STRICT).
//
// IMPORTANTE (sinais conhecidos vs desconhecidos - ver ponto 13 do pedido
// original): este modulo NUNCA afirma ter detectado "vidro", "liquido",
// "texto pequeno" ou "reflexo" na imagem - nenhuma analise visual real
// acontece aqui. Os UNICOS sinais usados sao: as dimensoes reais da
// imagem (medidas via image-dimensions.ts, nao adivinhadas) e a categoria
// textual do produto (um proxy fraco e documentado, nunca uma alegacao de
// visao computacional).

import {
  isProductCentricMediaType,
  type ProductIntegrityMode,
  type ProductIntegrityRisk,
} from "@/lib/prompt-builder/product-integrity-mode";
import type { SceneMediaType } from "@/lib/prompt-builder/types";

export type ResolutionRisk = "LOW" | "MEDIUM" | "HIGH";
export type VisualComplexityRisk = "LOW" | "MEDIUM" | "HIGH";
export type FidelityRisk = "LOW" | "MEDIUM" | "HIGH";

// Thresholds deterministicos e documentados (ajustaveis com evidencia
// futura, nunca por produto especifico). Baseados na menor dimensao (nao
// em megapixels - uma imagem "larga e baixa" nao deveria escapar do
// risco so por ter area total razoavel).
export const RESOLUTION_RISK_HIGH_MAX_MIN_DIMENSION = 400; // < 400px de menor lado -> HIGH
export const RESOLUTION_RISK_MEDIUM_MAX_MIN_DIMENSION = 700; // < 700px (e >= 400) -> MEDIUM; >= 700 -> LOW

// Mesma lista conceitual de HIGH_RISK_PACKAGING_CATEGORIES em
// product-integrity-mode.ts, mas usada aqui com um teto diferente: essa
// aqui e um sinal FRACO (categoria sozinha nunca prova complexidade
// visual real), entao nunca produz HIGH - no maximo MEDIUM. Duplicada
// deliberadamente (em vez de importada) porque as duas listas respondem
// perguntas diferentes: aquela classifica risco de PRESERVACAO; esta
// classifica confianca na CATEGORIA como proxy de complexidade visual.
const CATEGORIES_ASSOCIATED_WITH_COMPLEX_PACKAGING = new Set(["suplementos", "beleza", "perfumes"]);

export type ProductReferenceQualityInput = {
  // null quando as dimensoes nao puderam ser medidas (URL inacessivel,
  // formato nao reconhecido, ou nenhuma imagem de produto disponivel).
  width: number | null;
  height: number | null;
  category: string;
  mediaType: SceneMediaType;
  // Risco ja calculado por classifyProductIntegrityRisk (product-integrity-mode.ts)
  // - este modulo nao recalcula isso, so consome.
  productIntegrityRisk: ProductIntegrityRisk;
};

export type ProductReferenceQualityAssessment = {
  width: number | null;
  height: number | null;
  megapixels: number | null;
  resolutionRisk: ResolutionRisk;
  visualComplexityRisk: VisualComplexityRisk;
  fidelityRisk: FidelityRisk;
  reasons: string[];
  recommendedIntegrityMode: ProductIntegrityMode;
};

/**
 * So a dimensao da imagem - nunca a categoria. Dimensoes desconhecidas
 * (null) nunca viram LOW (nao temos evidencia de que a imagem e boa);
 * seguem o mesmo padrao conservador ja usado em
 * classifyProductIntegrityRisk para categoria desconhecida: MEDIUM, nunca
 * o extremo mais seguro nem o mais grave so por falta de dado.
 */
function classifyResolutionRisk(width: number | null, height: number | null): ResolutionRisk {
  if (width === null || height === null) return "MEDIUM";

  const minDimension = Math.min(width, height);
  if (minDimension < RESOLUTION_RISK_HIGH_MAX_MIN_DIMENSION) return "HIGH";
  if (minDimension < RESOLUTION_RISK_MEDIUM_MAX_MIN_DIMENSION) return "MEDIUM";
  return "LOW";
}

/**
 * So a categoria - um proxy fraco. Nunca retorna HIGH: sem analise visual
 * real, afirmar "alta complexidade visual" so pela categoria seria
 * fingir uma certeza que nao temos (ver docstring do modulo).
 */
function classifyVisualComplexityRisk(category: string): VisualComplexityRisk {
  return CATEGORIES_ASSOCIATED_WITH_COMPLEX_PACKAGING.has(category) ? "MEDIUM" : "LOW";
}

function classifyFidelityRisk(resolutionRisk: ResolutionRisk, visualComplexityRisk: VisualComplexityRisk): FidelityRisk {
  if (resolutionRisk === "HIGH") return "HIGH";
  if (resolutionRisk === "MEDIUM" || visualComplexityRisk === "MEDIUM") return "MEDIUM";
  return "LOW";
}

/**
 * STRICT so entra quando as DUAS condicoes do pedido original se somam:
 * (1) a cena ja exigiria PRESERVE_PACKAGE (productIntegrityRisk HIGH) E
 * (2) a referencia disponivel tem fidelityRisk HIGH. Cenas que nao
 * precisariam nem de PRESERVE_PACKAGE continuam STANDARD independente da
 * qualidade da referencia - qualidade de imagem so importa quando ja
 * estamos pedindo preservacao fina.
 */
function recommendIntegrityMode(
  mediaType: SceneMediaType,
  productIntegrityRisk: ProductIntegrityRisk,
  fidelityRisk: FidelityRisk,
): ProductIntegrityMode {
  if (!isProductCentricMediaType(mediaType)) return "STANDARD";
  if (productIntegrityRisk !== "HIGH") return "STANDARD";
  return fidelityRisk === "HIGH" ? "PRESERVE_PACKAGE_STRICT" : "PRESERVE_PACKAGE";
}

export function assessProductReferenceQuality(
  input: ProductReferenceQualityInput,
): ProductReferenceQualityAssessment {
  const resolutionRisk = classifyResolutionRisk(input.width, input.height);
  const visualComplexityRisk = classifyVisualComplexityRisk(input.category);
  const fidelityRisk = classifyFidelityRisk(resolutionRisk, visualComplexityRisk);
  const recommendedIntegrityMode = recommendIntegrityMode(input.mediaType, input.productIntegrityRisk, fidelityRisk);

  const megapixels =
    input.width !== null && input.height !== null
      ? Math.round(((input.width * input.height) / 1_000_000) * 100) / 100
      : null;

  const reasons: string[] = [];

  if (input.width === null || input.height === null) {
    reasons.push(
      "Dimensoes da imagem de referencia desconhecidas (URL inacessivel ou formato nao reconhecido) - " +
        "assumindo risco de resolucao MEDIO por padrao conservador, nunca assumindo que a imagem e boa sem evidencia.",
    );
  } else {
    reasons.push(
      `Menor dimensao da referencia: ${Math.min(input.width, input.height)}px ` +
        `(${input.width}x${input.height}) -> resolutionRisk ${resolutionRisk}.`,
    );
  }

  reasons.push(
    visualComplexityRisk === "MEDIUM"
      ? `Categoria "${input.category}" esta associada a embalagens com maior chance de detalhe fino ` +
          "(vidro, texto pequeno, liquido) - sinal fraco baseado so na categoria, sem nenhuma analise visual real."
      : `Categoria "${input.category}" nao esta na lista de categorias associadas a embalagem complexa.`,
  );

  if (!isProductCentricMediaType(input.mediaType)) {
    reasons.push(`mediaType "${input.mediaType}" nao e product-centric - fidelidade de embalagem nao se aplica a esta cena.`);
  } else if (input.productIntegrityRisk !== "HIGH") {
    reasons.push("Cena nao exige preservacao de embalagem (productIntegrityRisk != HIGH) - qualidade da referencia nao eleva o modo.");
  } else if (fidelityRisk === "HIGH") {
    reasons.push(
      "Cena exige preservacao de embalagem (productIntegrityRisk HIGH) E a referencia tem fidelityRisk ALTO - " +
        "recomendando PRESERVE_PACKAGE_STRICT.",
    );
  } else {
    reasons.push("Cena exige preservacao de embalagem e a referencia tem fidelidade suficiente para PRESERVE_PACKAGE (sem STRICT).");
  }

  return {
    width: input.width,
    height: input.height,
    megapixels,
    resolutionRisk,
    visualComplexityRisk,
    fidelityRisk,
    reasons,
    recommendedIntegrityMode,
  };
}
