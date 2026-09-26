// Radar Creative AI - Prompt Builder / Overlay Plan
//
// Decide o que entra como OVERLAY (aplicado depois pelo compositor) e
// nunca no prompt visual - preco, desconto e CTA nunca sao pedidos ao
// provider (ver negative-prompt.ts para a barreira complementar).

import type { CtaStrategy, OfferStrategy, ScenePurpose } from "@/lib/commercial-director/types";
import type { OverlayInstructions, SafeAreaDirection } from "@/lib/prompt-builder/types";

function formatPriceBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export type OverlayPlanInput = {
  purpose: ScenePurpose;
  offerStrategy: OfferStrategy;
  ctaStrategy: CtaStrategy;
  hasCharacterInScene: boolean;
};

export type OverlayPlanResult = {
  overlayInstructions: OverlayInstructions;
  safeAreaDirection: SafeAreaDirection;
  brandOverlayRequired: boolean;
};

export function buildOverlayPlan(input: OverlayPlanInput): OverlayPlanResult {
  const overlayInstructions: OverlayInstructions = {
    priceText: null,
    discountText: null,
    ctaText: null,
  };

  // HOOK nunca recebe overlay de preco aqui, mesmo quando o gatilho e
  // "choque de preco" - o CHOQUE e um conceito visual (expressao/gesto),
  // os digitos do preco so aparecem na cena de OFFER.
  if (input.purpose === "OFFER" && input.offerStrategy.priceReveal !== "HIDE_PRICE") {
    if (input.offerStrategy.currentPrice !== null) {
      overlayInstructions.priceText = formatPriceBRL(input.offerStrategy.currentPrice);
    }
    // Bug real confirmado na validacao do Creative Director V2
    // (2026-08-10): discount_pct=0 (nao null, um desconto que existe na
    // coluna mas nao e real) gerava overlay "0% OFF". Mesma regra ja usada
    // em narration-copy-templates.ts (hasRealDiscount) - so existe desconto
    // pra mostrar quando > 0.
    if (input.offerStrategy.discountPercent !== null && input.offerStrategy.discountPercent > 0) {
      overlayInstructions.discountText = `${input.offerStrategy.discountPercent}% OFF`;
    }
  }

  if (input.purpose === "CTA") {
    overlayInstructions.ctaText = input.ctaStrategy.ctaText;
  }

  const brandOverlayRequired = input.purpose === "CTA";

  let safeAreaDirection: SafeAreaDirection = "NONE";
  if (input.hasCharacterInScene) {
    // Convencao: a presenter ocupa o terco direito do quadro, deixando a
    // esquerda livre pra texto/preco/CTA entrar por cima depois.
    safeAreaDirection = "LEFT";
  } else if (input.purpose === "OFFER") {
    safeAreaDirection = "BOTTOM";
  } else if (input.purpose === "CTA") {
    safeAreaDirection = "CENTER_CLEAR";
  }

  return { overlayInstructions, safeAreaDirection, brandOverlayRequired };
}
