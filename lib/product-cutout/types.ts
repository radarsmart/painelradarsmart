// Radar Creative AI - Product Asset Preparation / Product Cutout / Alpha
//
// Camada ISOLADA entre a foto real do produto e o Hybrid Product
// Compositor (ver lib/compositor/*). Resolve especificamente o problema
// encontrado no CANARY #5 (retangulo branco do fundo do marketplace
// visivel sobre o background gerado) - NUNCA redesenha/reconstroi o
// produto, so decide QUAIS PIXELS SAO FUNDO e torna esses pixels
// transparentes. RGB dos pixels internos do produto nunca e alterado;
// a UNICA excecao documentada e a faixa fina de pixels de borda com
// alpha parcial (ver ProductCutoutResult.rgbModifiedPixelCount) - ali o
// RGB pode ser "descontaminado" da cor de fundo que vazou por
// anti-aliasing, usando a formula padrao de alpha matting (nunca
// inventando conteudo novo).

export type ProductCutoutMethod = "BORDER_CONNECTED_COLOR_FLOOD_FILL";

export type ProductCutoutQuality = "PASS" | "PARTIAL" | "FAIL";

export type ProductCutoutRequest = {
  inputImagePath: string;
  outputImagePath: string;
  // Distancia de cor (espaco RGB, 0-441) abaixo da qual um pixel e
  // considerado "fundo" com certeza (alpha=0). Documentado, nunca
  // escondido - ver DEFAULT_STRICT_COLOR_DISTANCE.
  strictColorDistance?: number;
  // Distancia de cor acima da STRICT ate este limite -> zona de
  // transicao com alpha parcial (soft edge), evitando serrilhado.
  // Acima deste limite -> pixel definitivamente NAO e fundo (alpha=255).
  softColorDistance?: number;
};

export type ProductCutoutQualityReport = {
  quality: ProductCutoutQuality;
  reasons: string[];
  backgroundPixelRatio: number;
  softEdgePixelRatio: number;
  cornersFullyTransparent: boolean;
  centerFullyOpaque: boolean;
};

export type ProductCutoutResult = {
  status: "COMPLETED" | "FAILED";
  method: ProductCutoutMethod;
  outputImagePath: string | null;
  width: number | null;
  height: number | null;
  backgroundReferenceColor: { r: number; g: number; b: number } | null;
  // Contagens - nunca estimadas, sempre exatas (contadas no proprio
  // buffer processado).
  backgroundPixelsRemoved: number | null;
  edgePixelsSoftened: number | null;
  // SOMENTE os pixels de borda com alpha parcial que passaram por
  // descontaminacao de cor - todos os outros pixels tem RGB byte-a-byte
  // identico ao original (ver PRODUCT_CONTENT_PRESERVED no relatorio).
  rgbModifiedPixelCount: number | null;
  qualityReport: ProductCutoutQualityReport | null;
  error: string | null;
};
