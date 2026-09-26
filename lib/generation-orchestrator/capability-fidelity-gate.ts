// Radar Creative AI - Generation Orchestrator / Capability Fidelity Gate
//
// Item 9 do pedido SUBJECT-AWARE CAPABILITY ROUTING V1: ultima linha de
// defesa, DEPOIS de mediaType/capability/estrategia ja terem sido
// decididos (scene-execution-plan.ts) - bloqueia ANTES de qualquer chamada
// paga se a cena exige fidelidade real de produto (REQUIRED/STRICT) mas a
// capability finalmente selecionada nao aceita nenhuma referencia real
// (ver capability-fidelity-matrix.ts).
//
// Deliberadamente INDEPENDENTE de como chegamos ate aqui: mesmo que
// scene-prompt.ts#resolveMediaType (a correcao primaria desta tarefa) va
// ter parado a maioria dos casos antes, este gate protege contra
// regressoes futuras ou combinacoes de purpose/hint ainda nao previstas -
// nunca promove a cena para outra capability sozinho, so reporta o
// bloqueio (quem decide a capability certa continua sendo o roteamento em
// scene-prompt.ts/capability-map.ts).
//
// Excecao deliberada: HYBRID_PRODUCT_COMPOSITE. Sob HYBRID a capability
// REAL enviada ao provider generativo e TEXT_TO_VIDEO (so o fundo, nunca
// descreve o produto - ver product-generation-strategy.ts), mas o produto
// real e preservado por composicao local (pixels intactos, nunca
// reenviados a um gerador) - esse e o UNICO caso legitimo onde
// REQUIRED/STRICT convive com uma capability que nao aceita referencia.

import { CAPABILITY_PRODUCT_REFERENCE_SUPPORT } from "@/lib/generation-orchestrator/capability-fidelity-matrix";
import { isProductReferenceRequired } from "@/lib/prompt-builder/product-fidelity-requirement";
import type { ProductFidelityRequirement } from "@/lib/prompt-builder/product-fidelity-requirement";
import type { GenerationCapability } from "@/lib/generation-orchestrator/types";

export type CapabilityFidelityFitInput = {
  productFidelityRequirement: ProductFidelityRequirement;
  capability: GenerationCapability;
  // true quando productGenerationStrategy === "HYBRID_PRODUCT_COMPOSITE"
  // (ver product-generation-strategy.ts) - unica excecao legitima.
  isHybridComposite: boolean;
};

export type CapabilityFidelityFitResult = { ok: true } | { ok: false; reason: string };

export function evaluateCapabilityFidelityFit(input: CapabilityFidelityFitInput): CapabilityFidelityFitResult {
  if (!isProductReferenceRequired(input.productFidelityRequirement)) return { ok: true };
  if (input.isHybridComposite) return { ok: true };

  const support = CAPABILITY_PRODUCT_REFERENCE_SUPPORT[input.capability];
  if (support.acceptsProductReference) return { ok: true };

  return {
    ok: false,
    reason:
      `Cena exige fidelidade de produto "${input.productFidelityRequirement}" mas a capability selecionada ` +
      `"${input.capability}" nao aceita nenhuma referencia real de produto (ver capability-fidelity-matrix.ts: ${support.notes}) - ` +
      "bloqueado antes de qualquer chamada paga. Nunca gerar o produto por texto puro.",
  };
}
