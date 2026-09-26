// Radar Creative AI - Commercial Generation Runner / EXECUTE Final Composer
//
// Unico lugar que encadeia os 4 passos JA VALIDADOS separadamente
// (Timeline Builder -> Commercial Video Composer -> Audio Pipeline ->
// Final Mux) numa producao real de MP4 - essa orquestracao em si e NOVA
// (nenhum modulo abaixo foi reescrito). Musica/SFX ficam de fora nesta V1
// (musicTrack=null, sfxEvents=[]) - o contrato (buildCommercialAudioTimeline)
// ja aceita os dois, mas nao ha nenhuma trilha oficial de fundo definida
// pelo projeto ainda; documentado aqui em vez de inventar um arquivo
// hardcoded.

import fs from "node:fs";
import path from "node:path";

import { buildCommercialTimeline, isTimelineReadyToRender, listMissingSceneIds } from "@/lib/commercial-video/timeline-builder";
import { composeCommercialVideo } from "@/lib/commercial-video/commercial-video-composer";
import { buildCommercialAudioTimeline } from "@/lib/commercial-video/audio/audio-timeline-builder";
import { mixCommercialAudio, measurePeakLevelDb } from "@/lib/commercial-video/audio/audio-mixer";
import { muxFinalCommercial, type FinalMuxResult } from "@/lib/commercial-video/audio/final-mux";
import { publishVideoToSupabase } from "@/lib/ai/publish";
import type { PublishOutput } from "@/lib/ai/contracts/publish";
import type { CampaignPromptPlan } from "@/lib/prompt-builder/types";
import type { NarrationSegment } from "@/lib/commercial-video/audio/types";
import type { CommercialRenderResult } from "@/lib/commercial-video/types";
import type { NarrationExecutionRecord, SceneRunnerPlan } from "@/lib/commercial-video/runner/types";

// Tolerancia entre a duracao "nominal" da timeline (soma das cenas, sem
// considerar overlap de CROSSFADE) e a duracao REAL medida no MP4 final -
// um CROSSFADE de 0.5s por transicao ja produz uma diferenca esperada
// pequena (ver XFADE_DURATION_SECONDS em commercial-video-composer.ts).
// Qualquer coisa muito maior que isso indica um problema real de
// montagem, nunca so o crossfade.
const DURATION_TOLERANCE_SECONDS = 2;
// Pico >= -0.1dBFS e a mesma definicao de clipping ja usada e documentada
// no Audio Pipeline V1 (ver audio-mixer.ts).
const CLIPPING_PEAK_THRESHOLD_DB = -0.1;

export type FinalQualityGateStatus = "PASS" | "FAIL_TECHNICAL" | "BLOCKED_REVIEW_REQUIRED";

export type FinalQualityGateResult = {
  status: FinalQualityGateStatus;
  reasons: string[];
};

export function assessFinalQualityGate(input: {
  narrationExecutionRecords: NarrationExecutionRecord[];
  timelineTotalDurationSeconds: number;
  renderResult: CommercialRenderResult;
  muxResult: FinalMuxResult;
  peakLevelDb: number | null;
  finalVideoPath: string | null;
}): FinalQualityGateResult {
  const reasons: string[] = [];

  const tooLong = input.narrationExecutionRecords.filter((r) => r.status === "TOO_LONG");
  if (tooLong.length > 0) {
    for (const record of tooLong) {
      reasons.push(`Narracao da cena ${record.sceneId} nao coube na janela disponivel (NARRATION_TOO_LONG) - revisao humana necessaria.`);
    }
    return { status: "BLOCKED_REVIEW_REQUIRED", reasons };
  }

  if (input.renderResult.status !== "COMPLETED") {
    reasons.push(`Composicao visual nao concluida: ${input.renderResult.error ?? input.renderResult.status}.`);
  }
  if (input.muxResult.status !== "COMPLETED") {
    reasons.push(`Mux final nao concluido: ${input.muxResult.error ?? "erro desconhecido"}.`);
  }
  if (!input.muxResult.audioStreamCount || input.muxResult.audioStreamCount < 1) {
    reasons.push("MP4 final nao tem nenhuma trilha de audio.");
  }
  if (input.muxResult.duration !== null && Math.abs(input.muxResult.duration - input.timelineTotalDurationSeconds) > DURATION_TOLERANCE_SECONDS) {
    reasons.push(
      `Duracao final (${input.muxResult.duration.toFixed(2)}s) diverge da timeline planejada (${input.timelineTotalDurationSeconds.toFixed(2)}s) alem da tolerancia.`,
    );
  }
  if (input.peakLevelDb !== null && input.peakLevelDb >= CLIPPING_PEAK_THRESHOLD_DB) {
    reasons.push(`Clipping detectado no audio final (pico ${input.peakLevelDb.toFixed(2)}dBFS).`);
  }
  if (!input.finalVideoPath || !fs.existsSync(input.finalVideoPath)) {
    reasons.push("Arquivo MP4 final nao existe em disco.");
  }

  return { status: reasons.length > 0 ? "FAIL_TECHNICAL" : "PASS", reasons };
}

export type FinalCompositionStatus = "COMPLETED" | "BLOCKED_REVIEW_REQUIRED" | "FAILED";

export type FinalCompositionResult = {
  status: FinalCompositionStatus;
  finalVideoPath: string | null;
  finalVideoUrl: string | null;
  reasons: string[];
};

export type FinalCompositionDeps = {
  outputDir: string;
  uploadFinalAsset?: (input: { localFilePath: string; fileName: string; metadata?: Record<string, unknown> }) => Promise<PublishOutput>;
};

export async function composeAndFinalizeCommercial(
  campaignId: string,
  promptPlan: CampaignPromptPlan,
  aspectRatio: string,
  scenes: SceneRunnerPlan[],
  narrationSegments: NarrationSegment[],
  narrationExecutionRecords: NarrationExecutionRecord[],
  deps: FinalCompositionDeps,
): Promise<FinalCompositionResult> {
  const uploadFinalAsset = deps.uploadFinalAsset ?? publishVideoToSupabase;
  fs.mkdirSync(deps.outputDir, { recursive: true });

  const sceneVideoPaths: Record<string, string | null> = {};
  const sceneProviders: Record<string, string | null> = {};
  for (const scene of scenes) {
    sceneVideoPaths[scene.sceneId] = scene.existingAsset?.status === "READY" ? scene.existingAsset.inputVideoPath : null;
    sceneProviders[scene.sceneId] = scene.selectedProvider ?? null;
  }

  const timeline = buildCommercialTimeline(promptPlan, { campaignId, aspectRatio, sceneVideoPaths, sceneProviders });

  if (!isTimelineReadyToRender(timeline)) {
    return {
      status: "FAILED",
      finalVideoPath: null,
      finalVideoUrl: null,
      reasons: [`Cenas sem asset pronto para composicao final: ${listMissingSceneIds(timeline).join(", ")}.`],
    };
  }

  const visualOutputPath = path.join(deps.outputDir, `${campaignId}-visual.mp4`);
  const renderResult = await composeCommercialVideo(timeline, { outputPath: visualOutputPath });
  if (renderResult.status !== "COMPLETED") {
    return { status: "FAILED", finalVideoPath: null, finalVideoUrl: null, reasons: [renderResult.error ?? "Composicao visual falhou."] };
  }

  // Musica/SFX fora do escopo desta V1 (ver docstring do arquivo) - so
  // narracao entra no mix.
  const audioTimeline = buildCommercialAudioTimeline(timeline.totalDurationSeconds, narrationSegments, null, []);
  const mixedAudioPath = path.join(deps.outputDir, `${campaignId}-audio.wav`);
  const mixResult = await mixCommercialAudio(audioTimeline, mixedAudioPath);
  if (mixResult.status !== "COMPLETED" || !mixResult.outputPath) {
    return { status: "FAILED", finalVideoPath: null, finalVideoUrl: null, reasons: [mixResult.error ?? "Mixagem de audio falhou."] };
  }

  const finalOutputPath = path.join(deps.outputDir, `${campaignId}-final.mp4`);
  const muxResult = await muxFinalCommercial({
    visualVideoPath: visualOutputPath,
    mixedAudioPath: mixResult.outputPath,
    outputPath: finalOutputPath,
  });

  const peakLevelDb = mixResult.outputPath ? measurePeakLevelDb(mixResult.outputPath) : null;

  const gate = assessFinalQualityGate({
    narrationExecutionRecords,
    timelineTotalDurationSeconds: timeline.totalDurationSeconds,
    renderResult,
    muxResult,
    peakLevelDb,
    finalVideoPath: muxResult.outputPath,
  });

  if (gate.status !== "PASS") {
    return {
      status: gate.status === "BLOCKED_REVIEW_REQUIRED" ? "BLOCKED_REVIEW_REQUIRED" : "FAILED",
      finalVideoPath: muxResult.outputPath,
      finalVideoUrl: null,
      reasons: gate.reasons,
    };
  }

  const uploaded = await uploadFinalAsset({
    localFilePath: muxResult.outputPath as string,
    fileName: `${campaignId}-comercial.mp4`,
    metadata: { campaignId },
  });

  if (uploaded.status !== "success" || !uploaded.publicUrl) {
    return {
      status: "FAILED",
      finalVideoPath: muxResult.outputPath,
      finalVideoUrl: null,
      reasons: [`Comercial final produzido mas falhou ao publicar em Storage: ${uploaded.error ?? "erro desconhecido"}.`],
    };
  }

  return { status: "COMPLETED", finalVideoPath: muxResult.outputPath, finalVideoUrl: uploaded.publicUrl, reasons: [] };
}
