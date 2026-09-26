// Radar Creative AI - Generation Orchestrator / Capability Fidelity Matrix
//
// Item 5 do pedido SUBJECT-AWARE CAPABILITY ROUTING V1: matriz EXPLICITA e
// centralizada de quais GenerationCapability aceitam uma referencia real de
// produto no payload. Nao inventa nenhuma capacidade nova - reflete o que
// ja foi inspecionado nos adapters reais (ver provider-capabilities.ts,
// campo supportsProductReference por provider) e na documentacao oficial de
// cada endpoint (wan-2-5-t2v: body sem NENHUM campo de imagem - confirmado
// em docs.magnific.com/api-reference/text-to-video/wan-2-5-t2v-1080p e no
// adapter lib/generation-orchestrator/adapters/wan-2-5-text-to-video.ts).
//
// Aprendizado do CREATIVE V2 HOOK CANARY real (Kokeshi, 2026-08-10): WAN
// (TEXT_TO_VIDEO) executou a linguagem visual corretamente mas inventou o
// produto - porque nao existe NENHUM campo de referencia de imagem no
// payload, nao porque o modelo "errou". Isso e uma limitacao ESTRUTURAL da
// capability, nao um problema pontual de prompt - por isso vive numa matriz
// centralizada, nao espalhado em heuristicas.

import type { GenerationCapability } from "@/lib/generation-orchestrator/types";

export type CapabilityProductReferenceSupport = {
  // true quando a capability tem pelo menos um caminho real e ja
  // implementado (nesta base de codigo) de receber uma imagem de
  // referencia do produto no payload do provider.
  acceptsProductReference: boolean;
  // true quando, alem de aceitar referencia, a capability ja foi validada
  // (por CANARY real) a preservar geometria/rotulo com preservacao forte
  // (PRESERVE_PACKAGE/PRESERVE_PACKAGE_STRICT) - nunca true so por aceitar
  // o campo no payload.
  supportsStrictProductFidelity: boolean;
  notes: string;
};

export const CAPABILITY_PRODUCT_REFERENCE_SUPPORT: Record<GenerationCapability, CapabilityProductReferenceSupport> = {
  TEXT_TO_IMAGE: {
    acceptsProductReference: false,
    supportsStrictProductFidelity: false,
    notes: "Puramente gerativo a partir de texto - nenhum provider registrado aceita imagem de entrada nesta capability.",
  },
  IMAGE_TO_IMAGE: {
    acceptsProductReference: true,
    supportsStrictProductFidelity: true,
    notes: "openai-image-edit aceita imagem(ns) de referencia real (image[]) com input_fidelity alto.",
  },
  TEXT_TO_VIDEO: {
    acceptsProductReference: false,
    supportsStrictProductFidelity: false,
    notes:
      "wan-2-5-t2v: payload documentado (prompt/negative_prompt/duration/seed/webhook_url) nao tem NENHUM campo de " +
      "imagem - confirmado no CANARY real do HOOK Kokeshi (2026-08-10), onde o produto foi completamente " +
      "fabricado. Escopo oficial do provider ja restringe isso a backgrounds sem produto/personagem (ver " +
      "provider-capabilities.ts).",
  },
  IMAGE_TO_VIDEO: {
    acceptsProductReference: true,
    supportsStrictProductFidelity: true,
    notes: "freepik-kling-i2v anima uma imagem de entrada real - varios CANARYs reais validaram preservacao de embalagem (Creatina, Invictus).",
  },
  CHARACTER_IMAGE: {
    acceptsProductReference: false,
    supportsStrictProductFidelity: false,
    notes: "Referencia usada e de IDENTIDADE (personagem), nao de produto - fora do escopo desta matriz.",
  },
  CHARACTER_VIDEO: {
    acceptsProductReference: false,
    supportsStrictProductFidelity: false,
    notes: "heygen-image-avatar/freepik-omnihuman recebem imagem de IDENTIDADE + audio - nenhum campo de referencia de produto.",
  },
  PRODUCT_IMAGE: {
    acceptsProductReference: true,
    supportsStrictProductFidelity: true,
    notes: "openai-image-edit (mesmo adapter de CHARACTER_IMAGE) aceita imagem de referencia real do produto.",
  },
  PRODUCT_VIDEO: {
    acceptsProductReference: true,
    supportsStrictProductFidelity: true,
    notes: "freepik-kling-i2v registrado tambem para PRODUCT_VIDEO - mesmo caminho real de IMAGE_TO_VIDEO, ja validado por CANARY.",
  },
};

export function capabilityAcceptsProductReference(capability: GenerationCapability): boolean {
  return CAPABILITY_PRODUCT_REFERENCE_SUPPORT[capability].acceptsProductReference;
}
