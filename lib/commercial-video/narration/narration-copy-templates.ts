// Radar Creative AI - Narration Script Builder / Copy Templates
//
// PURO - gera, por purpose, uma LISTA ORDENADA de candidatos de fala (do
// mais completo pro mais curto), usando SOMENTE dados ja calculados em
// outra fase (overlayInstructions, CommercialDirection, offer,
// productIntelligence). Nunca inventa preco/desconto/rating/beneficio -
// quando o dado necessario nao existe, devolve [] (o Script Builder
// interpreta lista vazia como BLOCKED_MISSING_DATA).
//
// Estilo de fala (Garota Radar): brasileira, natural, conversacional,
// "pessoa real contando uma descoberta pra alguem" - nunca linguagem de
// locutor/telemarketing, nunca superlativos vazios ("incrivel",
// "imperdivel") que nao vem de nenhum dado real.

import type { CommercialDirection, ScenePurpose } from "@/lib/commercial-director/types";
import type { SceneGenerationPrompt } from "@/lib/prompt-builder/types";
import type { NarrationOfferData, NarrationProductData } from "@/lib/commercial-video/narration/types";

function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function ensureTrailingPeriod(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

// Desconto so e "real" pra fins de narracao quando e um numero positivo
// conhecido - 0/negativo/null nunca vira claim de desconto, mesmo que um
// texto de overlay pre-renderizado (ex: "0% OFF") exista para fins
// visuais. Funcao GENERICA (nao especifica de nenhum produto/categoria) -
// usada por qualquer template que mencione desconto.
function hasRealDiscount(direction: CommercialDirection): boolean {
  const discountPercent = direction.offerStrategy.discountPercent;
  return discountPercent !== null && discountPercent > 0;
}

function hookCandidates(direction: CommercialDirection): string[] {
  const discountPercent = direction.offerStrategy.discountPercent;

  if (direction.hookStrategy === "PRICE_SHOCK" && hasRealDiscount(direction)) {
    return [
      `Encontrei ${discountPercent}% de desconto nessa oferta.`,
      `Tem ${discountPercent}% off nessa oferta.`,
      `Olha esse desconto que eu encontrei.`,
    ];
  }

  return ["Olha essa oferta que eu encontrei.", "Encontrei uma oferta interessante.", "Olha isso aqui."];
}

function productCandidates(): string[] {
  // Deliberadamente generico - o titulo cru da oferta vem de marketplace
  // (SEO, muito longo pra fala natural) e nunca e falado diretamente.
  return ["Olha só esse produto.", "Repara nesse produto.", "É esse aqui."];
}

function benefitCandidates(product: NarrationProductData | null): string[] {
  const benefit = product?.keyBenefits?.[0];
  if (!benefit) return [];

  const clean = capitalizeFirst(benefit.trim());
  return [
    `O diferencial aqui é ${benefit.trim()}.`,
    `Um ponto forte: ${benefit.trim()}.`,
    ensureTrailingPeriod(clean),
  ];
}

function proofCandidates(offer: NarrationOfferData): string[] {
  if (offer.rating !== null) {
    return [`Esse produto tem nota ${offer.rating} no marketplace.`, `Nota ${offer.rating} no marketplace.`];
  }
  if (offer.reviewsCount !== null) {
    return [`Esse produto já tem ${offer.reviewsCount} avaliações.`, `Já são ${offer.reviewsCount} avaliações.`];
  }
  return [];
}

function offerCandidates(scene: SceneGenerationPrompt, direction: CommercialDirection): string[] {
  if (direction.offerStrategy.priceReveal === "HIDE_PRICE") {
    return ["Essa oferta vale a pena conferir."];
  }

  const priceText = scene.overlayInstructions.priceText;
  // scene.overlayInstructions.discountText e um texto JA RENDERIZADO pro
  // overlay VISUAL (pode ser "0% OFF" mesmo sem desconto real, so pra
  // manter o layout) - a narracao nunca pode confiar nele sozinho. So usa
  // esse texto quando o desconto de verdade existe (numero > 0 na
  // CommercialDirection, ver hasRealDiscount) - nunca inventa um claim de
  // desconto que nao existe.
  const discountText = hasRealDiscount(direction) ? scene.overlayInstructions.discountText : null;

  if (priceText && discountText) {
    return [
      `Com ${discountText}, sai por ${priceText}.`,
      `Ficou por ${priceText}.`,
      `${discountText} agora.`,
    ];
  }
  if (priceText) {
    return [`Ficou por ${priceText}.`, `Sai por ${priceText}.`];
  }
  if (discountText) {
    return [`Tem ${discountText} agora.`, `${discountText} agora.`];
  }
  return [];
}

// Reducao MECANICA de uma frase ja oficial/aprovada (nunca uma
// parafrase criativa nova) - corta na primeira conjuncao coordenativa " e "
// e preserva so a primeira oracao, sempre terminando em ponto. Existe
// porque BRAND_CTA_LINE (a linha oficial completa) e longa demais pra
// caber em janelas curtas de CTA (~3s) - ver relatorio.
function mechanicallyShorten(text: string): string | null {
  const idx = text.indexOf(" e ");
  if (idx <= 0) return null;
  const firstClause = text.slice(0, idx).trim();
  return ensureTrailingPeriod(firstClause);
}

function ctaCandidates(scene: SceneGenerationPrompt): string[] {
  const ctaText = scene.overlayInstructions.ctaText;
  if (!ctaText) return [];

  const candidates = [ctaText];
  const shortened = mechanicallyShorten(ctaText);
  if (shortened && shortened !== ctaText) candidates.push(shortened);

  return candidates;
}

export function generateCandidatesForScene(
  scene: SceneGenerationPrompt,
  direction: CommercialDirection,
  offer: NarrationOfferData,
  product: NarrationProductData | null,
): string[] {
  const purpose: ScenePurpose = scene.purpose;

  switch (purpose) {
    case "HOOK":
      return hookCandidates(direction);
    case "PRODUCT":
      return productCandidates();
    case "BENEFIT":
      return benefitCandidates(product);
    case "PROOF":
      return proofCandidates(offer);
    case "OFFER":
      return offerCandidates(scene, direction);
    case "CTA":
      return ctaCandidates(scene);
    case "PROBLEM":
      // Sem dado estruturado de "dor" disponivel nesta fase (primaryPain
      // vive so em CommercialDirectorInput, nao persistido na direction) -
      // BLOCKED_MISSING_DATA e mais honesto que inventar uma dor generica.
      return [];
    default:
      return [];
  }
}
