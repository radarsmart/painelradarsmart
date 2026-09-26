// Radar Creative AI - Commercial Video Pipeline / Scene Assembly - Types
//
// Primeira camada do Commercial Video Pipeline V1: pega cenas JA
// PRONTAS (hoje, fixtures/mock locais - amanha, os MP4s reais que saem
// do Generation Orchestrator/Hybrid Compositor) e monta um comercial
// unico, respeitando a ordem/duracao ja decidida pelo Commercial
// Director/Prompt Builder. Este modulo NUNCA decide estrategia
// comercial (framework/angulo/duracao de cena) - so monta o que ja foi
// decidido em video.
//
// DECISAO DE TECNOLOGIA (FFmpeg vs Remotion, ver relatorio): FFmpeg.
// Remotion (lib/tiktok-engine/remotion/*) resolve um problema DIFERENTE
// - gerar um video inteiro a partir de um template React (zonas de
// tempo, texto animado, spring physics), sem nenhum clipe de video real
// de entrada. Aqui o problema e o oposto: JA temos 5 clipes de video
// prontos e precisamos concatena-los, aplicar transicao simples entre
// eles e sobrepor texto/logo estaticos em posicoes fixas (safe area) -
// exatamente o que `concat`/`xfade`/`drawtext` do FFmpeg fazem
// nativamente, e o mesmo padrao ja comprovado no Hybrid Product
// Compositor (lib/compositor/hybrid-product-compositor.ts) e no
// compositor de video mais antigo (lib/ugc/video-composer.ts). Usar
// Remotion aqui exigiria reescrever a composicao inteira como
// componentes React consumindo <Video> - uma reescrita muito mais
// pesada (renderizacao via Chromium) pra resolver um problema que o
// FFmpeg ja resolve de forma mais simples e determinista.

import type { ScenePurpose } from "@/lib/commercial-director/types";
import type { OverlayInstructions, SafeAreaDirection } from "@/lib/prompt-builder/types";
import type { SceneDurationAdjustment } from "@/lib/commercial-video/scene-duration-padding";

export type TransitionType = "CUT" | "CROSSFADE";

export type SceneAssetStatus = "READY" | "MISSING_ASSET";

export type CommercialVideoSceneAsset = {
  sceneId: string;
  sceneOrder: number;
  purpose: ScenePurpose;
  // null quando status === "MISSING_ASSET" - nunca inventa/gera um
  // asset pra preencher o buraco.
  inputVideoPath: string | null;
  status: SceneAssetStatus;
  durationSeconds: number;
  // Posicao na timeline final (segundos desde o inicio do comercial) -
  // calculada pelo Timeline Builder, nunca informada manualmente.
  startTime: number;
  endTime: number;
  transitionIn: TransitionType;
  transitionOut: TransitionType;
  overlays: OverlayInstructions;
  safeAreaDirection: SafeAreaDirection;
  brandOverlayRequired: boolean;
  // Provider real que gerou o asset - OPCIONAL, so preenchido quando o
  // chamador sabe (ver timeline-builder.ts#BuildCommercialTimelineOptions.sceneProviders).
  // Usado exclusivamente pela policy de scene-duration-padding.ts para
  // decidir se um asset mais curto que durationSeconds pode ser esticado
  // (FREEZE_LAST_FRAME) - null/omitido sempre resulta em NENHUM esticamento
  // (mesmo comportamento anterior a esta correcao, so corte via -t).
  provider?: string | null;
};

export type CommercialTimeline = {
  campaignId: string;
  aspectRatio: string;
  width: number;
  height: number;
  fps: number;
  scenes: CommercialVideoSceneAsset[];
  totalDurationSeconds: number;
};

export type CommercialRenderStatus =
  | "COMPLETED"
  | "FAILED"
  | "BLOCKED_MISSING_ASSET"
  | "BLOCKED_SCENE_DURATION_MISMATCH"
  | "BLOCKED_OVERLAY_LAYOUT";

export type CommercialRenderResult = {
  status: CommercialRenderStatus;
  outputPath: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  error: string | null;
  // Traceability por cena (item 2 do pedido COMMERCIAL V2 FINAL ASSEMBLY
  // FIX V1) - so entradas != NONE aparecem aqui, uma por sceneId.
  durationAdjustments: Record<string, SceneDurationAdjustment>;
};

// Overlay de marca (logo Radar Smart) - sempre um asset de IMAGEM ja
// existente (nunca gerado por IA), aplicado pelo compositor como layer
// grafico fixo. Ver DEFAULT_BRAND_LOGO_PATH em overlay-renderer.ts.
export type BrandOverlayConfig = {
  logoPath: string;
  // Fracao da largura do canvas que o logo ocupa.
  widthRatio: number;
  marginPx: number;
};
