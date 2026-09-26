// Radar Creative AI - Hybrid Product Compositor
//
// Resolve HYBRID_PRODUCT_COMPOSITE: recebe um fundo ja gerado (video) e a
// foto REAL do produto, e produz um MP4 onde o produto e sobreposto ao
// fundo usando SO transformacoes geometricas deterministicas (scale,
// position, alpha) via FFmpeg - nunca IA, nunca redesenha o produto.
//
// DECISAO DE TECNOLOGIA (FFmpeg vs Remotion): o projeto ja usa os dois,
// para propositos diferentes -
//   - Remotion (lib/tiktok-engine/remotion/*): cenas DECLARATIVAS em React,
//     renderizadas via Chromium headless - bom para templates com texto/
//     layout dinamico, mas pesado (spin up de browser) e pensado para
//     compor uma CENA inteira do zero, nao para sobrepor uma imagem fixa
//     sobre um video ja existente.
//   - fluent-ffmpeg (lib/ugc/video-composer.ts): ja usado EXATAMENTE para
//     este tipo de operacao - overlay de logo sobre video via
//     complexFilter (`"[2:v]scale=120:-1[logo]", "[0:v][logo]overlay=W-w-20:H-h-20[outv]"`),
//     scale/crop deterministico (`normalizeClip`), sem nenhuma camada de
//     IA no meio.
// Sobrepor uma foto real sobre um video de fundo e uma operacao de
// overlay/scale/crop pura - exatamente o que o `overlay`/`scale` do
// FFmpeg ja fazem, e exatamente o padrao ja comprovado em producao neste
// mesmo repositorio. Remotion nao traria nenhuma vantagem aqui e
// adicionaria uma dependencia de renderizacao muito mais pesada para o
// mesmo resultado - por isso NAO foi usado.

import { execSync } from "node:child_process";
import fs from "node:fs";
import ffmpeg from "fluent-ffmpeg";

import { parseImageDimensions } from "@/lib/generation-orchestrator/image-dimensions";
import type {
  BackgroundRemovalMode,
  CompositeFilterPlan,
  HybridCompositeRequest,
  HybridCompositeResult,
  ProductGroundingOptions,
  ProductMotion,
  ProductPlacement,
} from "@/lib/compositor/types";
import type { HybridCompositePlan } from "@/lib/generation-orchestrator/product-generation-strategy";

// --- Resolucao de canvas -------------------------------------------------

const KNOWN_CANVAS_SIZES: Record<string, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

/**
 * PURA. "9:16" e prioridade (ja coberta pela tabela). Para qualquer outro
 * "W:H" valido, deriva um canvas com largura base 1080 (mesma largura
 * usada em todo o resto do compositor de video existente,
 * lib/ugc/video-composer.ts) - nunca distorce, so recalcula a altura pela
 * proporcao pedida. Se o formato nao puder ser interpretado, cai no
 * default seguro 9:16 (documentado, nunca lanca).
 */
export function resolveCanvasSize(aspectRatio: string): { width: number; height: number } {
  const known = KNOWN_CANVAS_SIZES[aspectRatio];
  if (known) return known;

  const match = aspectRatio.match(/^(\d+):(\d+)$/);
  if (!match) return KNOWN_CANVAS_SIZES["9:16"];

  const ratioW = Number(match[1]);
  const ratioH = Number(match[2]);
  if (!ratioW || !ratioH) return KNOWN_CANVAS_SIZES["9:16"];

  const width = 1080;
  const height = Math.round((width * ratioH) / ratioW);
  return { width, height };
}

// --- Grafo de filtros (PURO) ---------------------------------------------

// Fracao da largura do canvas que o produto ocupa - conservador o
// suficiente para nunca cortar o produto nem invadir demais as bordas
// (criterio explicito do pedido). Mesmo valor para qualquer placement -
// so a posicao horizontal muda.
export const PRODUCT_WIDTH_RATIO = 0.55;
// Margem de seguranca (fracao da largura do canvas) usada quando o
// produto fica encostado numa lateral (LEFT/RIGHT) - evita "invasao
// excessiva de bordas".
export const SAFE_MARGIN_RATIO = 0.06;
// Fator de zoom linear maximo do SUBTLE_PUSH_IN (2% ao final da cena) -
// "deve ser pequeno e linear".
export const SUBTLE_PUSH_IN_MAX_ZOOM = 0.02;

// Whitelist EXPLICITA de filtros FFmpeg permitidos no grafo - usada tanto
// para montar o grafo quanto para o teste de integridade de pixels (ver
// assertFilterGraphIsGeometricOnly). Qualquer filtro fora desta lista
// alteraria cor/textura (ex: eq, hue, curves, unsharp) e NUNCA deve
// aparecer aqui. Esta whitelist e a UNICA usada para verificar o estagio
// que produz [prod] (o produto em si - ver assertProductLayerIsUnmodified)
// independente de sombra estar ativada ou nao.
export const ALLOWED_FILTER_NAMES = ["scale", "crop", "setsar", "format", "overlay", "trim", "setpts"] as const;

// Filtros ADICIONAIS permitidos SOMENTE na cadeia da sombra de contato
// (CANARY #6) - nunca aplicados ao produto em si. alphaextract/alphamerge
// so manipulam o canal alpha (nunca cor); boxblur/colorchannelmixer so
// tocam a mascara/camada sintetica preta da sombra; color e uma fonte
// sintetica (preto solido), nunca le pixel do produto.
export const ALLOWED_SHADOW_FILTER_NAMES = [
  ...ALLOWED_FILTER_NAMES,
  "alphaextract",
  "boxblur",
  "colorchannelmixer",
  "alphamerge",
  "color",
] as const;

// Sombra achatada (ratio da altura do produto) - contact shadow, nunca
// um drop-shadow do corpo inteiro. Interno, nao exposto como parametro
// (a forma da sombra e sempre "faixa achatada perto da base").
const SHADOW_HEIGHT_RATIO = 0.14;

// Defaults conservadores - nunca um preset por produto. enabled=false
// preserva EXATAMENTE o comportamento do compositor de antes desta
// feature quando productGrounding e omitido.
export const DEFAULT_PRODUCT_GROUNDING: ProductGroundingOptions = {
  enabled: false,
  shadowType: "CONTACT",
  opacity: 0.22,
  blurRadius: 12,
  horizontalScale: 1.15,
  verticalOffset: 6,
};

export function resolveProductGrounding(options?: Partial<ProductGroundingOptions>): ProductGroundingOptions {
  return { ...DEFAULT_PRODUCT_GROUNDING, ...options };
}

function productTargetWidth(canvasWidth: number): number {
  return Math.round(canvasWidth * PRODUCT_WIDTH_RATIO);
}

function safeMarginPx(canvasWidth: number): number {
  return Math.round(canvasWidth * SAFE_MARGIN_RATIO);
}

function buildProductScaleExpression(
  baseWidth: number,
  motion: ProductMotion,
  durationSeconds: number,
): string {
  if (motion === "NONE") {
    return `scale=${baseWidth}:-1`;
  }

  // SUBTLE_PUSH_IN: cresce linearmente de baseWidth ate
  // baseWidth*(1+SUBTLE_PUSH_IN_MAX_ZOOM) ao longo de toda a duracao.
  // `eval=frame` faz o FFmpeg reavaliar a expressao a cada frame (usa a
  // variavel de tempo `t`, em segundos, ja embutida no filtro scale).
  // Isso e uma transformacao do LAYER inteiro (largura do frame) - nunca
  // altera pixel/cor do conteudo interno da imagem.
  const growth = SUBTLE_PUSH_IN_MAX_ZOOM;
  return `scale=w='${baseWidth}*(1+${growth}*t/${durationSeconds})':h=-1:eval=frame`;
}

function buildOverlayPositionExpression(placement: ProductPlacement, canvasWidth: number): { x: string; y: string } {
  const y = "(H-h)/2";
  if (placement === "LEFT") return { x: String(safeMarginPx(canvasWidth)), y };
  if (placement === "RIGHT") return { x: `W-w-${safeMarginPx(canvasWidth)}`, y };
  return { x: "(W-w)/2", y };
}

/**
 * Versao NUMERICA (nao expressao ffmpeg) da mesma logica de
 * buildOverlayPositionExpression - so usada pra calcular a posicao da
 * SOMBRA (uma camada de tamanho diferente do produto, entao nao pode
 * reaproveitar "W-w" do produto diretamente). Precisa da altura real do
 * produto (derivada da proporcao real da imagem) - por isso so e usada
 * quando productGrounding esta habilitado e productImageDimensions e
 * conhecido. So valida/precisa para productMotion=NONE (com
 * SUBTLE_PUSH_IN a posicao real varia ~2% ao longo do clipe - aproximacao
 * aceitavel, documentada, nao coberta com precisao nesta primeira
 * versao).
 */
function computeNumericProductGeometry(
  canvasWidth: number,
  canvasHeight: number,
  productWidth: number,
  productHeight: number,
  placement: ProductPlacement,
): { x: number; y: number } {
  const y = Math.round((canvasHeight - productHeight) / 2);
  if (placement === "LEFT") return { x: safeMarginPx(canvasWidth), y };
  if (placement === "RIGHT") return { x: canvasWidth - productWidth - safeMarginPx(canvasWidth), y };
  return { x: Math.round((canvasWidth - productWidth) / 2), y };
}

/**
 * Monta a cadeia de filtros da sombra de contato, derivada SO do canal
 * alpha do produto (nunca de IA, nunca reconstrucao): extrai a
 * silhueta -> achata numa faixa fina perto da base -> desfoca -> tinge de
 * preto com a opacidade pedida. Devolve o filter_complex parcial (pra
 * concatenar com o resto) e a posicao/label da camada de sombra
 * resultante, pra ser sobreposta ao fundo ANTES do produto (produto
 * sempre por cima, intacto).
 */
function buildShadowFilterChain(
  grounding: ProductGroundingOptions,
  productWidth: number,
  productHeight: number,
  productX: number,
  productY: number,
  durationSeconds: number,
): { chain: string; x: number; y: number; width: number; height: number } {
  const shadowWidth = Math.max(1, Math.round(productWidth * grounding.horizontalScale));
  const shadowHeight = Math.max(1, Math.round(productHeight * SHADOW_HEIGHT_RATIO));

  // Centralizada horizontalmente sob o produto, colada a base (bottom =
  // productY + productHeight) + o deslocamento pedido pra baixo.
  const shadowX = Math.round(productX + (productWidth - shadowWidth) / 2);
  const shadowY = Math.round(productY + productHeight - shadowHeight / 2 + grounding.verticalOffset);

  const chain = [
    // Silhueta alpha do produto (independente da camada [prod] real -
    // deriva direto da entrada [1:v], sempre com alpha valido via
    // format=rgba mesmo quando backgroundRemovalMode=NONE, onde vira uma
    // silhueta retangular - degrada de forma segura, nunca quebra).
    `[1:v]format=rgba,alphaextract[shadow_alpha]`,
    `[shadow_alpha]scale=${shadowWidth}:${shadowHeight}[shadow_mask]`,
    `[shadow_mask]boxblur=${grounding.blurRadius}:${grounding.blurRadius}[shadow_mask_blurred]`,
    `color=black:s=${shadowWidth}x${shadowHeight}:d=${durationSeconds}[shadow_black]`,
    `[shadow_black][shadow_mask_blurred]alphamerge[shadow_merged]`,
    `[shadow_merged]colorchannelmixer=aa=${grounding.opacity}[shadow]`,
  ].join(";");

  return { chain, x: shadowX, y: shadowY, width: shadowWidth, height: shadowHeight };
}

export type BuildFilterGraphInput = {
  productPlacement: ProductPlacement;
  productMotion: ProductMotion;
  backgroundRemovalMode: BackgroundRemovalMode;
  durationSeconds: number;
  aspectRatio: string;
  // Sombra de contato opcional (CANARY #6) - omitir/enabled=false
  // preserva o grafo exatamente como era antes desta feature.
  productGrounding?: ProductGroundingOptions;
  // Dimensoes REAIS da imagem do produto (largura/altura) - so
  // necessarias quando productGrounding.enabled=true, pra calcular a
  // altura real renderizada do produto (a largura e sempre conhecida via
  // PRODUCT_WIDTH_RATIO, mas a altura depende da proporcao real da
  // imagem). null quando desconhecida - nesse caso a sombra e
  // desabilitada silenciosamente (nunca adivinha uma proporcao).
  productImageDimensions?: { width: number; height: number } | null;
};

/**
 * Monta o filter_complex INTEIRO como string, sem chamar ffmpeg - permite
 * testar o grafo exato que seria executado (posicao, escala, ausencia de
 * qualquer filtro de cor/textura) de forma 100% deterministica.
 *
 * Labels de entrada fixos: [0:v] = background, [1:v] = produto.
 */
export function buildHybridCompositeFilterGraph(input: BuildFilterGraphInput): CompositeFilterPlan {
  const { width: canvasWidth, height: canvasHeight } = resolveCanvasSize(input.aspectRatio);
  const productWidth = productTargetWidth(canvasWidth);

  const backgroundChain =
    `[0:v]scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=increase,` +
    `crop=${canvasWidth}:${canvasHeight},setsar=1[bg]`;

  const productScale = buildProductScaleExpression(productWidth, input.productMotion, input.durationSeconds);
  const formatStage = input.backgroundRemovalMode === "PREPROCESSED_ALPHA" ? "format=rgba," : "";
  const productChain = `[1:v]${formatStage}${productScale}[prod]`;

  const { x, y } = buildOverlayPositionExpression(input.productPlacement, canvasWidth);
  const overlayEval = input.productMotion === "SUBTLE_PUSH_IN" ? ":eval=frame" : "";

  const grounding = input.productGrounding;
  const canGround = Boolean(grounding?.enabled && input.productImageDimensions);

  if (!canGround) {
    // Caminho IDENTICO ao existente antes do CANARY #6 - sem sombra,
    // sem regressao pra quem nao pede grounding.
    const overlayChain = `[bg][prod]overlay=x=${x}:y=${y}${overlayEval}[outv]`;
    const filterComplex = [backgroundChain, productChain, overlayChain].join(";");
    return { filterComplex, videoOutputLabel: "[outv]", canvasWidth, canvasHeight };
  }

  // productMotion=NONE garante que a posicao/tamanho numericos batem
  // exatamente com o que a expressao "(W-w)/2" etc producao em runtime -
  // ver docstring de computeNumericProductGeometry.
  const dims = input.productImageDimensions as { width: number; height: number };
  const productHeight = Math.round(productWidth * (dims.height / dims.width));
  const { x: numericX, y: numericY } = computeNumericProductGeometry(
    canvasWidth,
    canvasHeight,
    productWidth,
    productHeight,
    input.productPlacement,
  );

  const shadow = buildShadowFilterChain(
    grounding as ProductGroundingOptions,
    productWidth,
    productHeight,
    numericX,
    numericY,
    input.durationSeconds,
  );

  const bgWithShadowChain = `[bg][shadow]overlay=x=${shadow.x}:y=${shadow.y}[bg_grounded]`;
  const finalOverlayChain = `[bg_grounded][prod]overlay=x=${x}:y=${y}${overlayEval}[outv]`;

  const filterComplex = [backgroundChain, productChain, shadow.chain, bgWithShadowChain, finalOverlayChain].join(";");

  return { filterComplex, videoOutputLabel: "[outv]", canvasWidth, canvasHeight };
}

/**
 * Prova (sem comparar frames bit-a-bit) de que o grafo so contem
 * transformacoes geometricas permitidas - extrai cada nome de filtro do
 * filter_complex e confere contra ALLOWED_FILTER_NAMES. Lanca se
 * encontrar qualquer filtro fora da whitelist (ex: um `eq`/`hue`/`curves`
 * introduzido por engano alteraria cor/textura do produto).
 */
function extractFilterNamesFromStage(stage: string): string[] {
  const withoutLabels = stage.replace(/\[[^\]]*\]/g, "");
  return withoutLabels
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split("=")[0].trim());
}

/**
 * Confere CADA estagio do grafo contra uma whitelist. Use
 * ALLOWED_FILTER_NAMES (so geometrico) quando nao ha sombra; use
 * ALLOWED_SHADOW_FILTER_NAMES quando a sombra de contato esta ativa (ela
 * introduz filtros que so tocam a mascara/camada sintetica da sombra,
 * nunca o produto - ver assertProductLayerIsUnmodified pra garantia
 * especifica do produto).
 */
export function assertFilterGraphIsGeometricOnly(
  filterComplex: string,
  allowedNames: readonly string[] = ALLOWED_FILTER_NAMES,
): void {
  const stages = filterComplex.split(";");
  for (const stage of stages) {
    for (const name of extractFilterNamesFromStage(stage)) {
      if (!allowedNames.includes(name)) {
        throw new Error(
          `Filtro "${name}" nao esta na whitelist de transformacoes permitidas ` +
            `(${allowedNames.join(", ")}) - o compositor hibrido nunca deve aplicar filtros de cor/textura ao produto.`,
        );
      }
    }
  }
}

/**
 * Garantia ESPECIFICA (independente de sombra estar ativa ou nao): o
 * estagio que produz [prod] - a camada com os pixels REAIS do produto,
 * a que efetivamente vai pro overlay final - so pode conter
 * transformacoes geometricas puras (ALLOWED_FILTER_NAMES), nunca
 * blur/cor, mesmo que a cadeia da sombra (derivada separadamente de
 * [1:v], nunca de [prod]) use filtros adicionais. Lanca se nao encontrar
 * nenhum estagio produzindo [prod] (grafo malformado) ou se esse
 * estagio tiver qualquer filtro fora da whitelist geometrica.
 */
export function assertProductLayerIsUnmodified(filterComplex: string): void {
  const stages = filterComplex.split(";");
  const productStage = stages.find((stage) => /\[prod\]\s*$/.test(stage.trim()));

  if (!productStage) {
    throw new Error("Nenhum estagio produzindo [prod] foi encontrado no grafo - integridade do produto nao pode ser confirmada.");
  }

  for (const name of extractFilterNamesFromStage(productStage)) {
    if (!(ALLOWED_FILTER_NAMES as readonly string[]).includes(name)) {
      throw new Error(
        `Filtro "${name}" no estagio do PRODUTO ([prod]) nao e geometrico - isso alteraria pixel/cor do produto, nunca permitido.`,
      );
    }
  }
}

// --- Ponte com o Generation Orchestrator ---------------------------------

/**
 * Traduz um HybridCompositePlan (do Generation Orchestrator - foco em
 * PROMPT, para a fase de geracao do fundo) num HybridCompositeRequest
 * (foco em ARQUIVOS, para este compositor) - a interface pedida pelo
 * item 14 do pedido original. NAO executa nada - so monta o request.
 * Quem chama e responsavel por ja ter o background gerado e a imagem do
 * produto acessivel localmente (download, se necessario, e
 * responsabilidade de uma fase futura de integracao).
 */
export function buildHybridCompositeRequestFromPlan(
  plan: HybridCompositePlan,
  options: {
    backgroundVideoPath: string;
    productImagePath: string;
    outputPath: string;
    durationSeconds: number;
    aspectRatio: string;
    productMotion: ProductMotion;
    backgroundRemovalMode: BackgroundRemovalMode;
  },
): HybridCompositeRequest {
  return {
    backgroundVideoPath: options.backgroundVideoPath,
    productImagePath: options.productImagePath,
    productPlacement: plan.productPlacement,
    durationSeconds: options.durationSeconds,
    aspectRatio: options.aspectRatio,
    preserveProductPixels: true,
    productMotion: options.productMotion,
    backgroundRemovalMode: options.backgroundRemovalMode,
    outputPath: options.outputPath,
  };
}

// --- Execucao (IMPURA - unica parte deste modulo que chama ffmpeg) ------

function findFfmpegPath(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  try {
    const command = process.platform === "win32" ? "where ffmpeg" : "which ffmpeg";
    const result = execSync(command).toString().split("\n")[0].trim();
    if (result && fs.existsSync(result)) return result;
  } catch {
    // ignora - tenta o proximo fallback
  }
  return "ffmpeg";
}

function probeOutput(outputPath: string): Promise<{ duration: number; width: number; height: number; fps: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(outputPath, (err, data) => {
      if (err) return reject(err);
      const stream = data.streams.find((s) => s.codec_type === "video");
      if (!stream) return reject(new Error("Output nao tem stream de video."));

      const fpsRaw = stream.r_frame_rate ?? "0/1";
      const [num, den] = fpsRaw.split("/").map(Number);
      const fps = den ? num / den : 0;

      resolve({
        duration: Number(data.format.duration ?? 0),
        width: Number(stream.width ?? 0),
        height: Number(stream.height ?? 0),
        fps,
      });
    });
  });
}

/**
 * Executa a composicao de verdade via FFmpeg local - NUNCA chama nenhum
 * provider de IA, NUNCA sobe nada pro Storage (quem chama decide o que
 * fazer com outputPath depois). preserveProductPixels e sempre true no
 * tipo (garantido em tempo de compilacao) - o unico jeito de "desativar"
 * a preservacao seria mudar o tipo, nao um parametro em runtime.
 */
export async function runHybridProductComposite(request: HybridCompositeRequest): Promise<HybridCompositeResult> {
  if (!fs.existsSync(request.backgroundVideoPath)) {
    return {
      status: "FAILED",
      outputPath: null,
      duration: null,
      width: null,
      height: null,
      fps: null,
      error: `backgroundVideoPath nao encontrado: ${request.backgroundVideoPath}`,
    };
  }
  if (!fs.existsSync(request.productImagePath)) {
    return {
      status: "FAILED",
      outputPath: null,
      duration: null,
      width: null,
      height: null,
      fps: null,
      error: `productImagePath nao encontrado: ${request.productImagePath}`,
    };
  }

  const groundingRequested = Boolean(request.productGrounding?.enabled);
  // So le as dimensoes reais do produto quando a sombra e pedida - nao
  // adiciona I/O nenhum ao caminho existente sem grounding.
  const productImageDimensions = groundingRequested
    ? parseImageDimensions(fs.readFileSync(request.productImagePath))
    : null;

  const filterPlan = buildHybridCompositeFilterGraph({
    productPlacement: request.productPlacement,
    productMotion: request.productMotion,
    backgroundRemovalMode: request.backgroundRemovalMode,
    durationSeconds: request.durationSeconds,
    aspectRatio: request.aspectRatio,
    productGrounding: request.productGrounding,
    productImageDimensions,
  });

  // Belt-and-suspenders: mesmo em execucao real, confirma que o grafo
  // sobre o qual estamos prestes a rodar ffmpeg so contem transformacoes
  // permitidas antes de executar - E que o estagio do PRODUTO em si
  // continua restrito a transformacoes geometricas mesmo quando a sombra
  // (com blur/cor na sua propria camada sintetica) esta ativa.
  const hasShadow = filterPlan.filterComplex.includes("[shadow]");
  assertFilterGraphIsGeometricOnly(filterPlan.filterComplex, hasShadow ? ALLOWED_SHADOW_FILTER_NAMES : ALLOWED_FILTER_NAMES);
  assertProductLayerIsUnmodified(filterPlan.filterComplex);

  ffmpeg.setFfmpegPath(findFfmpegPath());

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(request.backgroundVideoPath)
        .input(request.productImagePath)
        .complexFilter(filterPlan.filterComplex, filterPlan.videoOutputLabel.replace(/[[\]]/g, ""))
        .outputOptions([
          "-t",
          request.durationSeconds.toString(),
          // Video silencioso nesta fase - se o background tiver audio, e
          // descartado (nunca misturado sem decisao explicita futura).
          "-an",
          "-c:v",
          "mpeg4",
          "-pix_fmt",
          "yuv420p",
        ])
        .on("error", (error) => reject(error))
        .on("end", () => resolve())
        .save(request.outputPath);
    });

    const probed = await probeOutput(request.outputPath);

    return {
      status: "COMPLETED",
      outputPath: request.outputPath,
      duration: probed.duration,
      width: probed.width,
      height: probed.height,
      fps: probed.fps,
      error: null,
    };
  } catch (error) {
    return {
      status: "FAILED",
      outputPath: null,
      duration: null,
      width: null,
      height: null,
      fps: null,
      error: error instanceof Error ? error.message : "Erro desconhecido no compositor hibrido.",
    };
  }
}
