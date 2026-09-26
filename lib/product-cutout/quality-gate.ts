// Radar Creative AI - Product Cutout / Alpha - Quality Gate
//
// Avaliacao PURA e deterministica do resultado do cutout - nunca usa
// visao computacional/IA. So mede propriedades estatisticas do canal
// alpha ja calculado (proporcao de fundo removido, proporcao de borda
// suavizada, cantos/centro) - proxies objetivos, documentados, nunca
// "isso parece bom" subjetivo.

import type { ProductCutoutQualityReport } from "@/lib/product-cutout/types";

// Limites deterministicos e documentados - nunca "olhando pra imagem".
// Fundo removido fora dessa faixa sugere erro (quase nada removido =
// flood fill nao encontrou fundo parecido o suficiente; quase tudo
// removido = provavelmente vazou pro produto).
const MIN_BACKGROUND_RATIO = 0.05;
const MAX_BACKGROUND_RATIO = 0.95;
// Muita borda semi-transparente sugere transicao malfeita/ruidosa em vez
// de um recorte limpo com uma faixa fina de anti-aliasing.
const MAX_SOFT_EDGE_RATIO = 0.15;

export function assessCutoutQuality(rgba: Buffer, width: number, height: number): ProductCutoutQualityReport {
  const total = width * height;
  let backgroundPixels = 0;
  let softEdgePixels = 0;

  for (let i = 0; i < total; i += 1) {
    const alpha = rgba[i * 4 + 3];
    if (alpha === 0) backgroundPixels += 1;
    else if (alpha < 255) softEdgePixels += 1;
  }

  const backgroundPixelRatio = backgroundPixels / total;
  const softEdgePixelRatio = softEdgePixels / total;

  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  const cornersFullyTransparent = corners.every(([x, y]) => rgba[(y * width + x) * 4 + 3] === 0);

  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const centerFullyOpaque = rgba[(centerY * width + centerX) * 4 + 3] === 255;

  const reasons: string[] = [];
  let failCount = 0;
  let partialCount = 0;

  if (!cornersFullyTransparent) {
    reasons.push("Cantos da imagem nao ficaram totalmente transparentes - fundo nao foi removido onde deveria.");
    failCount += 1;
  }
  if (!centerFullyOpaque) {
    reasons.push("Pixel central nao ficou opaco - possivel erosao do produto pelo flood fill.");
    failCount += 1;
  }
  if (backgroundPixelRatio < MIN_BACKGROUND_RATIO || backgroundPixelRatio > MAX_BACKGROUND_RATIO) {
    reasons.push(
      `Proporcao de fundo removido (${(backgroundPixelRatio * 100).toFixed(1)}%) fora da faixa esperada ` +
        `[${MIN_BACKGROUND_RATIO * 100}%, ${MAX_BACKGROUND_RATIO * 100}%].`,
    );
    failCount += 1;
  }
  if (softEdgePixelRatio > MAX_SOFT_EDGE_RATIO) {
    reasons.push(
      `Proporcao de borda semi-transparente (${(softEdgePixelRatio * 100).toFixed(1)}%) acima do esperado ` +
        `(${MAX_SOFT_EDGE_RATIO * 100}%) - transicao pode estar ruidosa em vez de uma faixa fina de anti-aliasing.`,
    );
    partialCount += 1;
  }

  if (reasons.length === 0) {
    reasons.push("Cantos transparentes, centro opaco, proporcoes de fundo/borda dentro do esperado.");
  }

  const quality = failCount > 0 ? "FAIL" : partialCount > 0 ? "PARTIAL" : "PASS";

  return {
    quality,
    reasons,
    backgroundPixelRatio,
    softEdgePixelRatio,
    cornersFullyTransparent,
    centerFullyOpaque,
  };
}
