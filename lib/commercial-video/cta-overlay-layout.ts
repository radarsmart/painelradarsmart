// Radar Creative AI - Commercial Video Pipeline / CTA Overlay Layout
//
// PURO - decide fontSize/quebra de linha do overlay de CTA ANTES de montar
// o filtro drawtext (overlay-renderer.ts). Aprendizado do COMMERCIAL V2
// FULL CANARY real (2026-08-11): "Acesse o Radar Smart e aproveite essa
// oferta antes que ela acabe." (65 chars) estourava a largura do frame
// 1080x1920 porque buildCtaDrawtextFilter nunca media o texto - so
// centralizava com base em text_w (variavel do proprio FFmpeg, avaliada em
// tempo de render, tarde demais pra decidir fontSize/quebra).
//
// GAP CONHECIDO (documentado, nao escondido): nao existe medicao real de
// glifo (nenhuma lib de metricas de fonte no projeto) - a largura de cada
// linha e ESTIMADA por uma razao media de largura de caractere por
// fontSize (AVG_CHAR_WIDTH_RATIO), calibrada para a fonte bold sans-serif
// ja usada (arialbd.ttf/DejaVuSans-Bold.ttf, ver overlay-renderer.ts).
// Suficiente para decidir com margem de seguranca (nunca para posicionar
// pixel-perfeito) - por isso maxTextWidthRatio ja reserva uma margem
// generosa (12% da largura total).

export type CtaOverlayLayoutPolicy = {
  // Fracao da largura do frame disponivel para o texto (o resto e margem
  // de seguranca esquerda+direita).
  maxTextWidthRatio: number;
  maxLines: number;
  defaultFontSize: number;
  minFontSize: number;
  fontSizeStep: number;
  // Estimativa de largura media de caractere, como fracao do fontSize -
  // ver nota do modulo acima.
  avgCharWidthRatio: number;
};

export const DEFAULT_CTA_OVERLAY_LAYOUT_POLICY: CtaOverlayLayoutPolicy = {
  maxTextWidthRatio: 0.88,
  maxLines: 2,
  defaultFontSize: 44,
  minFontSize: 28,
  fontSizeStep: 2,
  avgCharWidthRatio: 0.56,
};

export type CtaOverlayLayoutResult =
  | { status: "OK"; fontSize: number; lines: string[] }
  | { status: "BLOCKED_OVERLAY_LAYOUT"; reason: string; attemptedFontSize: number; attemptedLines: string[] };

export function estimateTextWidthPx(text: string, fontSize: number, policy: CtaOverlayLayoutPolicy = DEFAULT_CTA_OVERLAY_LAYOUT_POLICY): number {
  return text.length * fontSize * policy.avgCharWidthRatio;
}

/**
 * Quebra greedy (mesmo algoritmo classico de word-wrap) - nunca quebra no
 * meio de uma palavra. Palavra isolada mais larga que maxWidthPx sozinha
 * ainda assim vira uma linha (nao ha hifenizacao) - o CALLER (resolveCtaOverlayLayout)
 * e quem decide se o resultado final "coube" ou nao.
 */
export function wrapTextGreedy(text: string, fontSize: number, maxWidthPx: number, policy: CtaOverlayLayoutPolicy = DEFAULT_CTA_OVERLAY_LAYOUT_POLICY): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || estimateTextWidthPx(candidate, fontSize, policy) <= maxWidthPx) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Reduz fontSize progressivamente (defaultFontSize -> minFontSize, passo
 * fontSizeStep) ate achar uma quebra que caiba em policy.maxLines linhas,
 * cada uma dentro de maxWidthPx. Se nem minFontSize resolver, devolve
 * BLOCKED_OVERLAY_LAYOUT com a ultima tentativa (nunca renderiza texto
 * cortado silenciosamente - item 6 do pedido).
 */
export function resolveCtaOverlayLayout(
  text: string,
  frameWidthPx: number,
  policy: CtaOverlayLayoutPolicy = DEFAULT_CTA_OVERLAY_LAYOUT_POLICY,
): CtaOverlayLayoutResult {
  const maxWidthPx = frameWidthPx * policy.maxTextWidthRatio;

  let lastLines: string[] = [];
  let lastFontSize = policy.defaultFontSize;

  for (let fontSize = policy.defaultFontSize; fontSize >= policy.minFontSize; fontSize -= policy.fontSizeStep) {
    const lines = wrapTextGreedy(text, fontSize, maxWidthPx, policy);
    lastLines = lines;
    lastFontSize = fontSize;

    const fits = lines.length <= policy.maxLines && lines.every((line) => estimateTextWidthPx(line, fontSize, policy) <= maxWidthPx);
    if (fits) {
      return { status: "OK", fontSize, lines };
    }
  }

  return {
    status: "BLOCKED_OVERLAY_LAYOUT",
    reason:
      `Texto do CTA ("${text}") nao coube em ${policy.maxLines} linha(s) mesmo no fontSize minimo ` +
      `(${policy.minFontSize}px) dentro de ${(policy.maxTextWidthRatio * 100).toFixed(0)}% da largura do frame ` +
      `(${maxWidthPx.toFixed(0)}px estimados) - nunca renderizado cortado.`,
    attemptedFontSize: lastFontSize,
    attemptedLines: lastLines,
  };
}
