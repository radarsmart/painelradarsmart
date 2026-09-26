// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Hook Persuasion Engine
//
// PURO - HOOK_PERSUASION_SCORE, separado do HookStrength existente
// (lib/creative-director-v2/hook-engine.ts, que mede elementos VISUAIS -
// contraste, movimento, legibilidade mobile). Este mede se ha RAZAO
// PERSUASIVA para parar o scroll, nao so impacto estetico. Um hook pode
// pontuar alto em HookStrength (visual) e baixo aqui (sem desejo/duvida/
// especificidade) - os dois nunca sao fundidos.

import type {
  HookConcept,
  HookPersuasionResult,
  PersuasionEvidence,
  PersuasionSceneConcept,
  ProductDesireProfile,
} from "@/lib/commercial-video/persuasion/types";

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatPriceBRL(price: number): string {
  return `R$ ${price.toFixed(2).replace(".", ",")}`;
}

/**
 * Gera candidatos de conceito de hook A PARTIR dos dados reais (preco,
 * categoria efetiva, primaryDesire) - NUNCA uma frase hardcoded por
 * produto. `grounded=false` marca candidatos que dependeriam de dado
 * ausente (ex: preco null) - esses nunca sao selecionados como vencedores.
 */
export function generateHookConcepts(evidence: PersuasionEvidence, desireProfile: ProductDesireProfile): HookConcept[] {
  const concepts: HookConcept[] = [];

  if (evidence.price !== null) {
    concepts.push({
      concept: `Um achado de ${desireProfile.productCategory === "beleza" ? "skincare" : desireProfile.productCategory} por ${formatPriceBRL(evidence.price)}?`,
      grounded: true,
      reason: "Preco real + framing de descoberta/curiosidade - especifico, nao generico.",
    });
  }

  if (desireProfile.primaryDesire.confidence !== "LOW") {
    concepts.push({
      concept: `${evidence.productName.split(" ").slice(0, 4).join(" ")}: ${desireProfile.primaryDesire.text}.`,
      grounded: true,
      reason: "Baseado em claim real de embalagem/oferta (primaryDesire).",
    });
  }

  concepts.push({
    concept: `Conheca o ${evidence.productName}.`,
    grounded: false,
    reason: "Generico (apresentacao pura, sem gancho de curiosidade/preco/desejo) - fixture NEGATIVA, nunca deve vencer.",
  });

  return concepts;
}

export type ScoreHookPersuasionInput = {
  hookScene: PersuasionSceneConcept;
  evidence: PersuasionEvidence;
  desireProfile: ProductDesireProfile;
};

export function scoreHookPersuasion(input: ScoreHookPersuasionInput): HookPersuasionResult {
  const { hookScene, evidence, desireProfile } = input;
  const candidates = generateHookConcepts(evidence, desireProfile);
  const groundedCandidates = candidates.filter((c) => c.grounded);
  const winningConcept = groundedCandidates[0] ?? candidates[candidates.length - 1];

  const productRelevantToMessage = hookScene.productVisualRole !== "FLOATING_HERO" || hookScene.benefitClaimId !== null;
  const dependsOnlyOnAesthetics = hookScene.productVisualRole === "FLOATING_HERO" && hookScene.benefitClaimId === null && hookScene.environmentRelevance !== "PRODUCT_NATIVE_CONTEXT";
  const genericAdRisk = hookScene.environmentRelevance === "UNRELATED_ASPIRATIONAL";
  const benefitOrDesirePresent = hookScene.benefitClaimId !== null || hookScene.offerRole !== "NONE";
  const createsQuestion = winningConcept.concept.includes("?") || hookScene.whyContinueWatching.length > 15;

  const specificity = clamp((winningConcept.grounded ? 70 : 20) + (benefitOrDesirePresent ? 20 : 0));
  const curiosity = clamp((createsQuestion ? 60 : 20) + (evidence.price !== null && evidence.price < 30 ? 25 : 0));
  const rewardClarity = clamp(hookScene.whyContinueWatching.length > 20 ? 75 : 30);

  const score = clamp(
    specificity * 0.3 +
      curiosity * 0.25 +
      (benefitOrDesirePresent ? 100 : 20) * 0.15 +
      (productRelevantToMessage ? 100 : 20) * 0.15 +
      rewardClarity * 0.15 -
      (dependsOnlyOnAesthetics ? 25 : 0) -
      (genericAdRisk ? 20 : 0),
  );

  const reasons: string[] = [];
  reasons.push(`Conceito vencedor: "${winningConcept.concept}" (${winningConcept.reason}).`);
  if (dependsOnlyOnAesthetics) reasons.push("Hook depende so de estetica (produto flutuando, sem contexto/beneficio) - penalizado.");
  if (genericAdRisk) reasons.push("Ambiente do hook classificado como UNRELATED_ASPIRATIONAL - risco de generic ad.");
  if (!benefitOrDesirePresent) reasons.push("Nenhum beneficio/desejo claramente presente no hook.");

  return {
    score,
    candidates,
    winningConcept,
    signals: {
      specificity,
      curiosity,
      benefitOrDesirePresent,
      productRelevantToMessage,
      dependsOnlyOnAesthetics,
      genericAdRisk,
      createsQuestion,
      rewardClarity,
    },
    reasons,
  };
}

