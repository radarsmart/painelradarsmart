// Radar Creative AI - Commercial Video Pipeline / Commercial Video Composer
//
// UNICA parte impura desta camada: pega uma CommercialTimeline ja
// montada (timeline-builder.ts) e produz o MP4 final via FFmpeg, em duas
// passadas:
//   1) PREPARE - por cena: normaliza (scale/crop/fps, sem distorcao),
//      corta pra duracao exata, aplica overlays (preco/desconto/CTA/
//      logo) - tudo em UM arquivo por cena.
//   2) ASSEMBLY - concatena as cenas preparadas na ordem certa, usando
//      CUT (concat) ou CROSSFADE (xfade) conforme a timeline - nunca
//      gera nem chama nenhum provider de IA.
//
// V1 nao tem audio ainda (ver Audio Pipeline, fase futura) - toda saida
// desta camada e video mudo (-an), mesma convencao do Hybrid Compositor.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";

import {
  buildBrandLogoOverlayPosition,
  buildCtaDrawtextFilter,
  buildOfferDrawtextFilter,
  resolveDefaultBrandLogoPath,
  resolveDrawTextFont,
} from "@/lib/commercial-video/overlay-renderer";
import { isTimelineReadyToRender, listMissingSceneIds } from "@/lib/commercial-video/timeline-builder";
import { resolveSceneDurationAdjustment, type SceneDurationAdjustment } from "@/lib/commercial-video/scene-duration-padding";
import { FINAL_VIDEO_CODEC_POLICY, assertFinalVideoEncoderReady, configureCommercialFfmpegPaths } from "@/lib/commercial-video/final-video-codec-policy";
import type { CommercialRenderResult, CommercialTimeline, CommercialVideoSceneAsset } from "@/lib/commercial-video/types";
import type { SceneAssetTraceEntry } from "@/lib/commercial-video/scene-asset-types";

export const XFADE_DURATION_SECONDS = 0.5;

// Reusado tanto para medir o output final quanto (novo, ver
// scene-duration-padding.ts) a duracao REAL de cada clipe de entrada -
// antes desta correcao, ninguem media o clipe de entrada, so confiava
// cegamente que scene.durationSeconds (o slot PLANEJADO) era sempre <=
// a duracao real do asset (verdade para Kling/WAN, falso para HeyGen).
function probeVideoFile(filePath: string): Promise<{ duration: number; width: number; height: number; fps: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const stream = data.streams.find((s) => s.codec_type === "video");
      if (!stream) return reject(new Error(`Arquivo "${filePath}" nao tem stream de video.`));
      const fpsRaw = stream.r_frame_rate ?? "0/1";
      const [num, den] = fpsRaw.split("/").map(Number);
      resolve({
        duration: Number(data.format.duration ?? 0),
        width: Number(stream.width ?? 0),
        height: Number(stream.height ?? 0),
        fps: den ? num / den : 0,
      });
    });
  });
}

// --- PASSO 1: preparar cada cena (PURO o montador de filtro, IMPURO o executor) ---

export type ScenePrepareFilterGraphResult =
  | { status: "OK"; filterGraph: string }
  | { status: "BLOCKED_OVERLAY_LAYOUT"; reason: string };

export function buildScenePrepareFilterGraph(
  scene: CommercialVideoSceneAsset,
  width: number,
  height: number,
  fps: number,
  fontPath: string | null,
  includeLogo: boolean,
  durationAdjustment: SceneDurationAdjustment = { type: "NONE" },
): ScenePrepareFilterGraphResult {
  const stages: string[] = [];
  stages.push(`[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},setsar=1[scaled]`);

  // FREEZE_LAST_FRAME (item 2 do pedido COMMERCIAL V2 FINAL ASSEMBLY FIX
  // V1): clona o ultimo frame ja existente pelo tempo de padding
  // necessario - nunca time-stretch, nunca duplica audio (a cena e sempre
  // renderizada muda, -an, o audio real continua vindo so do Audio
  // Pipeline separado, ver audio-timeline-builder.ts).
  let currentLabel = "scaled";
  if (durationAdjustment.type === "FREEZE_LAST_FRAME") {
    stages.push(`[scaled]tpad=stop_mode=clone:stop_duration=${durationAdjustment.paddingDuration.toFixed(3)}[base]`);
    currentLabel = "base";
  } else {
    stages.push(`[scaled]null[base]`);
    currentLabel = "base";
  }

  let stageIndex = 0;

  const offerFilter = fontPath
    ? buildOfferDrawtextFilter(fontPath, scene.overlays.discountText, scene.overlays.priceText, scene.safeAreaDirection)
    : null;
  if (offerFilter) {
    const nextLabel = `t${stageIndex}`;
    stageIndex += 1;
    stages.push(`[${currentLabel}]${offerFilter}[${nextLabel}]`);
    currentLabel = nextLabel;
  }

  const ctaResult = fontPath ? buildCtaDrawtextFilter(fontPath, scene.overlays.ctaText, scene.safeAreaDirection, width) : { filter: null, layout: null };
  if (ctaResult.layout?.status === "BLOCKED_OVERLAY_LAYOUT") {
    return { status: "BLOCKED_OVERLAY_LAYOUT", reason: ctaResult.layout.reason };
  }
  if (ctaResult.filter) {
    const nextLabel = `t${stageIndex}`;
    stageIndex += 1;
    stages.push(`[${currentLabel}]${ctaResult.filter}[${nextLabel}]`);
    currentLabel = nextLabel;
  }

  if (scene.brandOverlayRequired && includeLogo) {
    const { x, y } = buildBrandLogoOverlayPosition(24);
    stages.push(`[1:v]scale=${Math.round(width * 0.22)}:-1[logo]`);
    const nextLabel = `t${stageIndex}`;
    stageIndex += 1;
    stages.push(`[${currentLabel}][logo]overlay=x=${x}:y=${y}[${nextLabel}]`);
    currentLabel = nextLabel;
  }

  // Label final estavel mesmo quando nenhum overlay foi aplicado (cena
  // sem preco/desconto/CTA/logo) - copyprop trivial via `null`.
  stages.push(`[${currentLabel}]null[outv]`);

  return { status: "OK", filterGraph: stages.join(";") };
}

export type PrepareSceneClipResult =
  | { status: "OK"; durationAdjustment: SceneDurationAdjustment }
  | { status: "BLOCKED_SCENE_DURATION_MISMATCH"; reason: string; durationAdjustment: SceneDurationAdjustment }
  | { status: "BLOCKED_OVERLAY_LAYOUT"; reason: string };

async function prepareSceneClip(
  scene: CommercialVideoSceneAsset,
  timeline: CommercialTimeline,
  fontPath: string | null,
  logoPath: string | null,
  outputPath: string,
): Promise<PrepareSceneClipResult> {
  const includeLogo = Boolean(scene.brandOverlayRequired && logoPath);

  // scene-duration-padding.ts (item 2 do pedido): mede a duracao REAL do
  // asset de entrada ANTES de montar o filtro - nunca mais assume
  // cegamente que ela e >= scene.durationSeconds (verdade pra Kling/WAN,
  // falso pra HeyGen quando a fala e curta).
  const sourceProbe = await probeVideoFile(scene.inputVideoPath as string);
  const durationAdjustment = resolveSceneDurationAdjustment({
    provider: scene.provider ?? null,
    originalDurationSeconds: sourceProbe.duration,
    plannedDurationSeconds: scene.durationSeconds,
  });

  if (durationAdjustment.type === "BLOCKED_SCENE_DURATION_MISMATCH") {
    return { status: "BLOCKED_SCENE_DURATION_MISMATCH", reason: durationAdjustment.reason, durationAdjustment };
  }

  const filterResult = buildScenePrepareFilterGraph(scene, timeline.width, timeline.height, timeline.fps, fontPath, includeLogo, durationAdjustment);
  if (filterResult.status === "BLOCKED_OVERLAY_LAYOUT") {
    return { status: "BLOCKED_OVERLAY_LAYOUT", reason: filterResult.reason };
  }

  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg().input(scene.inputVideoPath as string);
    if (includeLogo) command.input(logoPath as string);

    command
      .complexFilter(filterResult.filterGraph, "outv")
      // MP4 final publicavel: H.264/avc1 via h264_mf no Windows.
      // libx264 e mpeg4/mp4v sao bloqueados pela politica do projeto.
      .outputOptions([
        "-t",
        scene.durationSeconds.toString(),
        "-an",
        "-c:v",
        FINAL_VIDEO_CODEC_POLICY.windowsEncoder,
        "-tag:v",
        FINAL_VIDEO_CODEC_POLICY.codecTagString,
        "-pix_fmt",
        "yuv420p",
      ])
      .on("error", (error) => reject(error))
      .on("end", () => resolve())
      .save(outputPath);
  });

  return { status: "OK", durationAdjustment };
}

// --- PASSO 2: montar a timeline final (PURO o grafo, IMPURO o executor) ---

export type AssemblyPlan = {
  filterComplex: string;
  finalLabel: string;
  totalDurationSeconds: number;
};

/**
 * Reduce sequencial: cada fronteira entre cena[i-1] e cena[i] usa
 * scene[i-1].transitionOut como tipo autoritativo (transitionIn da
 * proxima cena e so documentacional/deve bater, nao e lido aqui - evita
 * ambiguidade quando os dois divergem). CUT = concat simples (nunca
 * consome tempo). CROSSFADE = xfade com XFADE_DURATION_SECONDS de
 * sobreposicao real - a duracao TOTAL fica menor que a soma simples das
 * cenas exatamente por causa disso (comportamento correto de um
 * crossfade de verdade, documentado no relatorio, nunca escondido).
 */
export function buildAssemblyFilterGraph(scenes: CommercialVideoSceneAsset[]): AssemblyPlan {
  if (scenes.length === 0) {
    return { filterComplex: "", finalLabel: "", totalDurationSeconds: 0 };
  }

  let accLabel = "0:v";
  let accDuration = scenes[0].durationSeconds;
  const stages: string[] = [];

  for (let i = 1; i < scenes.length; i += 1) {
    const boundaryType = scenes[i - 1].transitionOut;
    const nextInputLabel = `${i}:v`;
    const outLabel = `acc${i}`;

    if (boundaryType === "CROSSFADE") {
      const offset = Math.max(0, accDuration - XFADE_DURATION_SECONDS);
      stages.push(
        `[${accLabel}][${nextInputLabel}]xfade=transition=fade:duration=${XFADE_DURATION_SECONDS}:offset=${offset.toFixed(3)}[${outLabel}]`,
      );
      accDuration = accDuration + scenes[i].durationSeconds - XFADE_DURATION_SECONDS;
    } else {
      stages.push(`[${accLabel}][${nextInputLabel}]concat=n=2:v=1:a=0[${outLabel}]`);
      accDuration += scenes[i].durationSeconds;
    }

    accLabel = outLabel;
  }

  return { filterComplex: stages.join(";"), finalLabel: accLabel, totalDurationSeconds: accDuration };
}

// --- Orquestracao completa -------------------------------------------------

export type ComposeCommercialVideoOptions = {
  outputPath: string;
  // Se omitido, tenta resolver uma fonte real no disco (ver
  // overlay-renderer.ts) - se nenhuma for encontrada, overlays de TEXTO
  // ficam desabilitados nesta execucao (logo continua funcionando,
  // texto nao) e o resultado documenta isso em vez de falhar
  // silenciosamente ou inventar uma fonte.
  fontPath?: string;
  // Se omitido, tenta o logo oficial padrao (public/logo-radar-smart.png).
  logoPath?: string;
  // Puro passthrough - o composer nao resolve nem interpreta origem de
  // asset, so carrega o que real-scene-asset-resolver.ts ja calculou pro
  // resultado final (ver toSceneTraceability). Nunca influencia o render
  // em si (Timeline Builder ja recebeu so os paths prontos).
  sceneTraceability?: Record<string, SceneAssetTraceEntry>;
};

export async function composeCommercialVideo(
  timeline: CommercialTimeline,
  options: ComposeCommercialVideoOptions,
): Promise<CommercialRenderResult & { fontUsed: string | null; missingSceneIds: string[]; sceneTraceability: Record<string, SceneAssetTraceEntry> }> {
  const sceneTraceability = options.sceneTraceability ?? {};

  if (!isTimelineReadyToRender(timeline)) {
    const missing = listMissingSceneIds(timeline);
    return {
      status: "BLOCKED_MISSING_ASSET",
      outputPath: null,
      duration: null,
      width: null,
      height: null,
      fps: null,
      error: `Render bloqueado - cenas sem asset: ${missing.join(", ")}.`,
      durationAdjustments: {},
      fontUsed: null,
      missingSceneIds: missing,
      sceneTraceability,
    };
  }

  const encoderReadiness = assertFinalVideoEncoderReady();
  if (!encoderReadiness.ready) {
    return {
      status: "FAILED",
      outputPath: null,
      duration: null,
      width: null,
      height: null,
      fps: null,
      error:
        `Final video encoder unavailable: ${encoderReadiness.encoder}. ` +
        `${encoderReadiness.reason ?? "Sem detalhe."} Bloqueado antes de renderizar MP4 final.`,
      durationAdjustments: {},
      fontUsed: null,
      missingSceneIds: [],
      sceneTraceability,
    };
  }

  configureCommercialFfmpegPaths(ffmpeg);

  const resolvedFont = options.fontPath && fs.existsSync(options.fontPath) ? { fontPath: options.fontPath } : resolveDrawTextFont();
  const logoPath = options.logoPath ?? resolveDefaultBrandLogoPath();
  const logoExists = fs.existsSync(logoPath);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "commercial-video-"));

  const durationAdjustments: Record<string, SceneDurationAdjustment> = {};

  try {
    const preparedPaths: string[] = [];
    for (const scene of timeline.scenes) {
      const preparedPath = path.join(tempDir, `${scene.sceneId}.mp4`);
      const prepared = await prepareSceneClip(scene, timeline, resolvedFont?.fontPath ?? null, logoExists ? logoPath : null, preparedPath);

      if (prepared.status === "BLOCKED_SCENE_DURATION_MISMATCH" || prepared.status === "BLOCKED_OVERLAY_LAYOUT") {
        return {
          status: prepared.status,
          outputPath: null,
          duration: null,
          width: null,
          height: null,
          fps: null,
          error: `Cena "${scene.sceneId}": ${prepared.reason}`,
          durationAdjustments,
          fontUsed: resolvedFont?.fontPath ?? null,
          missingSceneIds: [],
          sceneTraceability,
        };
      }

      if (prepared.durationAdjustment.type !== "NONE") durationAdjustments[scene.sceneId] = prepared.durationAdjustment;
      preparedPaths.push(preparedPath);
    }

    const assembly = buildAssemblyFilterGraph(timeline.scenes);

    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg();
      for (const clipPath of preparedPaths) {
        command = command.input(clipPath);
      }
      command
        .complexFilter(assembly.filterComplex, assembly.finalLabel)
        // MP4 final publicavel: H.264/avc1 via h264_mf no Windows.
        .outputOptions([
          "-an",
          "-c:v",
          FINAL_VIDEO_CODEC_POLICY.windowsEncoder,
          "-tag:v",
          FINAL_VIDEO_CODEC_POLICY.codecTagString,
          "-pix_fmt",
          "yuv420p",
        ])
        .on("error", (error) => reject(error))
        .on("end", () => resolve())
        .save(options.outputPath);
    });

    const probed = await probeVideoFile(options.outputPath);

    return {
      status: "COMPLETED",
      outputPath: options.outputPath,
      duration: probed.duration,
      width: probed.width,
      height: probed.height,
      fps: probed.fps,
      error: null,
      durationAdjustments,
      fontUsed: resolvedFont?.fontPath ?? null,
      missingSceneIds: [],
      sceneTraceability,
    };
  } catch (error) {
    return {
      status: "FAILED",
      outputPath: null,
      duration: null,
      width: null,
      height: null,
      fps: null,
      error: error instanceof Error ? error.message : "Erro desconhecido no Commercial Video Composer.",
      durationAdjustments,
      fontUsed: resolvedFont?.fontPath ?? null,
      missingSceneIds: [],
      sceneTraceability,
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
