// Radar Creative AI - Commercial Video Pipeline / Overlay Renderer
//
// Constroi os filtros FFmpeg (drawtext/overlay) que aplicam preco/
// desconto/CTA/logo POR CIMA de uma cena ja pronta - nunca pede pro
// provider generativo desenhar esse texto (overlayInstructions existe
// desde o Prompt Builder exatamente pra isso, ver
// lib/prompt-builder/overlay-plan.ts). Texto e sempre renderizado pelo
// compositor a partir do valor EXATO ja persistido - nunca recalculado/
// reformatado aqui (preco/desconto/CTA continuam responsabilidade do
// Commercial Director).

import fs from "node:fs";
import path from "node:path";
import type { SafeAreaDirection } from "@/lib/prompt-builder/types";
import {
  DEFAULT_CTA_OVERLAY_LAYOUT_POLICY,
  resolveCtaOverlayLayout,
  type CtaOverlayLayoutPolicy,
  type CtaOverlayLayoutResult,
} from "@/lib/commercial-video/cta-overlay-layout";

// --- Fonte para drawtext (IMPURA - checa arquivos no disco) --------------

export type ResolvedFont = { fontPath: string; source: "ENV" | "LOCAL_FALLBACK" };

// GAP CONHECIDO (documentado no relatorio, nao escondido): o projeto nao
// tem uma fonte .ttf/.otf empacotada em public/ hoje. Estes fallbacks so
// funcionam em ambiente Windows local com essas fontes instaladas -
// NUNCA vao existir num deploy serverless (Vercel). Producao precisa de
// uma fonte real em public/fonts/*.ttf antes deste modulo sair da fase
// de teste local.
const LOCAL_FALLBACK_FONT_PATHS = [
  "C:/Windows/Fonts/arialbd.ttf",
  "C:/Windows/Fonts/arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
];

export function resolveDrawTextFont(): ResolvedFont | null {
  const envPath = process.env.COMMERCIAL_VIDEO_FONT_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return { fontPath: envPath, source: "ENV" };
  }
  for (const candidate of LOCAL_FALLBACK_FONT_PATHS) {
    if (fs.existsSync(candidate)) {
      return { fontPath: candidate, source: "LOCAL_FALLBACK" };
    }
  }
  return null;
}

// --- Logo (asset oficial ja cadastrado, nunca gerado) --------------------

export function resolveDefaultBrandLogoPath(): string {
  return path.join(process.cwd(), "public", "logo-radar-smart.png");
}

// --- Posicionamento por safe area (PURO) ---------------------------------

export type SafeAreaPosition = { x: string; y: string };

/**
 * x/y sao expressoes FFmpeg avaliadas no contexto do proprio drawtext -
 * w/h = dimensoes do frame, text_w/text_h = dimensoes do texto
 * renderizado (variaveis nativas do filtro, nao valores fixos).
 */
export function resolveSafeAreaPosition(direction: SafeAreaDirection): SafeAreaPosition {
  switch (direction) {
    case "TOP":
      return { x: "(w-text_w)/2", y: "h*0.08" };
    case "BOTTOM":
      return { x: "(w-text_w)/2", y: "h*0.82" };
    case "LEFT":
      return { x: "w*0.06", y: "(h-text_h)/2" };
    case "RIGHT":
      return { x: "w-text_w-w*0.06", y: "(h-text_h)/2" };
    case "CENTER_CLEAR":
    case "NONE":
    default:
      return { x: "(w-text_w)/2", y: "(h-text_h)/2" };
  }
}

// --- Escaping (PURO) -------------------------------------------------------

/**
 * Escapa os caracteres especiais do parser de filtro do FFmpeg dentro de
 * um valor de texto (drawtext text='...'). Aspas simples sao trocadas
 * por aspas tipograficas (') em vez de escapadas - visualmente quase
 * identico e evita a complexidade de escaping aninhado (backslash +
 * aspas simples dentro de uma string ja delimitada por aspas simples).
 */
export function escapeDrawtextValue(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019");
}

/**
 * Escapa especificamente um caminho de arquivo usado como valor de opcao
 * (fontfile=/logo path) - em Windows o `:` da letra de unidade (C:/...)
 * quebra o parser de filtergraph do FFmpeg mesmo dentro de aspas simples,
 * entao ele precisa do MESMO escaping `\:` que um valor de texto comum.
 */
export function escapeDrawtextPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

// --- Filtros (PURO) --------------------------------------------------------

const OFFER_FONT_SIZE = 54;
const OVERLAY_FONT_COLOR = "white";
const OVERLAY_BOX_COLOR = "black@0.45";
const OVERLAY_BOX_BORDER = 18;

// Precisa ser MAIOR que a altura real da caixa (fontsize + 2*boxborderw +
// folga do glifo) - com 70px (fontsize+16) a segunda caixa (preco)
// desenhava por cima da primeira (desconto) e escondia o texto inteiro,
// nao so parcialmente. Confirmado visualmente no teste do comercial
// sintetico de 20s (cena OFFER).
const OFFER_LINE_HEIGHT = OFFER_FONT_SIZE + 2 * OVERLAY_BOX_BORDER + 20;

/**
 * Empilha discountText + priceText como DUAS instancias de drawtext
 * encadeadas por virgula (nunca um unico texto multi-linha - um `\n`
 * literal dentro do valor quebra o parser de filtergraph do FFmpeg) -
 * so existe quando pelo menos um dos dois estiver presente. Usa
 * exatamente os textos persistidos, nunca reformata preco/desconto.
 */
export function buildOfferDrawtextFilter(
  fontPath: string,
  discountText: string | null,
  priceText: string | null,
  safeArea: SafeAreaDirection,
): string | null {
  const lines = [discountText, priceText].filter((value): value is string => Boolean(value));
  if (lines.length === 0) return null;

  const { x, y } = resolveSafeAreaPosition(safeArea);
  const escapedFont = escapeDrawtextPath(fontPath);

  return lines
    .map((line, index) => {
      const escaped = escapeDrawtextValue(line);
      const yExpr = index === 0 ? y : `(${y})+${OFFER_LINE_HEIGHT * index}`;
      return (
        `drawtext=fontfile='${escapedFont}':text='${escaped}':expansion=none:fontsize=${OFFER_FONT_SIZE}:` +
        `fontcolor=${OVERLAY_FONT_COLOR}:x=${x}:y=${yExpr}:` +
        `box=1:boxcolor=${OVERLAY_BOX_COLOR}:boxborderw=${OVERLAY_BOX_BORDER}`
      );
    })
    .join(",");
}

// Mesma formula ja usada em OFFER_LINE_HEIGHT (agora generalizada por
// fontSize, ja que o CTA responsivo pode reduzir o fontSize default) -
// altura precisa ser MAIOR que a caixa real (fontsize + 2*boxborderw +
// folga do glifo), mesmo motivo documentado ali.
function computeLineHeight(fontSize: number): number {
  return fontSize + 2 * OVERLAY_BOX_BORDER + 20;
}

export type CtaDrawtextResult = { filter: string | null; layout: CtaOverlayLayoutResult | null };

/**
 * Responsivo (item 4 do pedido SUBJECT-AWARE... na verdade do pedido
 * COMMERCIAL V2 FINAL ASSEMBLY FIX V1): mede (estima) o texto ANTES de
 * montar o filtro - reduz fontSize progressivamente e quebra em ate
 * policy.maxLines linhas quando necessario (cada linha = uma instancia de
 * drawtext encadeada, mesmo padrao ja usado em buildOfferDrawtextFilter -
 * nunca um `\n` literal, que quebraria o parser de filtergraph do FFmpeg).
 * Nunca renderiza texto cortado silenciosamente: quando nem minFontSize +
 * maxLines resolve, devolve layout.status="BLOCKED_OVERLAY_LAYOUT" e
 * filter=null - o CALLER (commercial-video-composer.ts) decide o que
 * fazer com isso (nunca ignorar, ver item 6 do pedido).
 */
export function buildCtaDrawtextFilter(
  fontPath: string,
  ctaText: string | null,
  safeArea: SafeAreaDirection,
  frameWidthPx: number,
  policy: CtaOverlayLayoutPolicy = DEFAULT_CTA_OVERLAY_LAYOUT_POLICY,
): CtaDrawtextResult {
  if (!ctaText) return { filter: null, layout: null };

  const layout = resolveCtaOverlayLayout(ctaText, frameWidthPx, policy);
  if (layout.status === "BLOCKED_OVERLAY_LAYOUT") {
    return { filter: null, layout };
  }

  const { x, y } = resolveSafeAreaPosition(safeArea);
  const escapedFont = escapeDrawtextPath(fontPath);
  const lineHeight = computeLineHeight(layout.fontSize);

  const filter = layout.lines
    .map((line, index) => {
      const escaped = escapeDrawtextValue(line);
      const yExpr = index === 0 ? y : `(${y})+${lineHeight * index}`;
      return (
        `drawtext=fontfile='${escapedFont}':text='${escaped}':expansion=none:fontsize=${layout.fontSize}:` +
        `fontcolor=${OVERLAY_FONT_COLOR}:x=${x}:y=${yExpr}:` +
        `box=1:boxcolor=${OVERLAY_BOX_COLOR}:boxborderw=${OVERLAY_BOX_BORDER}`
      );
    })
    .join(",");

  return { filter, layout };
}

/**
 * Overlay do logo - mesmo padrao ja usado em lib/ugc/video-composer.ts
 * (canto inferior direito, escala fixa por largura). O logo em si e
 * escalado num estagio separado ANTES deste overlay (ver
 * commercial-video-composer.ts) - esta funcao so devolve a posicao.
 */
export function buildBrandLogoOverlayPosition(marginPx: number): { x: string; y: string } {
  return { x: `W-w-${marginPx}`, y: `H-h-${marginPx}` };
}
