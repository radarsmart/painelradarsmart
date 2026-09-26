// Radar Creative AI - Prompt Builder / Product Fidelity Requirement
//
// Aprendizado do CREATIVE V2 HOOK CANARY real (Kokeshi, scene-1, 2026-08-10):
// o roteamento de capability so olhava para ScenePurpose (resolveMediaType em
// scene-prompt.ts). Uma cena HOOK com HERO_PRODUCT_REVEAL (produto real como
// heroi desde o segundo 0, decidido pelo Creative Director V2) caia em
// TEXT_TO_VIDEO/WAN so por ser HOOK - uma capability sem NENHUM campo de
// referencia de imagem no payload. O resultado real: WAN executou a
// linguagem visual corretamente (escala, camera, ambiente), mas inventou
// completamente o produto/embalagem/rotulo. CREATIVE_DIRECTION_VALIDATION
// passou; PROVIDER_CAPABILITY_FIT falhou.
//
// Este modulo formaliza a exigencia de fidelidade de produto como um
// conceito EXPLICITO e SEPARADO de ScenePurpose - para que o roteamento de
// capability (resolveMediaType, scene-prompt.ts) e o Fidelity Gate
// (lib/generation-orchestrator/capability-fidelity-gate.ts) parem de
// depender so de purpose e passem a considerar a semantica visual real da
// cena (Creative Director V2, quando disponivel).

import type { ScenePurpose } from "@/lib/commercial-director/types";

export type ProductFidelityRequirement = "NONE" | "OPTIONAL" | "REQUIRED" | "STRICT";

// Purposes que o Prompt Builder (V1, resolveMediaType) SEMPRE mapeia para
// mediaType PRODUCT_VIDEO, independente de qualquer hint - mesma lista
// conceitual de capability-map.ts/product-integrity-mode.ts, duplicada de
// proposito (cada modulo responde uma pergunta diferente: aquele decide
// capability final, este decide EXIGENCIA de fidelidade).
const PURPOSE_ALWAYS_PRODUCT_VIDEO: ScenePurpose[] = ["PRODUCT", "BENEFIT", "OFFER", "CTA"];

// Sinais OPCIONAIS do Creative Director V2 (SceneBlueprintV2.productRole/
// subjectPriority, lib/creative-director-v2/types.ts) - tipados aqui como
// uniao de string literal PURA (nao importados de creative-director-v2) para
// nao criar uma dependencia reversa (creative-director-v2 ja depende de
// prompt-builder, nunca o contrario). Os valores literais sao os mesmos,
// entao passar um ProductRole/SubjectPriority real de V2 aqui funciona por
// tipagem estrutural, sem import nenhum.
export type SceneProductRoleHint = "NONE" | "HERO" | "SUPPORTING" | "BACKGROUND";
export type SceneSubjectPriorityHint = "PRODUCT" | "CHARACTER" | "TEXT_OVERLAY" | "ENVIRONMENT";

export type ProductFidelityRequirementInput = {
  purpose: ScenePurpose;
  // Mesma prioridade MAXIMA que resolveMediaType ja da a personagem
  // (scene.identityReferenceAssetId) sobre QUALQUER outra decisao -
  // inclusive sobre as 4 purposes "sempre REQUIRED" abaixo. Uma cena de
  // CTA/OFFER com a Garota Radar (CHARACTER_VIDEO) transmite oferta/produto
  // pela PERFORMANCE do personagem, nunca por uma referencia visual direta
  // de produto - isso e o comportamento V1 LEGADO real (CHARACTER_VIDEO
  // nunca exigiu productReferenceUrl), nao uma excecao nova.
  hasCharacterPresenter?: boolean;
  // Ausentes = campanha V1 (sem Creative Director V2) - comportamento
  // LEGADO preservado exatamente (ver regra abaixo).
  productRoleV2?: SceneProductRoleHint;
  subjectPriorityV2?: SceneSubjectPriorityHint;
};

/**
 * Deriva a EXIGENCIA de fidelidade de produto de uma cena - NUNCA a partir
 * so de ScenePurpose (pedido explicito do item 3: "nao usar apenas
 * purpose"). Regras, nesta ordem:
 *
 * 1. purpose em PRODUCT/BENEFIT/OFFER/CTA -> REQUIRED sempre. Isso e
 *    comportamento V1 LEGADO preservado: essas 4 purposes ja sempre
 *    mapeavam para mediaType PRODUCT_VIDEO (resolveMediaType,
 *    scene-prompt.ts) antes desta tarefa existir - so estamos dando um
 *    NOME explicito a uma exigencia que ja existia implicitamente. Ausencia
 *    de referencia real continua virando BLOCKED_REFERENCE_QUALITY mais
 *    adiante (product-generation-strategy.ts) - nunca fallback silencioso
 *    para TEXT_TO_VIDEO.
 * 2. purpose fora dessa lista (HOOK/PROBLEM/PROOF) + productRoleV2==="HERO"
 *    -> REQUIRED. So quando o Creative Director V2 decidiu explicitamente
 *    que o produto e HEROI real do quadro (ver
 *    decision-engine/scene-subject-direction.ts) - nunca por "estar no
 *    HOOK" sozinho.
 * 3. productRoleV2==="SUPPORTING" -> OPTIONAL (produto visivel mas nao
 *    heroi - nao bloqueia TEXT_TO_VIDEO, mas sinaliza que uma capability
 *    com referencia seria preferivel se disponivel sem custo extra).
 * 4. Caso contrario -> NONE (comportamento V1 legado: TEXT_TO_VIDEO
 *    permanece permitido, exatamente como sempre foi para HOOK/PROBLEM/
 *    PROOF ate esta tarefa).
 *
 * 0. (checada ANTES de tudo) hasCharacterPresenter=true -> NONE sempre,
 *    mesmo para PRODUCT/BENEFIT/OFFER/CTA - mesma prioridade que
 *    resolveMediaType ja da a CHARACTER_VIDEO.
 *
 * STRICT NUNCA e retornado por esta funcao - e uma promocao posterior,
 * feita pelo Generation Orchestrator com base na qualidade REAL da
 * referencia (ver promoteProductFidelityRequirementByReferenceQuality
 * abaixo), no mesmo espirito de PRESERVE_PACKAGE -> PRESERVE_PACKAGE_STRICT
 * em product-reference-quality.ts. O Prompt Builder nao tem acesso aos
 * bytes da imagem real, entao nunca decide STRICT sozinho.
 */
export function deriveProductFidelityRequirement(input: ProductFidelityRequirementInput): ProductFidelityRequirement {
  if (input.hasCharacterPresenter) return "NONE";

  if (PURPOSE_ALWAYS_PRODUCT_VIDEO.includes(input.purpose)) {
    return "REQUIRED";
  }

  if (input.productRoleV2 === "HERO") return "REQUIRED";
  if (input.productRoleV2 === "SUPPORTING") return "OPTIONAL";
  return "NONE";
}

export function isProductReferenceRequired(requirement: ProductFidelityRequirement): boolean {
  return requirement === "REQUIRED" || requirement === "STRICT";
}

/**
 * Promocao STRICT - mesmo padrao de recommendIntegrityMode
 * (product-reference-quality.ts): so promove REQUIRED -> STRICT quando a
 * referencia real disponivel tem fidelityRisk HIGH (imagem pequena e/ou
 * categoria associada a embalagem complexa). NONE/OPTIONAL nunca sao
 * promovidos (uma cena que nao exige fidelidade nao fica mais exigente so
 * porque a referencia e ruim - a decisao de exigir ja foi tomada antes).
 */
export function promoteProductFidelityRequirementByReferenceQuality(
  requirement: ProductFidelityRequirement,
  fidelityRisk: "LOW" | "MEDIUM" | "HIGH" | null,
): ProductFidelityRequirement {
  if (requirement !== "REQUIRED") return requirement;
  return fidelityRisk === "HIGH" ? "STRICT" : requirement;
}
