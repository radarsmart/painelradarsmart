// Radar Creative AI - Prompt Builder / Product Integrity
//
// Fonte unica das regras de integridade do produto - usada tanto no
// descritor positivo (curto) quanto nos guardrails do negative prompt
// (lib/prompt-builder/negative-prompt.ts importa daqui, nao duplica).
//
// Item 10 do pedido SUBJECT-AWARE CAPABILITY ROUTING V1: o CREATIVE V2 HOOK
// CANARY real (Kokeshi, scene-1, 2026-08-10) encontrou um bug real aqui - o
// descritor dizia "shown exactly as provided" mesmo quando a cena ia para
// WAN TEXT_TO_VIDEO, uma capability que NAO recebe nenhuma imagem no
// payload. A frase e uma promessa estruturalmente impossivel nesse caso.
// hasProductReferenceCapability reflete se o mediaType/capability final da
// cena de fato tem um caminho real de receber a referencia (ver
// capability-fidelity-matrix.ts) - nunca se a URL especifica resolveu
// (isso e responsabilidade de BLOCKED_REFERENCE_QUALITY, um bloqueio
// separado).

export function buildProductPositiveDescriptor(productTitle: string, hasProductReferenceCapability: boolean): string {
  if (hasProductReferenceCapability) {
    return `The real product "${productTitle}", shown exactly as provided (same packaging, color, model and accessories)`;
  }
  return `The product "${productTitle}" (no real product reference image is provided to the generator for this scene - exact packaging, label and color are not guaranteed to match the real product)`;
}

export function buildProductIntegrityGuardrails(): string[] {
  return [
    "altered brand",
    "altered product packaging",
    "invented product features",
    "invented accessories",
    "wrong product color",
    "wrong product model",
    "fake text on packaging",
  ];
}
