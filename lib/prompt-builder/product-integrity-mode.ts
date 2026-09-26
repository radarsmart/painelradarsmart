// Radar Creative AI - Prompt Builder / Product Integrity Mode
//
// Aprendizado do 1o CANARY comercial real (scene-3, Creatina Soldiers
// Nutrition, 2026-08-08): Kling perdeu a integridade visual da embalagem
// (deformacao geometrica, texto do rotulo virando gibberish, conteudo
// fabricado) depois de ~2,5s de um movimento "dolly-in + macro lens".
//
// Este modulo formaliza isso como uma capacidade estrutural GENERICA -
// nao especifica de Creatina/Soldiers/suplementos. Classificacao 100%
// deterministica (sem visao/LLM), usando so sinais que realmente existem
// no pipeline: mediaType da cena, categoria do produto, e a linguagem de
// camera que SERIA usada (calculada por camera-language.ts). Nunca
// inventa um sinal que nao temos (ex: nao tentamos "detectar" se a foto
// tem rotulo - isso exigiria visao computacional).

import type { CameraLens, CameraMovement, SceneMediaType } from "@/lib/prompt-builder/types";
import type { CameraLanguage } from "@/lib/prompt-builder/camera-language";

export type ProductIntegrityRisk = "LOW" | "MEDIUM" | "HIGH";

// PRESERVE_PACKAGE_STRICT (CANARY #3, Invictus, 2026-08-08): PRESERVE_PACKAGE
// sozinho preserva bem a GEOMETRIA (validado 2x - Creatina e Invictus), mas
// nao impede o modelo de "completar" com conteudo inventado (texto/tipografia
// gibberish, cor do produto/liquido derivando) quando a referencia real tem
// regioes ambiguas ou baixa resolucao. STRICT e a mesma base de PRESERVE_PACKAGE
// (mesma camera travada) + uma diretiva extra contra INVENTAR o que a
// referencia nao mostra com clareza. Quem decide promover PRESERVE_PACKAGE ->
// PRESERVE_PACKAGE_STRICT e o Generation Orchestrator (via
// product-reference-quality.ts), nunca este modulo sozinho - o Prompt
// Builder nao tem acesso aos bytes reais da imagem de referencia.
export type ProductIntegrityMode = "STANDARD" | "PRESERVE_PACKAGE" | "PRESERVE_PACKAGE_STRICT";

// Categorias cujo produto tipico e uma embalagem/rotulo denso de texto e
// marca impressa (pote, sache, frasco, caixa pequena) - onde perder a
// integridade do rotulo e mais visivelmente grave. Lista deliberadamente
// pequena e generica (nao especifica de nenhum produto) - crescer aqui
// exige evidencia, nao suposicao.
const HIGH_RISK_PACKAGING_CATEGORIES = new Set(["suplementos", "beleza", "perfumes"]);

// Todas as categorias que o Product Intelligence realmente conhece hoje -
// usado so para decidir "evidencia insuficiente" (categoria desconhecida)
// vs "categoria conhecida e de baixo risco".
const KNOWN_CATEGORIES = new Set([
  "suplementos",
  "perfumes",
  "eletronicos",
  "casa",
  "cozinha",
  "ferramentas",
  "pet",
  "moda",
  "beleza",
  "geral",
]);

// Movimentos de camera que exigem do modelo "reconstruir" perspectiva/
// geometria do produto a partir de uma unica foto 2D - exatamente o que
// causou o morphing observado. PAN/STATIC/HANDHELD nao entram aqui
// porque nao pedem uma mudanca de angulo/profundidade sobre o produto.
const AGGRESSIVE_CAMERA_MOVEMENTS = new Set<CameraMovement>(["DOLLY_IN", "DOLLY_OUT", "ORBIT", "TRACKING", "PRODUCT_360"]);

// So PRODUCT_VIDEO hoje - "IMAGE" generico poderia ser produto OU
// personagem (a diferenciacao so acontece depois, no capability-map do
// Generation Orchestrator), entao deliberadamente nao classificamos
// "IMAGE" aqui para nao arriscar marcar uma cena de personagem como
// risco de integridade de PRODUTO.
const PRODUCT_CENTRIC_MEDIA_TYPES = new Set<SceneMediaType>(["PRODUCT_VIDEO"]);

// Exportado para reuso em product-reference-quality.ts - evita duplicar
// (e arriscar divergir) a mesma decisao de "essa cena tem produto como
// sujeito geometrico" em dois lugares.
export function isProductCentricMediaType(mediaType: SceneMediaType): boolean {
  return PRODUCT_CENTRIC_MEDIA_TYPES.has(mediaType);
}

export type ProductIntegrityClassificationInput = {
  mediaType: SceneMediaType;
  category: string;
  cameraMovement: CameraMovement;
  cameraLens: CameraLens;
};

/**
 * Classificacao PURA e deterministica. Regra:
 * - cena onde o produto nao e o sujeito geometrico (personagem/texto) -> LOW;
 * - categoria de embalagem densa + movimento de camera agressivo -> HIGH;
 * - so um dos dois fatores -> MEDIUM;
 * - categoria desconhecida (sem evidencia suficiente) -> MEDIUM (conservador,
 *   nunca assume LOW por falta de dado);
 * - caso contrario -> LOW.
 */
export function classifyProductIntegrityRisk(input: ProductIntegrityClassificationInput): ProductIntegrityRisk {
  if (!PRODUCT_CENTRIC_MEDIA_TYPES.has(input.mediaType)) {
    return "LOW";
  }

  const categoryIsPackagingHeavy = HIGH_RISK_PACKAGING_CATEGORIES.has(input.category);
  const cameraIsAggressive =
    AGGRESSIVE_CAMERA_MOVEMENTS.has(input.cameraMovement) || input.cameraLens === "MACRO";

  if (categoryIsPackagingHeavy && cameraIsAggressive) return "HIGH";
  if (categoryIsPackagingHeavy || cameraIsAggressive) return "MEDIUM";
  if (!KNOWN_CATEGORIES.has(input.category)) return "MEDIUM";
  return "LOW";
}

export function resolveProductIntegrityMode(risk: ProductIntegrityRisk): ProductIntegrityMode {
  return risk === "HIGH" ? "PRESERVE_PACKAGE" : "STANDARD";
}

/**
 * Substitui a linguagem de camera por uma variante segura quando o risco
 * e HIGH - nunca 3D rotation/orbit/turntable/perspective change/dolly
 * dramatico. Preserva a iluminacao ja resolvida por purpose (evoluir luz
 * continua permitido, so a geometria da camera fica travada). Para
 * risco != HIGH, devolve a linguagem original sem alteracao.
 */
export function applyProductIntegrityCameraOverride(
  base: CameraLanguage,
  risk: ProductIntegrityRisk,
): CameraLanguage {
  if (risk !== "HIGH") return base;

  return {
    camera: "STATIC",
    lens: "NORMAL",
    framing: "clean stable framing, product fully and consistently in frame",
    movement:
      "camera locked off, at most an extremely subtle push-in - no rotation, no orbit, no perspective change",
    lighting: base.lighting,
  };
}

// Direcao POSITIVA explicita para HIGH integrity - nao e so mais uma
// linha no negative prompt, e uma instrucao ativa de como filmar.
export const PRODUCT_INTEGRITY_DIRECTIVE =
  "The product package remains completely stationary and geometrically unchanged throughout the shot. " +
  "Preserve the exact original package, label, typography, logo, colors, proportions and printed artwork " +
  "from the input image. Do not rotate or reinterpret the product. All cinematic motion should occur only " +
  "through subtle lighting, depth of field and environmental movement.";

// Guardrails negativos ESPECIFICOS do que observamos falhar no canary
// real - complementam (nunca substituem) os guardrails gerais de
// negative-prompt.ts.
export const PRODUCT_INTEGRITY_NEGATIVE_GUARDRAILS = [
  "package morphing",
  "label mutation",
  "text mutation",
  "gibberish text",
  "invented packaging artwork",
  "altered logo",
  "altered typography",
  "package deformation",
  "perspective distortion",
  "product transformation",
  "invented label imagery",
  "replacement graphics",
];

// --- PRESERVE_PACKAGE_STRICT --------------------------------------------
//
// Aprendizado do CANARY #3 (Invictus, referencia 343x500): mesmo com
// PRESERVE_PACKAGE, o modelo fabricou texto/tipografia inexistente no
// vidro e deixou a cor do liquido derivar sob luz quente. A diferenca
// para PRODUCT_INTEGRITY_DIRECTIVE e o alvo da instrucao: aquela pede pra
// nao DEFORMAR o que existe; esta pede pra nao INVENTAR o que a
// referencia nao mostra com clareza (texto/simbolo/marca/cor). Generica -
// nunca menciona um produto especifico.
export const PRODUCT_INTEGRITY_STRICT_DIRECTIVE =
  "Preserve only visual product details that are clearly present in the input reference. Do not " +
  "reconstruct, complete, infer or invent text, symbols, branding, artwork or markings that are not " +
  "clearly visible in the source image. Ambiguous or unreadable regions must remain visually neutral " +
  "and consistent with the source rather than being synthesized into new details. Preserve the exact " +
  "visible product colors, material appearance, transparency, liquid color, reflections and surface " +
  "characteristics from the input image throughout the entire shot. Lighting changes must not alter " +
  "the perceived intrinsic color of the product.";

// "product transformation" ja existe em PRODUCT_INTEGRITY_NEGATIVE_GUARDRAILS
// (aplicado sempre que STRICT se aplica, ja que STRICT so existe em cima de
// HIGH) - nao duplicado aqui de proposito.
export const PRODUCT_INTEGRITY_STRICT_NEGATIVE_GUARDRAILS = [
  "invented text",
  "reconstructed text",
  "hallucinated typography",
  "invented symbols",
  "invented branding",
  "invented markings",
  "fabricated label details",
  "color drift",
  "product color shift",
  "liquid color change",
  "material transformation",
  "reflection-induced color change",
  "hallucinated product details",
];

/**
 * Aplica a promocao STRICT em cima de um positivePrompt/negativePrompt JA
 * montados pelo Prompt Builder (para uma cena HIGH/PRESERVE_PACKAGE) - so
 * concatenacao de texto pura, nunca reconstroi o prompt do zero. Quem
 * decide QUANDO chamar isso e o Generation Orchestrator, que e o unico
 * lugar com acesso as dimensoes reais da imagem de referencia (ver
 * lib/generation-orchestrator/product-reference-quality.ts) - o Prompt
 * Builder nunca sabe sozinho que uma cena precisa de STRICT.
 */
export function upgradeToStrictIntegrityPrompt(
  positivePrompt: string,
  negativePrompt: string,
): { positivePrompt: string; negativePrompt: string } {
  return {
    positivePrompt: `${positivePrompt} ${PRODUCT_INTEGRITY_STRICT_DIRECTIVE}`,
    negativePrompt: `${negativePrompt}, ${PRODUCT_INTEGRITY_STRICT_NEGATIVE_GUARDRAILS.join(", ")}`,
  };
}
