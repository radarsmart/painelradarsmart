// Radar Creative AI - Commercial Video Pipeline / Scene Duration Padding
//
// PURO - decide se/como uma cena cujo asset REAL e mais curto que o slot
// planejado no storyboard pode ser esticada. Aprendizado do COMMERCIAL V2
// FULL CANARY real (2026-08-11): scene-5 (CTA, heygen-image-avatar) tinha
// slot planejado de 4.89s mas o video real saiu com 1.60s - HeyGen e
// audio-driven (duracao do video = duracao do audio que dirige o lip-sync),
// diferente de Kling/WAN (duracao fixa, sempre >= o slot, so cortada com
// -t). O gate final (assessFinalQualityGate, final-composer.ts) capturou a
// timeline final 3.33s mais curta que o planejado - corretamente, mas sem
// nenhum mecanismo de correcao ate agora.
//
// Este modulo NUNCA decide sozinho "esticar" qualquer cena curta - so
// providers explicitamente listados em eligibleProviders (hoje, so
// heygen-image-avatar - o unico cuja duracao e estruturalmente amarrada ao
// audio) sao elegiveis. Kling/WAN nunca deveriam cair aqui na pratica (a
// duracao real e sempre >= o slot, ver resolveKlingDuration/resolveWanDuration),
// mas se um dia caissem, ficariam BLOCKED por padrao (nao estao na lista).

export type SceneDurationPaddingPolicy = {
  // Providers cujo asset PODE ser esticado via freeze do ultimo frame -
  // nunca aplicado a um provider fora desta lista.
  eligibleProviders: string[];
  // Padding maximo aceito como fracao da duracao PLANEJADA - alem disso,
  // BLOCKED (esticar demais mascararia um problema real de storyboard/
  // narracao, nao um ajuste fino).
  maxPaddingRatio: number;
  // Teto absoluto em segundos, independente da fracao acima.
  maxPaddingSeconds: number;
};

// 70%/6s: calibrados pelo caso real (scene-5, padding=3.29s, 67.3% de
// 4.89s) - generoso o suficiente pra cobrir uma fala de CTA curta seguida
// de "hold" natural da apresentadora, mas nao tao generoso a ponto de
// aceitar silenciosamente uma cena cujo audio real ficou drasticamente
// mais curto que o planejado (sinal de um problema de narracao/pacing,
// nao so de "personagem fica parada por mais um tempo").
export const DEFAULT_SCENE_DURATION_PADDING_POLICY: SceneDurationPaddingPolicy = {
  eligibleProviders: ["heygen-image-avatar"],
  maxPaddingRatio: 0.7,
  maxPaddingSeconds: 6,
};

export type SceneDurationAdjustment =
  | { type: "NONE" }
  | {
      type: "FREEZE_LAST_FRAME";
      originalDuration: number;
      targetDuration: number;
      paddingDuration: number;
    }
  | {
      type: "BLOCKED_SCENE_DURATION_MISMATCH";
      originalDuration: number;
      targetDuration: number;
      paddingDuration: number;
      reason: string;
    };

export type ResolveSceneDurationAdjustmentInput = {
  provider: string | null;
  originalDurationSeconds: number;
  plannedDurationSeconds: number;
  policy?: SceneDurationPaddingPolicy;
};

/**
 * Regra pura, nesta ordem:
 * 1. asset ja >= planejado (ou igual) -> NONE (nada a fazer - o corte por
 *    -t no compositor ja resolve isso, como sempre resolveu).
 * 2. provider fora da eligibleProviders list -> BLOCKED (nunca esticar
 *    silenciosamente um provider cuja duracao curta pode ser sintoma de
 *    outro problema - ex: geracao truncada).
 * 3. padding necessario excede o teto (fracao OU segundos absolutos) ->
 *    BLOCKED (esticar demais mascararia o problema em vez de resolve-lo).
 * 4. caso contrario -> FREEZE_LAST_FRAME.
 */
export function resolveSceneDurationAdjustment(input: ResolveSceneDurationAdjustmentInput): SceneDurationAdjustment {
  const policy = input.policy ?? DEFAULT_SCENE_DURATION_PADDING_POLICY;
  const paddingDuration = input.plannedDurationSeconds - input.originalDurationSeconds;

  if (paddingDuration <= 0) return { type: "NONE" };

  if (!input.provider || !policy.eligibleProviders.includes(input.provider)) {
    return {
      type: "BLOCKED_SCENE_DURATION_MISMATCH",
      originalDuration: input.originalDurationSeconds,
      targetDuration: input.plannedDurationSeconds,
      paddingDuration,
      reason: `Provider "${input.provider ?? "desconhecido"}" nao esta na policy de padding elegivel (${policy.eligibleProviders.join(", ")}) - cena mais curta que o planejado nunca e esticada silenciosamente para este provider.`,
    };
  }

  const ratio = paddingDuration / input.plannedDurationSeconds;
  if (ratio > policy.maxPaddingRatio || paddingDuration > policy.maxPaddingSeconds) {
    return {
      type: "BLOCKED_SCENE_DURATION_MISMATCH",
      originalDuration: input.originalDurationSeconds,
      targetDuration: input.plannedDurationSeconds,
      paddingDuration,
      reason:
        `Padding necessario (${paddingDuration.toFixed(2)}s, ${(ratio * 100).toFixed(1)}% da duracao planejada) excede ` +
        `o limite da policy (max ${(policy.maxPaddingRatio * 100).toFixed(0)}% ou ${policy.maxPaddingSeconds}s, o que for menor).`,
    };
  }

  return {
    type: "FREEZE_LAST_FRAME",
    originalDuration: input.originalDurationSeconds,
    targetDuration: input.plannedDurationSeconds,
    paddingDuration,
  };
}
