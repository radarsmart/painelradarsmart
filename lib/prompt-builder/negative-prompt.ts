// Radar Creative AI - Prompt Builder / Negative Prompt
//
// Guardrails sempre presentes + condicionais por presenca de personagem.
// Inclui, de proposito, uma barreira extra contra o modelo desenhar
// preco/CTA/logo (alem de simplesmente nao pedir isso no prompt positivo -
// ver lib/prompt-builder/overlay-plan.ts).

import { buildProductIntegrityGuardrails } from "@/lib/prompt-builder/product-prompt";
import { PRODUCT_INTEGRITY_NEGATIVE_GUARDRAILS } from "@/lib/prompt-builder/product-integrity-mode";
import type { ProductIntegrityRisk } from "@/lib/prompt-builder/product-integrity-mode";

const BASE_GUARDRAILS = [
  "distorted hands",
  "extra fingers",
  "duplicated objects",
  "low resolution",
  "blurry",
  "watermark",
  "random logos",
  "illegible text",
];

const CHARACTER_GUARDRAILS = [
  "warped face",
  "inconsistent identity",
  "asymmetrical eyes",
  "oversaturated skin",
  "plastic skin",
  "uncanny face",
];

// Nunca deixar o modelo desenhar preco/desconto/CTA/logo - esses
// elementos sao sempre aplicados depois pelo compositor (ver
// overlay-plan.ts e o campo overlayInstructions).
const TEXT_AND_BRAND_GUARDRAILS = [
  "rendered price numbers",
  "rendered discount percentage",
  "rendered call-to-action text",
  "rendered Radar Smart logo",
  "any generated brand logo",
];

export function buildNegativePrompt(
  hasCharacter: boolean,
  productIntegrityRisk: ProductIntegrityRisk = "LOW",
): string {
  const guardrails = [
    ...BASE_GUARDRAILS,
    ...(hasCharacter ? CHARACTER_GUARDRAILS : []),
    ...buildProductIntegrityGuardrails(),
    // So entram quando o risco e HIGH - aprendizado do canary real
    // (scene-3, Creatina): morphing/gibberish/artwork inventado no
    // rotulo depois de movimento de camera agressivo. Ver
    // product-integrity-mode.ts.
    ...(productIntegrityRisk === "HIGH" ? PRODUCT_INTEGRITY_NEGATIVE_GUARDRAILS : []),
    ...TEXT_AND_BRAND_GUARDRAILS,
  ];

  return guardrails.join(", ");
}
