// Radar Creative AI - Creative Director V2 / Creative Concept
//
// Decide o conceito criativo central da campanha ANTES de qualquer decisao
// tecnica. Puro, deterministico, sem LLM - mesmo estilo de
// lib/commercial-director/hook-selector.ts. Nunca hardcoda por produto
// especifico: deriva so de sellingArgument/hookStrategy/storyStructure/
// discountPct, que ja vem de dados reais (offer + Product Intelligence).

import type { CommercialDirection, CommercialDirectorInput } from "@/lib/commercial-director/types";
import type { AudienceIntent, CreativeConcept, EmotionalAngle } from "@/lib/creative-director-v2/types";

const HIGH_DISCOUNT_THRESHOLD = 30;

export function selectCreativeConcept(
  direction: CommercialDirection,
  input: CommercialDirectorInput,
): { concept: CreativeConcept; reason: string } {
  if (direction.hookStrategy === "PRICE_SHOCK" || (input.discountPct ?? 0) >= HIGH_DISCOUNT_THRESHOLD) {
    return { concept: "IRRESISTIBLE_PRICE", reason: "desconto real alto disponivel - o preco e o conceito mais forte" };
  }

  if (direction.hookStrategy === "TRANSFORMATION") {
    return { concept: "VISUAL_TRANSFORMATION", reason: "gancho de transformacao pede um conceito de antes/depois" };
  }

  if (direction.storyStructure === "COMPARISON") {
    return { concept: "SMART_COMPARISON", reason: "estrutura de comparacao pede um conceito de comparacao inteligente" };
  }

  if (direction.storyStructure === "DEMONSTRATION") {
    return { concept: "QUICK_DEMONSTRATION", reason: "estrutura de demonstracao pede um conceito de demonstracao rapida" };
  }

  if (direction.storyStructure === "PROBLEM_SOLUTION") {
    return { concept: "PROBLEM_SOLUTION", reason: "estrutura problema->solucao ja e o proprio conceito" };
  }

  if (direction.sellingArgument === "SOCIAL_PROOF") {
    return { concept: "VISUAL_PROOF", reason: "argumento de prova social disponivel - conceito de prova visual" };
  }

  if (direction.sellingArgument === "EXCLUSIVITY") {
    return { concept: "ACCESSIBLE_LUXURY", reason: "argumento de exclusividade pede um conceito de luxo acessivel" };
  }

  if (direction.sellingArgument === "EMOTIONAL_BENEFIT") {
    return { concept: "ASPIRATIONAL_LIFESTYLE", reason: "beneficio emocional funciona melhor com lifestyle aspiracional" };
  }

  if (direction.hookStrategy === "CURIOSITY" || direction.hookStrategy === "DISCOVERY") {
    return { concept: "SURPRISING_DISCOVERY", reason: "gancho de curiosidade/descoberta ja aponta pro conceito de descoberta surpreendente" };
  }

  return { concept: "TREND_DESIRE", reason: "fallback: nenhum sinal forte disponivel - conceito de tendencia/desejo generico" };
}

export function selectAudienceIntent(input: CommercialDirectorInput): { intent: AudienceIntent; reason: string } {
  if ((input.discountPct ?? 0) >= HIGH_DISCOUNT_THRESHOLD) {
    return { intent: "IMPULSE", reason: "desconto alto real favorece decisao por impulso" };
  }

  if (input.primaryObjection) {
    return { intent: "CONSIDERED", reason: "ha objecao real mapeada - publico pesa a decisao antes de comprar" };
  }

  if (input.category === "beleza" || input.category === "moda" || input.category === "perfumes") {
    return { intent: "ASPIRATIONAL", reason: `categoria "${input.category}" tende a compra aspiracional` };
  }

  if (input.primaryPain) {
    return { intent: "PROBLEM_SOLVING", reason: "ha dor real mapeada pelo Product Intelligence" };
  }

  return { intent: "CONSIDERED", reason: "fallback: sem sinal forte de impulso/aspiracao - tratar como compra considerada" };
}

export function selectEmotionalAngle(direction: CommercialDirection): { angle: EmotionalAngle; reason: string } {
  if (direction.hookStrategy === "PRICE_SHOCK") {
    return { angle: "URGENCY", reason: "choque de preco pede urgencia emocional" };
  }

  if (direction.hookStrategy === "TRANSFORMATION") {
    return { angle: "ASPIRATION", reason: "transformacao pede aspiracao" };
  }

  if (direction.hookStrategy === "CURIOSITY" || direction.hookStrategy === "DISCOVERY" || direction.hookStrategy === "QUESTION") {
    return { angle: "CURIOSITY", reason: "gancho de curiosidade mantem o angulo emocional consistente" };
  }

  if (direction.sellingArgument === "SOCIAL_PROOF" || direction.proofStrategy !== "NONE") {
    return { angle: "TRUST", reason: "ha prova real disponivel - confianca e o angulo emocional coerente" };
  }

  if (direction.sellingArgument === "PRACTICAL_BENEFIT") {
    return { angle: "RELIEF", reason: "beneficio pratico resolve uma dor - alivio e o angulo emocional coerente" };
  }

  if (direction.sellingArgument === "EXCLUSIVITY") {
    return { angle: "PRIDE", reason: "exclusividade pede orgulho de possuir" };
  }

  return { angle: "EXCITEMENT", reason: "fallback: entusiasmo generico quando nenhum sinal mais especifico esta disponivel" };
}
