// Radar Creative AI - Commercial Generation Runner / EXECUTE Hybrid Scene Executor
//
// Executa uma cena HYBRID_PRODUCT_COMPOSITE de verdade: gera SO o fundo
// (nenhum produto e enviado a IA generativa), roda o Product Cutout local
// no produto real, e sobrepoe via Hybrid Product Compositor (FFmpeg
// geometrico, nunca redesenha o produto) + Product Grounding opcional.
//
// Escopo atual: o unico provider real cadastrado para fundo TEXT_TO_VIDEO
// e o wan-2-5-t2v, promovido para ACTIVE + productionEligible apos 2
// CANARYs reais. A elegibilidade da cena (ver
// commercial-generation-runner.ts) ainda bloqueia qualquer provider nao
// promovido antes deste executor ser chamado.

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { executeWanTextToVideo } from "@/lib/generation-orchestrator/adapters/wan-2-5-text-to-video";
import { materializeRemoteAsset, type MaterializeResult } from "@/lib/commercial-video/asset-materializer";
import { runProductCutout } from "@/lib/product-cutout/product-cutout";
import {
  buildHybridCompositeRequestFromPlan,
  resolveProductGrounding,
  runHybridProductComposite,
} from "@/lib/compositor/hybrid-product-compositor";
import { publishVideoToSupabase } from "@/lib/ai/publish";
import type { PublishOutput } from "@/lib/ai/contracts/publish";
import type { SceneExecutionPlan } from "@/lib/generation-orchestrator/types";
import type { SceneExecutionRecord } from "@/lib/commercial-video/runner/types";
import type { SceneExecutorOutcome } from "@/lib/commercial-video/runner/execute/scene-executor";

export type BackgroundGenerationResult = {
  status: "success" | "error";
  outputUrl: string | null;
  taskId: string | null;
  error: string | null;
};

/**
 * Dispatch por NOME de provider (nunca hardcoded pra um so) - hoje so
 * wan-2-5-t2v tem adapter real escrito neste projeto (ver
 * lib/generation-orchestrator/adapters/wan-2-5-text-to-video.ts).
 * Qualquer outro provider TEXT_TO_VIDEO que vier a ficar ACTIVE no futuro
 * precisa de um novo `case` aqui - nunca cai silenciosamente pra mock.
 */
export async function executeBackgroundVideoGeneration(
  provider: string,
  request: { prompt: string; negativePrompt: string; durationSeconds: number },
): Promise<BackgroundGenerationResult> {
  if (provider === "wan-2-5-t2v") {
    const duration = request.durationSeconds <= 5 ? "5" : "10";
    const result = await executeWanTextToVideo({
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      duration,
    });
    return { status: result.status, outputUrl: result.outputUrl, taskId: result.taskId, error: result.error };
  }

  return {
    status: "error",
    outputUrl: null,
    taskId: null,
    error: `Provider de background "${provider}" nao tem executor real cadastrado no EXECUTE V1 (so wan-2-5-t2v).`,
  };
}

export type DownloadImageResult = { ok: true; localPath: string } | { ok: false; error: string };

/**
 * Baixa a foto REAL do produto pra disco - nunca passa pelo
 * materializeRemoteAsset (esse exige Content-Type video/*). Validacao de
 * MIME image/* explicita, tamanho > 0 - mesmo padrao de rigor do
 * materializador de video.
 */
export async function downloadProductImage(url: string, destDir: string): Promise<DownloadImageResult> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status} ao baixar productReferenceUrl.` };
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return { ok: false, error: `productReferenceUrl nao e uma imagem (content-type: "${contentType}").` };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0) {
      return { ok: false, error: "Imagem do produto baixada tem 0 bytes." };
    }
    fs.mkdirSync(destDir, { recursive: true });
    const ext = contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : ".jpg";
    const localPath = path.join(destDir, `product-source${ext}`);
    await fsp.writeFile(localPath, buffer);
    return { ok: true, localPath };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro desconhecido ao baixar imagem do produto." };
  }
}

export type HybridSceneExecutorDeps = {
  cacheDir: string;
  executeBackgroundVideo?: (
    provider: string,
    request: { prompt: string; negativePrompt: string; durationSeconds: number },
  ) => Promise<BackgroundGenerationResult>;
  materializeAsset?: (url: string, cacheDir: string, inFlight: Map<string, string>) => Promise<MaterializeResult>;
  downloadImage?: (url: string, destDir: string) => Promise<DownloadImageResult>;
  runCutout?: typeof runProductCutout;
  runComposite?: typeof runHybridProductComposite;
  uploadFinalAsset?: (input: { localFilePath: string; fileName: string; metadata?: Record<string, unknown> }) => Promise<PublishOutput>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function failedOutcome(sceneId: string, fingerprint: string, provider: string, error: string): SceneExecutorOutcome {
  const record: SceneExecutionRecord = {
    sceneId,
    fingerprint,
    provider,
    generationId: null,
    status: "FAILED",
    outputUrl: null,
    durationSeconds: null,
    completedAt: nowIso(),
    error,
  };
  return { localVideoPath: null, record };
}

export async function executeHybridScene(
  scene: SceneExecutionPlan,
  fingerprint: string,
  deps: HybridSceneExecutorDeps,
): Promise<SceneExecutorOutcome> {
  const executeBackgroundVideo = deps.executeBackgroundVideo ?? executeBackgroundVideoGeneration;
  const materializeAsset = deps.materializeAsset ?? materializeRemoteAsset;
  const downloadImage = deps.downloadImage ?? downloadProductImage;
  const runCutout = deps.runCutout ?? runProductCutout;
  const runComposite = deps.runComposite ?? runHybridProductComposite;
  const uploadFinalAsset = deps.uploadFinalAsset ?? publishVideoToSupabase;

  const plan = scene.hybridCompositePlan;
  if (!plan) {
    return failedOutcome(scene.sceneId, fingerprint, scene.selectedProvider, "Cena marcada HYBRID_PRODUCT_COMPOSITE sem hybridCompositePlan - inconsistencia no plano.");
  }

  // --- 1) Fundo (SO fundo - nenhum produto/logo/texto no prompt) -------
  const background = await executeBackgroundVideo(scene.selectedProvider, {
    prompt: plan.backgroundGenerationPrompt,
    negativePrompt: plan.backgroundNegativePrompt,
    durationSeconds: scene.durationSeconds,
  });
  if (background.status !== "success" || !background.outputUrl) {
    return failedOutcome(scene.sceneId, fingerprint, scene.selectedProvider, background.error ?? "Geracao de fundo falhou sem mensagem.");
  }

  const inFlightCache = new Map<string, string>();
  const materializedBackground = await materializeAsset(background.outputUrl, deps.cacheDir, inFlightCache);
  if (!materializedBackground.ok) {
    return failedOutcome(scene.sceneId, fingerprint, scene.selectedProvider, `Falha ao materializar fundo: ${materializedBackground.error}`);
  }

  // --- 2) Produto real: SEMPRE local, NUNCA reenviado a IA -------------
  const productDownload = await downloadImage(plan.productReferenceUrl, path.join(deps.cacheDir, `hybrid-${scene.sceneId}`));
  if (!productDownload.ok) {
    return failedOutcome(scene.sceneId, fingerprint, scene.selectedProvider, `Falha ao baixar foto real do produto: ${productDownload.error}`);
  }

  const cutoutOutputPath = path.join(deps.cacheDir, `hybrid-${scene.sceneId}`, "product-cutout.png");
  const cutout = runCutout({ inputImagePath: productDownload.localPath, outputImagePath: cutoutOutputPath });
  if (cutout.status !== "COMPLETED" || !cutout.outputImagePath) {
    // Item 10: cutout falhou -> cena FAILED, NUNCA manda o produto pra IA
    // como fallback.
    return failedOutcome(scene.sceneId, fingerprint, scene.selectedProvider, `Product Cutout falhou: ${cutout.error ?? "erro desconhecido"}.`);
  }

  // --- 3) Composicao (produto real intacto sobre o fundo gerado) ------
  const compositeOutputPath = path.join(deps.cacheDir, `hybrid-${scene.sceneId}`, "composite.mp4");
  const baseRequest = buildHybridCompositeRequestFromPlan(plan, {
    backgroundVideoPath: materializedBackground.localPath,
    productImagePath: cutout.outputImagePath,
    outputPath: compositeOutputPath,
    durationSeconds: scene.durationSeconds,
    aspectRatio: scene.aspectRatio,
    productMotion: "NONE",
    backgroundRemovalMode: "PREPROCESSED_ALPHA",
  });

  // Item 11: grounding roda localmente, 0 credito - se ele proprio falhar,
  // registra e tenta de novo SEM grounding (nunca substitui por solucao
  // generativa, nunca falha a cena inteira so por causa da sombra).
  let composite = await runComposite({ ...baseRequest, productGrounding: resolveProductGrounding({ enabled: true }) });
  let groundingDegraded = false;
  if (composite.status !== "COMPLETED") {
    groundingDegraded = true;
    composite = await runComposite(baseRequest);
  }

  if (composite.status !== "COMPLETED" || !composite.outputPath) {
    return failedOutcome(
      scene.sceneId,
      fingerprint,
      scene.selectedProvider,
      `Hybrid Product Compositor falhou${groundingDegraded ? " mesmo sem grounding" : ""}: ${composite.error ?? "erro desconhecido"}.`,
    );
  }

  // --- 4) Materializar em Storage proprio (item 20) --------------------
  const uploaded = await uploadFinalAsset({
    localFilePath: composite.outputPath,
    fileName: `scene-${scene.sceneId}-${fingerprint.slice(0, 12)}.mp4`,
    metadata: { sceneId: scene.sceneId, provider: scene.selectedProvider, fingerprint, hybridComposite: true, groundingDegraded },
  });

  if (uploaded.status !== "success" || !uploaded.publicUrl) {
    return {
      localVideoPath: composite.outputPath,
      record: {
        sceneId: scene.sceneId,
        fingerprint,
        provider: scene.selectedProvider,
        generationId: background.taskId,
        status: "FAILED",
        outputUrl: null,
        durationSeconds: scene.durationSeconds,
        completedAt: nowIso(),
        error: `Composicao concluida mas falhou ao materializar em Storage proprio: ${uploaded.error ?? "erro desconhecido"}.`,
      },
    };
  }

  return {
    localVideoPath: composite.outputPath,
    record: {
      sceneId: scene.sceneId,
      fingerprint,
      provider: scene.selectedProvider,
      generationId: background.taskId,
      status: "COMPLETED",
      outputUrl: uploaded.publicUrl,
      durationSeconds: scene.durationSeconds,
      completedAt: nowIso(),
      error: null,
    },
  };
}

/**
 * mkdtempSync exposto so pra reuso em final-composer.ts (mesmo padrao ja
 * usado em commercial-video-composer.ts) - evita duplicar a logica de
 * "diretorio temporario com prefixo".
 */
export function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
