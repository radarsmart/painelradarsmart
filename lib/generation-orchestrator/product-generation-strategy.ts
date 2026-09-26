// Radar Creative AI - Generation Orchestrator / Product Generation Strategy Router
//
// Aprendizado do CANARY #3 (Invictus, PRESERVE_PACKAGE) e do CANARY #4
// (Invictus, PRESERVE_PACKAGE_STRICT, 2026-08-08): duas tentativas reais
// de resolver fabricacao de texto + deriva de cor SO com prompt nao
// funcionaram - o STRICT chegou a piorar os dois eixos e ainda introduziu
// uma deformacao estrutural transitoria nova. Conclusao adotada: quando
// fidelityRisk = HIGH e a cena ja exigiria preservacao forte de produto,
// nao insistir em image-to-video puramente generativo - a estrategia
// correta e composicao hibrida (produto real intacto, so o fundo/ambiente
// e gerado).
//
// Este modulo so decide QUAL estrategia usar e monta o PLANO da
// composicao hibrida (prompts, placement, negative guards) - nao
// implementa o compositor em si (isso e trabalho futuro, ver
// hybridCompositePlan como contrato de entrada para esse compositor).

import {
  isProductCentricMediaType,
  type ProductIntegrityRisk,
} from "@/lib/prompt-builder/product-integrity-mode";
import type { FidelityRisk, ProductReferenceQualityAssessment } from "@/lib/generation-orchestrator/product-reference-quality";
import type { OverlayInstructions, SafeAreaDirection, SceneMediaType } from "@/lib/prompt-builder/types";

export type ProductGenerationStrategy =
  | "GENERATIVE_PRODUCT_VIDEO"
  | "PRESERVE_PACKAGE_VIDEO"
  | "HYBRID_PRODUCT_COMPOSITE"
  | "BLOCKED_REFERENCE_QUALITY";

export type ProductPlacement = "CENTER" | "LEFT" | "RIGHT";

export type HybridCompositePlan = {
  productReferenceUrl: string;
  backgroundGenerationPrompt: string;
  backgroundNegativePrompt: string;
  productPlacement: ProductPlacement;
  cameraMotion: string;
  // Sempre true nesta fase - o unico modo hibrido que existe hoje e
  // "produto 100% intacto". Um valor diferente exigiria um compositor com
  // algum grau de re-render do produto, o que nao existe.
  preserveProductPixels: true;
  overlayInstructions: OverlayInstructions;
};

export type ProductGenerationStrategyInput = {
  mediaType: SceneMediaType;
  productIntegrityRisk: ProductIntegrityRisk;
  // null quando a cena nao tem productReferenceQuality nenhuma calculada
  // (ex: sem productReferenceUrl) - tratado de forma conservadora (MEDIUM),
  // igual ao padrao ja usado dentro de product-reference-quality.ts.
  fidelityRisk: FidelityRisk | null;
  hasProductReference: boolean;
};

/**
 * Router PURO e deterministico. Regras (nesta ordem):
 *
 * 1. Cena nao e product-centric (ex: CHARACTER_VIDEO) -> null (estrategia
 *    de produto nao se aplica).
 * 2. Nao ha nenhuma productReferenceUrl utilizavel -> BLOCKED_REFERENCE_QUALITY
 *    (unica condicao de bloqueio nesta fase - nunca bloqueamos so por
 *    resolucao baixa, ja que HYBRID continua possivel com qualquer imagem
 *    real, mesmo pequena).
 * 3. productIntegrityRisk != HIGH -> GENERATIVE_PRODUCT_VIDEO, INDEPENDENTE
 *    de fidelityRisk. Mesmo precedente ja usado em
 *    product-reference-quality.ts (recommendIntegrityMode): se a cena nem
 *    pediria preservacao forte de embalagem, a qualidade da referencia nao
 *    teria por que promover a estrategia sozinha - resolve a combinacao
 *    "risk MEDIO/BAIXO + fidelidade RUIM" (nao coberta explicitamente no
 *    pedido original) da mesma forma que o resto do Product Integrity Mode
 *    ja trata ambiguidade: conservador, mas nunca inventando urgencia que
 *    o proprio risco de integridade nao indicou.
 * 4. productIntegrityRisk == HIGH e fidelityRisk == HIGH -> HYBRID_PRODUCT_COMPOSITE
 *    (aprendizado dos CANARY #3/#4 - nao usar mais STRICT como estrategia
 *    de execucao real para esta combinacao).
 * 5. productIntegrityRisk == HIGH e fidelityRisk != HIGH -> PRESERVE_PACKAGE_VIDEO
 *    (o que ja foi validado com sucesso no CANARY #2, Creatina).
 */
export function decideProductGenerationStrategy(
  input: ProductGenerationStrategyInput,
): ProductGenerationStrategy | null {
  if (!isProductCentricMediaType(input.mediaType)) return null;
  if (!input.hasProductReference) return "BLOCKED_REFERENCE_QUALITY";
  if (input.productIntegrityRisk !== "HIGH") return "GENERATIVE_PRODUCT_VIDEO";

  const fidelityRisk = input.fidelityRisk ?? "MEDIUM";
  return fidelityRisk === "HIGH" ? "HYBRID_PRODUCT_COMPOSITE" : "PRESERVE_PACKAGE_VIDEO";
}

// Movimento do FUNDO apenas - o produto real nao se move/nao e regenerado,
// entao nenhum termo aqui pode implicar movimento do produto.
export const HYBRID_BACKGROUND_CAMERA_MOTION =
  "subtle light sweep behind the hero space, gentle bokeh drifting, extremely subtle parallax on the " +
  "background layer only, controlled shadow evolution - camera and product remain effectively static";

// Termos que impediriam o provider de background de tentar desenhar OUTRO
// produto/logo/texto no lugar reservado para o produto real.
export const HYBRID_BACKGROUND_NEGATIVE_TERMS = [
  "product",
  "bottle",
  "package",
  "logo",
  "brand text",
  "typography",
  "price",
  "call-to-action",
  "watermark",
];

export type HybridBackgroundPromptInput = {
  // Estes 3 campos JA sao genericos no Prompt Builder (nunca mencionam o
  // nome do produto/marca - ver CATEGORY_ENVIRONMENT_EN em
  // lib/prompt-builder/scene-prompt.ts) - reaproveitados aqui de proposito
  // em vez de escrever um texto novo, para nao arriscar introduzir uma
  // mencao ao produto sem querer.
  environment: string;
  visualStyle: string;
  lighting: string;
};

/**
 * Prompt do FUNDO apenas - nunca descreve o produto, nunca pede frasco/
 * embalagem/logo/texto. O espaco central fica reservado para o compositor
 * colar o produto real depois.
 */
export function buildHybridBackgroundPrompt(input: HybridBackgroundPromptInput): string {
  return (
    `Premium advertising background, ${input.visualStyle.toLowerCase()} aesthetic. ${input.environment}. ` +
    "Controlled cinematic highlights, subtle warm reflections, soft volumetric light, sophisticated bokeh, " +
    `shallow depth of field, ${input.lighting}. Empty central hero space reserved for compositing the real ` +
    "product later - no product, no packaging, no bottle, no logo, no text should appear in this space. " +
    "Vertical 9:16, premium commercial appearance."
  );
}

export function buildHybridBackgroundNegativePrompt(): string {
  return HYBRID_BACKGROUND_NEGATIVE_TERMS.join(", ");
}

/**
 * Heuristica de placement 100% textual (sem visao): so olha para
 * safeAreaDirection (onde o overlay de texto/preco/CTA vai ficar, ja
 * decidido por overlay-plan.ts) e poe o produto do lado OPOSTO, para nao
 * disputar espaco com o texto. CENTER_CLEAR/NONE/TOP/BOTTOM -> CENTER
 * (comportamento mais seguro quando nao ha lado dedicado).
 */
export function deriveProductPlacement(safeAreaDirection: SafeAreaDirection): ProductPlacement {
  if (safeAreaDirection === "LEFT") return "RIGHT";
  if (safeAreaDirection === "RIGHT") return "LEFT";
  return "CENTER";
}

export type BuildHybridCompositePlanInput = HybridBackgroundPromptInput & {
  productReferenceUrl: string;
  safeAreaDirection: SafeAreaDirection;
  overlayInstructions: OverlayInstructions;
};

export function buildHybridCompositePlan(input: BuildHybridCompositePlanInput): HybridCompositePlan {
  return {
    productReferenceUrl: input.productReferenceUrl,
    backgroundGenerationPrompt: buildHybridBackgroundPrompt(input),
    backgroundNegativePrompt: buildHybridBackgroundNegativePrompt(),
    productPlacement: deriveProductPlacement(input.safeAreaDirection),
    cameraMotion: HYBRID_BACKGROUND_CAMERA_MOTION,
    preserveProductPixels: true,
    overlayInstructions: input.overlayInstructions,
  };
}

// --- Preparacao de arquitetura (SEM persistencia nesta fase) ------------
//
// Formato PRETENDIDO para um futuro historico de resultados de CANARY
// (ver pedido original, item 13) - poderia alimentar decisoes futuras do
// router (ex: "essa classe de produto ja falhou com GENERATIVE, prefira
// HYBRID da proxima vez"). Puro tipo, documentacao como codigo - NAO
// persistido em nenhuma tabela/coluna ainda, nao ha migration nesta
// tarefa, e nada neste arquivo escreve isso em lugar nenhum.
export type CanaryOutcomeRecord = {
  generationStrategy: ProductGenerationStrategy;
  qualityResult: string | null;
  productIntegrityResult: string | null;
  provider: string;
  referenceQuality: ProductReferenceQualityAssessment | null;
  timestamp: string;
};
