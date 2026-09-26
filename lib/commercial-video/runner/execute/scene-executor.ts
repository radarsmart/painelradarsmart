// Radar Creative AI - Commercial Generation Runner / EXECUTE Scene Executor
//
// Executa UMA cena "padrao" (nao-HYBRID) de verdade - no maximo UMA
// chamada paga, nunca retry. So chamado pelo Runner quando: elegibilidade
// ja disse ELIGIBLE, nao existe asset reutilizavel (fingerprint bateu com
// nada), e selectedProvider != "mock" (cenas mock nunca geram nada aqui -
// ver item 4 do enunciado, MOCK so serve pra cenas explicitamente mock/
// dev, nunca substituto silencioso de provider real). Hoje o UNICO
// provider real ACTIVE que chega aqui e freepik-kling-i2v (ver
// provider-capabilities.ts) - o dispatch e por nome de provider pra ficar
// pronto pra outro provider ACTIVE futuro sem reescrever este arquivo.

import {
  executeFreepikKlingImageToVideo,
  type FreepikKlingAdapterResult,
} from "@/lib/generation-orchestrator/adapters/freepik-kling-image-to-video";
import {
  executeHeyGenImageToVideo,
  type HeyGenAdapterResult,
} from "@/lib/generation-orchestrator/adapters/heygen-image-to-video";
import {
  executeWanTextToVideo,
  type WanTextToVideoAdapterResult,
} from "@/lib/generation-orchestrator/adapters/wan-2-5-text-to-video";
import { materializeRemoteAsset, type MaterializeResult } from "@/lib/commercial-video/asset-materializer";
import { publishVideoToSupabase } from "@/lib/ai/publish";
import type { PublishOutput } from "@/lib/ai/contracts/publish";
import type { SceneExecutionPlan } from "@/lib/generation-orchestrator/types";
import type { SceneExecutionRecord } from "@/lib/commercial-video/runner/types";

// Kling so aceita "5" ou "10" (ver freepik-kling-image-to-video.ts) - as
// cenas do comercial sao normalmente mais curtas que isso; o resultado e
// sempre CORTADO pra scene.durationSeconds depois, no Commercial Video
// Composer (ja existente, `-t <duration>` na preparacao de cada cena) -
// nunca precisamos que o Kling produza a duracao exata.
const KLING_DEFAULT_CFG_SCALE = 0.5;

function resolveKlingDuration(durationSeconds: number): "5" | "10" {
  return durationSeconds <= 5 ? "5" : "10";
}

export type SceneExecutorDeps = {
  cacheDir: string;
  executeFreepikKling?: (request: Parameters<typeof executeFreepikKlingImageToVideo>[0]) => Promise<FreepikKlingAdapterResult>;
  executeHeyGen?: (request: Parameters<typeof executeHeyGenImageToVideo>[0]) => Promise<HeyGenAdapterResult>;
  executeWan?: (request: Parameters<typeof executeWanTextToVideo>[0]) => Promise<WanTextToVideoAdapterResult>;
  materializeAsset?: (url: string, cacheDir: string, inFlight: Map<string, string>) => Promise<MaterializeResult>;
  uploadFinalAsset?: (input: { localFilePath: string; fileName: string; metadata?: Record<string, unknown> }) => Promise<PublishOutput>;
  characterAudioUrlsBySceneId?: Record<string, string>;
};

export type SceneExecutorOutcome = {
  record: SceneExecutionRecord;
  // Caminho LOCAL pronto pra composicao NESTE mesmo job (evita re-baixar
  // o arquivo que acabamos de subir pro nosso Storage) - null quando
  // FAILED.
  localVideoPath: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Executa a UNICA tentativa paga desta cena. Nunca chama outro provider
 * em caso de falha (ver MAX_PAID_ATTEMPTS_PER_SCENE=1, item 8).
 */
export async function executeStandardScene(
  scene: SceneExecutionPlan,
  fingerprint: string,
  deps: SceneExecutorDeps,
): Promise<SceneExecutorOutcome> {
  const executeFreepikKling = deps.executeFreepikKling ?? executeFreepikKlingImageToVideo;
  const executeHeyGen = deps.executeHeyGen ?? executeHeyGenImageToVideo;
  const executeWan = deps.executeWan ?? executeWanTextToVideo;
  const materializeAsset = deps.materializeAsset ?? materializeRemoteAsset;
  const uploadFinalAsset = deps.uploadFinalAsset ?? publishVideoToSupabase;

  if (scene.selectedProvider === "wan-2-5-t2v") {
    const wanResult = await executeWan({
      prompt: scene.providerRequest.prompt,
      negativePrompt: scene.providerRequest.negativePrompt,
      duration: scene.durationSeconds <= 5 ? "5" : "10",
    });

    if (wanResult.status !== "success" || !wanResult.outputUrl) {
      return {
        localVideoPath: null,
        record: {
          sceneId: scene.sceneId,
          fingerprint,
          provider: scene.selectedProvider,
          generationId: wanResult.taskId,
          status: "FAILED",
          outputUrl: null,
          durationSeconds: null,
          completedAt: nowIso(),
          error: wanResult.error ?? "WAN retornou falha sem mensagem.",
        },
      };
    }

    const inFlightCache = new Map<string, string>();
    const materialized = await materializeAsset(wanResult.outputUrl, deps.cacheDir, inFlightCache);
    if (!materialized.ok) {
      return {
        localVideoPath: null,
        record: {
          sceneId: scene.sceneId,
          fingerprint,
          provider: scene.selectedProvider,
          generationId: wanResult.taskId,
          status: "FAILED",
          outputUrl: null,
          durationSeconds: null,
          completedAt: nowIso(),
          error: `Geracao WAN concluida mas falhou ao materializar localmente: ${materialized.error}`,
        },
      };
    }

    const uploaded = await uploadFinalAsset({
      localFilePath: materialized.localPath,
      fileName: `scene-${scene.sceneId}-${fingerprint.slice(0, 12)}.mp4`,
      metadata: { sceneId: scene.sceneId, provider: scene.selectedProvider, fingerprint },
    });

    if (uploaded.status !== "success" || !uploaded.publicUrl) {
      return {
        localVideoPath: materialized.localPath,
        record: {
          sceneId: scene.sceneId,
          fingerprint,
          provider: scene.selectedProvider,
          generationId: wanResult.taskId,
          status: "FAILED",
          outputUrl: null,
          durationSeconds: scene.durationSeconds,
          completedAt: nowIso(),
          error: `Geracao WAN concluida mas falhou ao materializar em Storage proprio: ${uploaded.error ?? "erro desconhecido"}.`,
        },
      };
    }

    return {
      localVideoPath: materialized.localPath,
      record: {
        sceneId: scene.sceneId,
        fingerprint,
        provider: scene.selectedProvider,
        generationId: wanResult.taskId,
        status: "COMPLETED",
        outputUrl: uploaded.publicUrl,
        durationSeconds: scene.durationSeconds,
        completedAt: nowIso(),
        error: null,
      },
    };
  }

  if (scene.selectedProvider === "heygen-image-avatar") {
    if (!scene.identityReferenceUrl) {
      return {
        localVideoPath: null,
        record: {
          sceneId: scene.sceneId,
          fingerprint,
          provider: scene.selectedProvider,
          generationId: null,
          status: "FAILED",
          outputUrl: null,
          durationSeconds: null,
          completedAt: nowIso(),
          error: "Cena sem identityReferenceUrl - heygen-image-avatar exige imagem publica da personagem.",
        },
      };
    }

    const audioUrl = deps.characterAudioUrlsBySceneId?.[scene.sceneId] ?? null;
    if (!audioUrl) {
      return {
        localVideoPath: null,
        record: {
          sceneId: scene.sceneId,
          fingerprint,
          provider: scene.selectedProvider,
          generationId: null,
          status: "FAILED",
          outputUrl: null,
          durationSeconds: null,
          completedAt: nowIso(),
          error: "Cena sem audio_url publico - heygen-image-avatar exige narracao sintetizada e publicada antes do submit.",
        },
      };
    }

    const heygenResult = await executeHeyGen({
      imageUrl: scene.identityReferenceUrl,
      audioUrl,
      resolution: "1080p",
      aspectRatio: "9:16",
    });

    if (heygenResult.status !== "success" || !heygenResult.outputUrl) {
      return {
        localVideoPath: null,
        record: {
          sceneId: scene.sceneId,
          fingerprint,
          provider: scene.selectedProvider,
          generationId: heygenResult.videoId,
          status: "FAILED",
          outputUrl: null,
          durationSeconds: null,
          completedAt: nowIso(),
          error: heygenResult.error ?? "HeyGen retornou falha sem mensagem.",
        },
      };
    }

    const inFlightCache = new Map<string, string>();
    const materialized = await materializeAsset(heygenResult.outputUrl, deps.cacheDir, inFlightCache);
    if (!materialized.ok) {
      return {
        localVideoPath: null,
        record: {
          sceneId: scene.sceneId,
          fingerprint,
          provider: scene.selectedProvider,
          generationId: heygenResult.videoId,
          status: "FAILED",
          outputUrl: null,
          durationSeconds: null,
          completedAt: nowIso(),
          error: `Geracao HeyGen concluida mas falhou ao materializar localmente: ${materialized.error}`,
        },
      };
    }

    const uploaded = await uploadFinalAsset({
      localFilePath: materialized.localPath,
      fileName: `scene-${scene.sceneId}-${fingerprint.slice(0, 12)}.mp4`,
      metadata: { sceneId: scene.sceneId, provider: scene.selectedProvider, fingerprint, heygenAudioUrl: audioUrl },
    });

    if (uploaded.status !== "success" || !uploaded.publicUrl) {
      return {
        localVideoPath: materialized.localPath,
        record: {
          sceneId: scene.sceneId,
          fingerprint,
          provider: scene.selectedProvider,
          generationId: heygenResult.videoId,
          status: "FAILED",
          outputUrl: null,
          durationSeconds: scene.durationSeconds,
          completedAt: nowIso(),
          error: `Geracao HeyGen concluida mas falhou ao materializar em Storage proprio: ${uploaded.error ?? "erro desconhecido"}.`,
        },
      };
    }

    return {
      localVideoPath: materialized.localPath,
      record: {
        sceneId: scene.sceneId,
        fingerprint,
        provider: scene.selectedProvider,
        generationId: heygenResult.videoId,
        status: "COMPLETED",
        outputUrl: uploaded.publicUrl,
        durationSeconds: scene.durationSeconds,
        completedAt: nowIso(),
        error: null,
      },
    };
  }

  if (scene.selectedProvider !== "freepik-kling-i2v") {
    return {
      localVideoPath: null,
      record: {
        sceneId: scene.sceneId,
        fingerprint,
        provider: scene.selectedProvider,
        generationId: null,
        status: "FAILED",
        outputUrl: null,
        durationSeconds: null,
        completedAt: nowIso(),
        error: `Provider "${scene.selectedProvider}" nao tem um executor real cadastrado no EXECUTE V1 (so wan-2-5-t2v, freepik-kling-i2v e heygen-image-avatar estao implementados).`,
      },
    };
  }

  if (!scene.productReferenceUrl) {
    return {
      localVideoPath: null,
      record: {
        sceneId: scene.sceneId,
        fingerprint,
        provider: scene.selectedProvider,
        generationId: null,
        status: "FAILED",
        outputUrl: null,
        durationSeconds: null,
        completedAt: nowIso(),
        error: "Cena sem productReferenceUrl - freepik-kling-i2v (image-to-video) exige uma imagem de entrada.",
      },
    };
  }

  const klingResult = await executeFreepikKling({
    inputImageUrl: scene.productReferenceUrl,
    prompt: scene.positivePrompt,
    negativePrompt: scene.negativePrompt,
    duration: resolveKlingDuration(scene.durationSeconds),
    cfgScale: KLING_DEFAULT_CFG_SCALE,
  });

  if (klingResult.status !== "success" || !klingResult.outputUrl) {
    return {
      localVideoPath: null,
      record: {
        sceneId: scene.sceneId,
        fingerprint,
        provider: scene.selectedProvider,
        generationId: klingResult.taskId,
        status: "FAILED",
        outputUrl: null,
        durationSeconds: null,
        completedAt: nowIso(),
        error: klingResult.error ?? "Freepik Kling retornou falha sem mensagem.",
      },
    };
  }

  // Item 20: nunca depender da URL efemera do provider - materializa
  // (download local) e sobe pro NOSSO Storage antes de considerar a cena
  // "pronta" pra reuso futuro.
  const inFlightCache = new Map<string, string>();
  const materialized = await materializeAsset(klingResult.outputUrl, deps.cacheDir, inFlightCache);
  if (!materialized.ok) {
    return {
      localVideoPath: null,
      record: {
        sceneId: scene.sceneId,
        fingerprint,
        provider: scene.selectedProvider,
        generationId: klingResult.taskId,
        status: "FAILED",
        outputUrl: null,
        durationSeconds: null,
        completedAt: nowIso(),
        error: `Geracao concluida no provider mas falhou ao materializar localmente: ${materialized.error}`,
      },
    };
  }

  const uploaded = await uploadFinalAsset({
    localFilePath: materialized.localPath,
    fileName: `scene-${scene.sceneId}-${fingerprint.slice(0, 12)}.mp4`,
    metadata: { sceneId: scene.sceneId, provider: scene.selectedProvider, fingerprint },
  });

  if (uploaded.status !== "success" || !uploaded.publicUrl) {
    return {
      localVideoPath: materialized.localPath,
      record: {
        sceneId: scene.sceneId,
        fingerprint,
        provider: scene.selectedProvider,
        generationId: klingResult.taskId,
        status: "FAILED",
        outputUrl: null,
        durationSeconds: scene.durationSeconds,
        completedAt: nowIso(),
        error: `Geracao concluida mas falhou ao materializar em Storage proprio: ${uploaded.error ?? "erro desconhecido"}.`,
      },
    };
  }

  return {
    localVideoPath: materialized.localPath,
    record: {
      sceneId: scene.sceneId,
      fingerprint,
      provider: scene.selectedProvider,
      generationId: klingResult.taskId,
      status: "COMPLETED",
      outputUrl: uploaded.publicUrl,
      durationSeconds: scene.durationSeconds,
      completedAt: nowIso(),
      error: null,
    },
  };
}
