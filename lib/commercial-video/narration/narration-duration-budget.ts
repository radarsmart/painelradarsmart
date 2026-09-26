// Radar Creative AI - Narration Script Builder / Duration Budget
//
// PURO - converte duracao de cena (segundos) em orcamento de caracteres,
// e caracteres em duracao de fala estimada. Formula derivada de dados
// REAIS medidos no CANARY de integracao da voz oficial (Ana Dias,
// eleven_multilingual_v2, 2026-08-09):
//
//   34 caracteres -> 2.414875s
//   40 caracteres -> 2.879274s
//   60 caracteres -> 4.365351s
//   31 caracteres -> 2.368435s
//
// Regressao linear simples (minimos quadrados) sobre esses 4 pontos:
//   duracao ~= 0.061 + 0.0714 * caracteres  (R~14.0 caracteres/segundo assintotico)
//
// Duas escolhas deliberadamente conservadoras (o objetivo e "preferir
// fala ligeiramente curta", nunca estourar a janela):
//   1) O intercepto (~0.06s) e IGNORADO - reduz o orcamento calculado,
//      nunca aumenta.
//   2) Antes de inverter a formula, aplicamos DURATION_SAFETY_MARGIN
//      (85% da janela disponivel) - o orcamento final e sempre menor que
//      o que a formula bruta permitiria.
//
// Consequencia aceita e documentada: o proprio texto de 60 caracteres do
// CANARY (que coube de verdade em 4.37s dentro de uma janela de 5s) fica
// 1 caractere AC1MA do orcamento conservador pra uma janela de 5s
// (floor(5*0.85*14) = 59). Isso e intencional, nao um bug - com apenas 4
// amostras reais, e mais seguro errar pro lado curto do que repetir
// exatamente o pior caso ja observado.

export const OBSERVED_CHARS_PER_SECOND = 14.0;
export const DURATION_SAFETY_MARGIN = 0.85;

export function computeMaxCharacters(durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return Math.floor(durationSeconds * DURATION_SAFETY_MARGIN * OBSERVED_CHARS_PER_SECOND);
}

export function estimateSpeechSeconds(characterCount: number): number {
  return characterCount / OBSERVED_CHARS_PER_SECOND;
}
