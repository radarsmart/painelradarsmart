// Radar Creative AI - Commercial Video Pipeline / Timeline Builder
//
// PURO - recebe o CampaignPromptPlan JA PRONTO (Prompt Builder - unica
// fonte de overlayInstructions/safeAreaDirection, ja separados da
// geracao visual desde a fase do Prompt Builder) e monta a timeline
// (ordem, start/end calculados por soma de duracao, transicoes) - nunca
// recalcula framework/angulo/duracao de cena, o Commercial Director
// continua sendo a unica fonte dessas decisoes.

import { resolveCanvasSize } from "@/lib/compositor/hybrid-product-compositor";
import type { CampaignPromptPlan } from "@/lib/prompt-builder/types";
import type { CommercialTimeline, CommercialVideoSceneAsset, SceneAssetStatus, TransitionType } from "@/lib/commercial-video/types";

export const DEFAULT_FPS = 24; // mesmo fps ja usado em todo o resto do projeto (normalizeClip, Hybrid Compositor)

export type TransitionOverride = { in?: TransitionType; out?: TransitionType };

export type BuildCommercialTimelineOptions = {
  campaignId: string;
  aspectRatio: string;
  fps?: number;
  // sceneId -> caminho do MP4 ja pronto, ou null se ainda nao existe
  // (vira MISSING_ASSET - nunca inventamos um caminho).
  sceneVideoPaths: Record<string, string | null>;
  // sceneId -> override de transicao - omitido = CUT em ambas as pontas
  // (default conservador, "so CROSSFADE quando indicado explicitamente").
  transitionOverrides?: Record<string, TransitionOverride>;
  // sceneId -> provider real que gerou o asset - OPCIONAL (ver
  // CommercialVideoSceneAsset.provider em types.ts). Omitido = nenhuma
  // cena e elegivel para scene-duration-padding.ts (comportamento
  // identico ao anterior desta correcao).
  sceneProviders?: Record<string, string | null>;
};

function resolveSceneStatus(path: string | null): SceneAssetStatus {
  return path ? "READY" : "MISSING_ASSET";
}

/**
 * Monta a CommercialTimeline inteira - cenas ordenadas por sceneOrder,
 * start/end calculados por soma acumulada de durationSeconds (nunca
 * reaproveita startSecond/endSecond do Commercial Director, que sao
 * so a intencao de ROTEIRO, nao a duracao real do asset de video final -
 * embora hoje sejam o mesmo numero, a fonte de verdade pra MONTAGEM e
 * sempre a duracao do proprio SceneGenerationPrompt).
 */
export function buildCommercialTimeline(
  promptPlan: CampaignPromptPlan,
  options: BuildCommercialTimelineOptions,
): CommercialTimeline {
  const { width, height } = resolveCanvasSize(options.aspectRatio);
  const fps = options.fps ?? DEFAULT_FPS;

  const orderedScenes = [...promptPlan.scenes].sort((a, b) => a.sceneOrder - b.sceneOrder);

  let cursor = 0;
  const scenes: CommercialVideoSceneAsset[] = orderedScenes.map((scene) => {
    const startTime = cursor;
    const endTime = cursor + scene.durationSeconds;
    cursor = endTime;

    const override = options.transitionOverrides?.[scene.sceneId];
    const videoPath = options.sceneVideoPaths[scene.sceneId] ?? null;
    const provider = options.sceneProviders?.[scene.sceneId] ?? null;

    return {
      sceneId: scene.sceneId,
      sceneOrder: scene.sceneOrder,
      purpose: scene.purpose,
      inputVideoPath: videoPath,
      status: resolveSceneStatus(videoPath),
      durationSeconds: scene.durationSeconds,
      startTime,
      endTime,
      transitionIn: override?.in ?? "CUT",
      transitionOut: override?.out ?? "CUT",
      overlays: scene.overlayInstructions,
      safeAreaDirection: scene.safeAreaDirection,
      brandOverlayRequired: scene.brandOverlayRequired,
      provider,
    };
  });

  return {
    campaignId: options.campaignId,
    aspectRatio: options.aspectRatio,
    width,
    height,
    fps,
    scenes,
    totalDurationSeconds: cursor,
  };
}

/**
 * Verdadeiro so se TODAS as cenas tiverem asset pronto - o render final
 * deve ser bloqueado (BLOCKED_MISSING_ASSET) caso contrario, nunca
 * renderizado com um buraco silencioso.
 */
export function isTimelineReadyToRender(timeline: CommercialTimeline): boolean {
  return timeline.scenes.every((scene) => scene.status === "READY");
}

export function listMissingSceneIds(timeline: CommercialTimeline): string[] {
  return timeline.scenes.filter((scene) => scene.status === "MISSING_ASSET").map((scene) => scene.sceneId);
}
