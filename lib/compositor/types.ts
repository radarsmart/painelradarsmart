// Radar Creative AI - Hybrid Product Compositor / Types
//
// Contrato do compositor que resolve HYBRID_PRODUCT_COMPOSITE (ver
// lib/generation-orchestrator/product-generation-strategy.ts): o produto
// real NUNCA e regenerado por IA - so o fundo/ambiente e gerado, e o
// compositor sobrepoe a foto real por cima usando so transformacoes
// geometricas deterministicas (scale/position/alpha).

import type { ProductPlacement } from "@/lib/generation-orchestrator/product-generation-strategy";

export type { ProductPlacement };

// NONE: produto parado o tempo todo. SUBTLE_PUSH_IN: zoom linear pequeno
// do LAYER inteiro do produto (nunca do conteudo interno) - nunca
// rotation/orbit/perspective warp/3D transform.
export type ProductMotion = "NONE" | "SUBTLE_PUSH_IN";

// NONE: imagem original usada como layer retangular (aceitavel nesta
// fase - marketplace photos costumam ter fundo branco). PREPROCESSED_ALPHA:
// assume que productImagePath JA tem canal alpha preparado fora deste
// compositor (nenhuma remocao de fundo por IA acontece aqui).
export type BackgroundRemovalMode = "NONE" | "PREPROCESSED_ALPHA";

// CANARY #6 (Product Grounding, 2026-08-08): sombra de contato PURAMENTE
// derivada da mascara alpha do produto (nunca redesenhada/inferida por
// IA) - existe so pra ancorar visualmente o produto ao chao do
// background, nunca altera um pixel do produto em si (camada
// independente, sempre atras do produto na composicao final). enabled
// default false - se omitido, o comportamento do compositor e IDENTICO
// ao que era antes desta feature (sem regressao).
export type ProductShadowType = "CONTACT";

export type ProductGroundingOptions = {
  enabled: boolean;
  shadowType: ProductShadowType;
  // 0..1 - opacidade maxima da sombra (no ponto mais escuro, direto sob
  // o produto). Valores conservadores por padrao (ver
  // DEFAULT_PRODUCT_GROUNDING) - nunca um preset especifico de produto.
  opacity: number;
  // Raio do desfoque (pixels) aplicado a mascara da sombra - nunca ao
  // produto.
  blurRadius: number;
  // Fator de escala horizontal da sombra em relacao a largura do
  // produto (ex: 1.15 = 15% mais larga que a base do produto).
  horizontalScale: number;
  // Deslocamento vertical (pixels) da sombra para baixo, a partir da
  // base do produto - empurra a sombra pra "debaixo" em vez de
  // sobrepor a base.
  verticalOffset: number;
};

export type HybridCompositeRequest = {
  backgroundVideoPath: string;
  productImagePath: string;
  productPlacement: ProductPlacement;
  durationSeconds: number;
  // Formato "W:H", ex "9:16" - mesma convencao usada em
  // SceneGenerationPrompt.aspectRatio.
  aspectRatio: string;
  // Sempre true nesta fase - ver docstring de HybridCompositePlan em
  // product-generation-strategy.ts. Mantido explicito no tipo (em vez de
  // apenas documentado) para que nenhum chamador possa passar false por
  // engano.
  preserveProductPixels: true;
  productMotion: ProductMotion;
  backgroundRemovalMode: BackgroundRemovalMode;
  outputPath: string;
  // Opcional - omitir e o mesmo que { enabled: false, ... } (compositor
  // se comporta exatamente como antes desta feature).
  productGrounding?: ProductGroundingOptions;
};

export type HybridCompositeStatus = "COMPLETED" | "FAILED";

export type HybridCompositeResult = {
  status: HybridCompositeStatus;
  outputPath: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  error: string | null;
};

// Saida do montador de filtro PURO (ver hybrid-product-compositor.ts) -
// separado do resultado de execucao para que o grafo de filtros possa ser
// inspecionado/testado sem rodar ffmpeg de verdade (ver "teste de
// integridade de pixels").
export type CompositeFilterPlan = {
  filterComplex: string;
  videoOutputLabel: string;
  canvasWidth: number;
  canvasHeight: number;
};
