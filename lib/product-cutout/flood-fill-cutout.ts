// Radar Creative AI - Product Cutout / Alpha - Algoritmo PURO
//
// BORDER_CONNECTED_COLOR_FLOOD_FILL: a mesma tecnica classica de "magic
// wand" / chroma-key com conectividade (existe desde antes de qualquer
// IA generativa - e como ferramentas de edicao de imagem sempre fizeram
// recorte determinístico). NUNCA e uma rede neural, nunca reconstroi/
// inventa conteudo - so decide, pixel a pixel, se aquele pixel esta
// CONECTADO ao fundo externo por uma cadeia continua de pixels com cor
// parecida com a cor de fundo amostrada nos cantos da imagem.
//
// REGRA CRITICA (documentada no pedido original, item 6): o algoritmo
// NAO pode tratar todo pixel branco/quase-branco como fundo - so os que
// tem um CAMINHO continuo ate a borda externa da imagem, cada passo
// dentro da tolerancia de cor. Uma regiao clara isolada DENTRO do
// produto (cromado, reflexo) nunca e alcancada pelo flood fill porque
// nao ha caminho conectado ate a borda sem atravessar pixels do produto
// (que tem cor bem diferente do fundo).
//
// Puro - opera so em buffers ja carregados em memoria, nunca faz I/O.

export type RgbColor = { r: number; g: number; b: number };

export const DEFAULT_STRICT_COLOR_DISTANCE = 22;
export const DEFAULT_SOFT_COLOR_DISTANCE = 55;

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Amostra a cor de fundo pelos 4 CANTOS da imagem (media) - em fotos de
 * produto isoladas (o caso real deste projeto: marketplace com fundo
 * branco), os cantos sao sempre fundo puro, nunca o produto. Nunca
 * adivinha - e uma amostragem direta dos pixels reais.
 */
export function sampleBackgroundReferenceColor(rgba: Buffer, width: number, height: number): RgbColor {
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];

  let r = 0;
  let g = 0;
  let b = 0;
  for (const [x, y] of corners) {
    const idx = (y * width + x) * 4;
    r += rgba[idx];
    g += rgba[idx + 1];
    b += rgba[idx + 2];
  }

  return { r: r / corners.length, g: g / corners.length, b: b / corners.length };
}

export type FloodFillResult = {
  // 1 = fundo (conectado a borda dentro da tolerancia estrita), 0 = produto.
  backgroundMask: Uint8Array;
  backgroundPixelCount: number;
};

/**
 * Flood fill iterativo (pilha - DFS, ordem de visita nao importa pra
 * conectividade) a partir de TODOS os pixels da borda externa da
 * imagem. Um pixel de borda so vira semente se sua propria cor ja
 * estiver dentro de strictColorDistance da referencia (evita propagar a
 * partir de um pixel de borda que por acaso seja parte do produto). A
 * partir das sementes, propaga so pra vizinhos (4-conectividade) cuja
 * cor tambem esteja dentro da mesma tolerancia estrita - isso e o que
 * impede um reflexo/cromado claro DENTRO do produto de ser alcancado,
 * mesmo que a cor dele seja parecida com o fundo, contanto que nao
 * exista um caminho continuo de pixels "fundo" ate ele.
 */
export function floodFillBackgroundMask(
  rgba: Buffer,
  width: number,
  height: number,
  reference: RgbColor,
  strictColorDistance: number,
): FloodFillResult {
  const backgroundMask = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];

  const isBackgroundColor = (index: number): boolean => {
    const px = index * 4;
    return (
      colorDistance(rgba[px], rgba[px + 1], rgba[px + 2], reference.r, reference.g, reference.b) <=
      strictColorDistance
    );
  };

  // Semeia so com pixels de borda que ja sao "cor de fundo".
  for (let x = 0; x < width; x += 1) {
    for (const y of [0, height - 1]) {
      const index = y * width + x;
      if (!visited[index] && isBackgroundColor(index)) {
        visited[index] = 1;
        stack.push(index);
      }
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (const x of [0, width - 1]) {
      const index = y * width + x;
      if (!visited[index] && isBackgroundColor(index)) {
        visited[index] = 1;
        stack.push(index);
      }
    }
  }

  let backgroundPixelCount = 0;
  while (stack.length > 0) {
    const index = stack.pop() as number;
    backgroundMask[index] = 1;
    backgroundPixelCount += 1;

    const x = index % width;
    const y = Math.floor(index / width);

    const neighbors = [
      x > 0 ? index - 1 : -1,
      x < width - 1 ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y < height - 1 ? index + width : -1,
    ];

    for (const neighborIndex of neighbors) {
      if (neighborIndex >= 0 && !visited[neighborIndex] && isBackgroundColor(neighborIndex)) {
        visited[neighborIndex] = 1;
        stack.push(neighborIndex);
      }
    }
  }

  return { backgroundMask, backgroundPixelCount };
}

export type ApplyCutoutOptions = {
  strictColorDistance: number;
  softColorDistance: number;
};

export type ApplyCutoutStats = {
  backgroundReferenceColor: RgbColor;
  backgroundPixelsRemoved: number;
  edgePixelsSoftened: number;
  rgbModifiedPixelCount: number;
};

/**
 * Monta o buffer RGBA final: copia o buffer original (RGB NUNCA
 * alterado, exceto na faixa fina de borda documentada abaixo) e ajusta
 * so o canal alpha, mais a descontaminacao de cor da faixa de borda com
 * alpha parcial (formula padrao de alpha matting: F = (C - B*(1-a))/a,
 * documentada, nunca inventando conteudo - so removendo a contaminacao
 * da cor de fundo que vazou por anti-aliasing na foto original).
 */
export function applyBorderConnectedColorFloodFill(
  rgba: Buffer,
  width: number,
  height: number,
  options: ApplyCutoutOptions,
): { output: Buffer; stats: ApplyCutoutStats } {
  const reference = sampleBackgroundReferenceColor(rgba, width, height);
  const { backgroundMask, backgroundPixelCount } = floodFillBackgroundMask(
    rgba,
    width,
    height,
    reference,
    options.strictColorDistance,
  );

  const output = Buffer.from(rgba); // copia - nunca muta o buffer de entrada
  let edgePixelsSoftened = 0;
  let rgbModifiedPixelCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const px = index * 4;

      if (backgroundMask[index] === 1) {
        output[px + 3] = 0; // fundo confirmado - so o alpha muda
        continue;
      }

      // Zona de transicao (soft edge): pixel NAO esta no fundo
      // conectado, mas sua cor ainda esta na faixa [strict, soft] da
      // referencia - tratado como borda semi-transparente pra evitar
      // serrilhado, nunca como fundo pleno.
      const distance = Math.sqrt(
        (rgba[px] - reference.r) ** 2 + (rgba[px + 1] - reference.g) ** 2 + (rgba[px + 2] - reference.b) ** 2,
      );

      if (distance > options.strictColorDistance && distance <= options.softColorDistance) {
        // So suaviza se o pixel for VIZINHO de um pixel de fundo real -
        // evita suavizar uma regiao clara isolada do produto que por
        // coincidencia tenha cor parecida com o fundo mas nao esteja na
        // borda do recorte.
        const hasBackgroundNeighbor =
          (x > 0 && backgroundMask[index - 1] === 1) ||
          (x < width - 1 && backgroundMask[index + 1] === 1) ||
          (y > 0 && backgroundMask[index - width] === 1) ||
          (y < height - 1 && backgroundMask[index + width] === 1);

        if (hasBackgroundNeighbor) {
          const range = options.softColorDistance - options.strictColorDistance;
          const t = (distance - options.strictColorDistance) / range; // 0 (perto do fundo) .. 1 (longe)
          const alpha = Math.round(t * 255);
          output[px + 3] = alpha;
          edgePixelsSoftened += 1;

          // Descontaminacao de cor - SO nesta faixa fina de alpha
          // parcial, formula padrao de alpha matting. a=0 (totalmente
          // fundo) ja foi tratado acima; aqui alpha > 0 sempre.
          const a = alpha / 255;
          if (a > 0.001) {
            const newR = (rgba[px] - reference.r * (1 - a)) / a;
            const newG = (rgba[px + 1] - reference.g * (1 - a)) / a;
            const newB = (rgba[px + 2] - reference.b * (1 - a)) / a;
            output[px] = Math.max(0, Math.min(255, Math.round(newR)));
            output[px + 1] = Math.max(0, Math.min(255, Math.round(newG)));
            output[px + 2] = Math.max(0, Math.min(255, Math.round(newB)));
            rgbModifiedPixelCount += 1;
          }
        }
      }
      // caso contrario: pixel do produto, RGB e alpha=255 inalterados.
    }
  }

  return {
    output,
    stats: {
      backgroundReferenceColor: reference,
      backgroundPixelsRemoved: backgroundPixelCount,
      edgePixelsSoftened,
      rgbModifiedPixelCount,
    },
  };
}
