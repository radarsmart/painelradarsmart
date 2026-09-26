// Radar Creative AI - Commercial Generation Runner V1/V2
//
// Unico orquestrador desta camada. Coordena modulos JA validados
// (Generation Orchestrator, Real Scene Asset Integration, Narration
// Script Builder, Audio Pipeline, Hybrid Product Compositor, Product
// Cutout) - nunca reimplementa a logica deles.
//
// mode="DRY_RUN": planejamento puro, ZERO chamadas pagas (comportamento
// inalterado desde a V1).
// mode="EXECUTE" (EXECUTE Controlado V1): pode chamar providers reais
// ACTIVE dentro dos limites configurados - ver lib/commercial-video/runner/execute/*
// pra cada guardrail/executor. Todo o caminho ate GENERATING_NARRATION e
// COMPARTILHADO com DRY_RUN (avaliar elegibilidade/asset/narrationPlan e
// sempre gratis) - EXECUTE so diverge quando geracao/sintese REAL de
// verdade entraria em jogo.

import { getProviderProfile } from "@/lib/generation-orchestrator/provider-capabilities";
import { validateSceneForGeneration } from "@/lib/generation-orchestrator/guardrails";
import type { CampaignExecutionPlan, SceneExecutionPlan } from "@/lib/generation-orchestrator/types";
import { resolveRealSceneAssets } from "@/lib/commercial-video/real-scene-asset-resolver";
import type { SceneAssetCandidate } from "@/lib/commercial-video/scene-asset-types";
import { buildNarrationPlan } from "@/lib/commercial-video/narration/narration-script-builder";
import { assessNarrationQuality } from "@/lib/commercial-video/narration/narration-quality-gate";
import type { NarrationOfferData, NarrationProductData } from "@/lib/commercial-video/narration/types";
import type { NarrationProvider } from "@/lib/commercial-video/audio/narration-track";
import { GAROTA_RADAR_VOICE_PROFILE, createGarotaRadarNarrationProvider } from "@/lib/commercial-video/audio/garota-radar-voice-profile";
import { buildTransition } from "@/lib/commercial-video/runner/runner-state-machine";
import { checkCreditsGuard, checkUsdCentsGuard } from "@/lib/commercial-video/runner/runner-cost-guard";
import { aggregateRunnerQuality } from "@/lib/commercial-video/runner/runner-quality-gate";
import { buildRunnerTraceability } from "@/lib/commercial-video/runner/runner-traceability";
import { checkExecutionGuards } from "@/lib/commercial-video/runner/execute/execute-guards";
import { computeNarrationFingerprint, computeSceneFingerprint, filterCandidatesByFingerprint } from "@/lib/commercial-video/runner/execute/scene-fingerprint";
import { executeStandardScene, type SceneExecutorDeps } from "@/lib/commercial-video/runner/execute/scene-executor";
import { executeHybridScene, type HybridSceneExecutorDeps } from "@/lib/commercial-video/runner/execute/hybrid-scene-executor";
import { executeNarrationPlan } from "@/lib/commercial-video/runner/execute/narration-executor";
import { composeAndFinalizeCommercial, type FinalCompositionDeps } from "@/lib/commercial-video/runner/execute/final-composer";
import { evaluateCampaignExecutionReadiness, READY_EXECUTION_READINESS } from "@/lib/commercial-video/runner/execute/execution-readiness";
import type { CreativeQualityStatus } from "@/lib/creative-director-v2/types";
import type { PersuasionCheckStatus } from "@/lib/commercial-video/persuasion/types";
import { publishVideoToSupabase } from "@/lib/ai/publish";
import type {
  CommercialGenerationResult,
  CostPreview,
  ExecutionGuardResult,
  NarrationExecutionRecord,
  RunnerJobStatus,
  RunnerMode,
  RunnerStateTransition,
  SceneEligibility,
  SceneExecutionRecord,
  SceneRunnerPlan,
} from "@/lib/commercial-video/runner/types";

// Seams de injecao EXCLUSIVOS de teste - em producao, todos ficam
// undefined e cada executor usa seu adapter real default (ver
// scene-executor.ts/hybrid-scene-executor.ts/narration-executor.ts).
// Nunca usado para "desligar" um guardrail - so pra substituir a
// chamada de rede por um fake nos testes (item 29 do enunciado).
export type ExecuteOverrides = {
  sceneExecutorDeps?: Partial<Omit<SceneExecutorDeps, "cacheDir">>;
  hybridSceneExecutorDeps?: Partial<Omit<HybridSceneExecutorDeps, "cacheDir">>;
  narrationProviderFactory?: (outputDir: string) => NarrationProvider;
  finalCompositionDeps?: Partial<Omit<FinalCompositionDeps, "outputDir">>;
};

export type RunCommercialGenerationInput = {
  executionPlan: CampaignExecutionPlan;
  mode: RunnerMode;
  maxVideoCredits: number | null;
  maxTtsCredits: number | null;
  maxUsdCostCents?: number | null;
  acknowledgeUnknownVideoCost?: boolean;
  // Candidatos de asset JA EXISTENTES (de canaries/geracoes anteriores) -
  // nunca gerados pelo Runner em DRY_RUN. Em EXECUTE, tambem servem de
  // idempotencia (ver fingerprint) - fornecer o mesmo candidato entre
  // execucoes evita pagar de novo.
  existingSceneAssetCandidates?: SceneAssetCandidate[];
  narrationOffer: NarrationOfferData;
  narrationProduct: NarrationProductData | null;
  productIntelligenceCategory: string;
  assetCacheDir: string;
  // Extensao MINIMA pra observabilidade externa (ver Job Persistence) -
  // chamado depois de CADA transicao de estado interna, nunca substitui a
  // state machine (essa continua sendo runner-state-machine.ts, a UNICA
  // fonte de verdade sobre quais transicoes sao validas). Erro aqui dentro
  // se propaga (o chamador decide o que fazer, o Runner nao engole).
  onStateChange?: (transition: RunnerStateTransition) => void | Promise<void>;

  // --- EXECUTE Controlado V1 (ignorados em DRY_RUN) -------------------
  // Confirmacao explicita obrigatoria (item 2) - default false, NUNCA
  // true por omissao.
  confirmed?: boolean;
  // Registros de execucao real de um job ANTERIOR da mesma campanha+modo
  // (ver resume, item 24/28) - usados so pra decidir reuso via
  // fingerprint, nunca aplicados cegamente.
  existingSceneExecutionRecords?: SceneExecutionRecord[];
  existingNarrationExecutionRecords?: NarrationExecutionRecord[];
  narrationOutputDir?: string;
  finalOutputDir?: string;
  executeOverrides?: ExecuteOverrides;
  // Creative Director V2 (opcional) - creative_brief.commercialDirectionV2.
  // storyboardQualityGate.status da campanha, quando creativeDirectorVersion
  // === "V2". Campanhas V1 nunca preenchem isso (undefined = comportamento
  // identico ao anterior). Ver execution-readiness.ts#BLOCKED_CREATIVE_QUALITY.
  creativeQualityGateStatus?: CreativeQualityStatus | null;
  commercialPersuasionGateStatus?: PersuasionCheckStatus | null;
};

function buildSceneRunnerPlan(
  scenePlan: SceneExecutionPlan,
  purpose: SceneRunnerPlan["purpose"],
): SceneRunnerPlan {
  const providerProfile = getProviderProfile(scenePlan.selectedProvider);
  const providerStatus = providerProfile?.status ?? null;
  const requiresHybridPipeline = scenePlan.productGenerationStrategy === "HYBRID_PRODUCT_COMPOSITE";

  let eligibility: SceneEligibility;
  let eligibilityReason: string | null;

  if (scenePlan.productGenerationStrategy === "BLOCKED_REFERENCE_QUALITY") {
    eligibility = "BLOCKED_REFERENCE_QUALITY";
    eligibilityReason = scenePlan.statusReason ?? "Estrategia bloqueada por qualidade de referencia insuficiente (ver Product Reference Quality Gate).";
  } else if (scenePlan.status === "SKIPPED") {
    eligibility = "SKIPPED";
    eligibilityReason = scenePlan.statusReason;
  } else if (scenePlan.status === "FAILED" && scenePlan.capabilityFidelityBlocked) {
    // Subject-Aware Capability Routing V1 (ver capability-fidelity-gate.ts) -
    // motivo PROPRIO, distinto de BLOCKED_PROVIDER_STATUS generico: a cena
    // exige fidelidade real de produto mas a capability selecionada nao
    // aceita nenhuma referencia (nunca um problema de status de provider).
    eligibility = "BLOCKED_CAPABILITY_FIDELITY";
    eligibilityReason = scenePlan.statusReason ?? "Capability selecionada nao aceita referencia real de produto exigida pela cena.";
  } else if (scenePlan.status === "FAILED") {
    eligibility = "BLOCKED_PROVIDER_STATUS";
    eligibilityReason = scenePlan.statusReason ?? "Cena marcada FAILED pelo Generation Orchestrator.";
  } else if (scenePlan.selectedProvider !== "mock" && providerStatus !== "ACTIVE") {
    // Cross-check FRESCO contra o registro atual de providers - o plano
    // persistido pode estar desatualizado se o registro mudou depois.
    eligibility = "BLOCKED_PROVIDER_STATUS";
    eligibilityReason =
      `Provider "${scenePlan.selectedProvider}" tem status "${providerStatus ?? "DESCONHECIDO"}" no registro atual ` +
      `(so ACTIVE e selecionavel automaticamente para EXECUTE) - o plano persistido pode estar desatualizado.`;
  } else {
    const validation = validateSceneForGeneration(scenePlan);
    if (!validation.ok) {
      eligibility = "BLOCKED_VALIDATION";
      eligibilityReason = validation.reason;
    } else {
      eligibility = "ELIGIBLE";
      eligibilityReason = null;
    }
  }

  return {
    sceneId: scenePlan.sceneId,
    sceneOrder: scenePlan.sceneOrder,
    purpose,
    providerCapability: scenePlan.providerCapability,
    selectedProvider: scenePlan.selectedProvider,
    providerStatus,
    productGenerationStrategy: scenePlan.productGenerationStrategy,
    requiresHybridPipeline,
    eligibility,
    eligibilityReason,
    estimatedCost: scenePlan.estimatedCost,
    persistedStatus: scenePlan.status,
    persistedStatusReason: scenePlan.statusReason,
    existingAsset: null,
  };
}

const EMPTY_EXECUTION_GUARD_OK: ExecutionGuardResult = { status: "OK", reason: null };

export async function runCommercialGeneration(input: RunCommercialGenerationInput): Promise<CommercialGenerationResult> {
  const startedAt = new Date().toISOString();
  const transitions: CommercialGenerationResult["transitions"] = [];
  const errors: string[] = [];
  let status: RunnerJobStatus = "CREATED";

  async function transitionTo(to: RunnerJobStatus, note: string | null = null): Promise<void> {
    const transition = buildTransition(status, to, note);
    transitions.push(transition);
    status = to;
    await input.onStateChange?.(transition);
  }

  function emptyResultShell(): Omit<CommercialGenerationResult, "status" | "completedAt" | "durationMs"> {
    return {
      campaignId: input.executionPlan.campaignId,
      mode: input.mode,
      startedAt,
      transitions,
      scenes: [],
      narrationPlan: null,
      narrationQualityResult: null,
      costPreview: { videoCreditsKnown: 0, videoCurrencyCostCentsKnown: null, videoUsdCostCentsKnown: null, ttsCredits: 0, ttsCurrencyCostCents: null, unknownCurrencyComponents: [] },
      videoCostGuard: { status: "BLOCKED_UNKNOWN_COST", reason: null },
      usdCostGuard: { status: "BLOCKED_UNKNOWN_COST", reason: null },
      ttsCostGuard: { status: "BLOCKED_UNKNOWN_COST", reason: null },
      quality: { sceneEligibility: "FAIL", assetResolution: "FAIL", narrationQuality: "FAIL", audioQuality: "NOT_EVALUATED", finalVideoQuality: "NOT_EVALUATED", finalStatus: "FAIL" },
      traceability: [],
      finalVideoPath: null,
      finalVideoUrl: null,
      executionGuard: EMPTY_EXECUTION_GUARD_OK,
      executionReadiness: READY_EXECUTION_READINESS,
      sceneExecutionRecords: [],
      narrationExecutionRecords: [],
      errors,
    };
  }

  async function buildFailureResult(message: string): Promise<CommercialGenerationResult> {
    errors.push(message);
    await transitionTo("FAILED", message);
    const completedAt = new Date().toISOString();
    return {
      ...emptyResultShell(),
      status,
      completedAt,
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    };
  }

  async function buildBlockedResult(message: string, executionGuard: ExecutionGuardResult): Promise<CommercialGenerationResult> {
    errors.push(message);
    await transitionTo("BLOCKED", message);
    const completedAt = new Date().toISOString();
    return {
      ...emptyResultShell(),
      status,
      completedAt,
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      executionGuard,
    };
  }

  try {
    await transitionTo("PREPARING", `Modo: ${input.mode}. Campanha: ${input.executionPlan.campaignId}.`);

    // --- EXECUTE Controlado V1: guard de autorizacao ANTES de qualquer
    // avaliacao (item 2/3 - falha rapido, nenhuma chamada, paga ou nao). ---
    const executionGuard = checkExecutionGuards({
      mode: input.mode,
      confirmed: input.confirmed,
      maxVideoCredits: input.maxVideoCredits,
      maxTtsCredits: input.maxTtsCredits,
    });
    if (executionGuard.status !== "OK") {
      return await buildBlockedResult(executionGuard.reason ?? executionGuard.status, executionGuard);
    }

    // --- GENERATING_SCENES: avalia elegibilidade, NUNCA gera nada ---
    await transitionTo("GENERATING_SCENES", "Avaliando elegibilidade de provider por cena (nenhuma chamada real a provider).");
    const scenes: SceneRunnerPlan[] = input.executionPlan.scenes.map((scenePlan) => {
      const promptScene = input.executionPlan.promptPlan.scenes.find((s) => s.sceneId === scenePlan.sceneId);
      return buildSceneRunnerPlan(scenePlan, promptScene?.purpose ?? "PRODUCT");
    });

    const fingerprintBySceneId: Record<string, string> = {};
    for (const scenePlan of input.executionPlan.scenes) {
      fingerprintBySceneId[scenePlan.sceneId] = computeSceneFingerprint(scenePlan);
    }

    // --- RESOLVING_ASSETS: so materializa candidatos JA fornecidos ---
    await transitionTo("RESOLVING_ASSETS", "Resolvendo assets reutilizaveis ja fornecidos pelo chamador (nenhuma geracao nova).");
    const strategyByScene: Record<string, string | null> = {};
    for (const scene of scenes) strategyByScene[scene.sceneId] = scene.productGenerationStrategy;

    const suppliedCandidates = input.existingSceneAssetCandidates ?? [];
    // Em EXECUTE, um candidato so e aceito se o fingerprint bater com a
    // cena ATUAL (item 27) - candidatos sem fingerprint (DRY_RUN/manuais)
    // continuam passando direto.
    const candidatesForResolution =
      input.mode === "EXECUTE" ? filterCandidatesByFingerprint(suppliedCandidates, fingerprintBySceneId) : suppliedCandidates;

    // Sempre avaliado de verdade, mesmo sem nenhum candidato fornecido -
    // uma campanha nova (nada gerado ainda) fica honestamente
    // MISSING_ASSET, nunca "nao avaliado" (ver item 11 do enunciado:
    // "se qualquer asset obrigatorio estiver ausente, bloquear - nunca
    // montar comercial incompleto silenciosamente").
    const resolved = await resolveRealSceneAssets(
      scenes.map((s) => s.sceneId),
      candidatesForResolution,
      { cacheDir: input.assetCacheDir, productGenerationStrategyByScene: strategyByScene },
    );

    for (const scene of scenes) {
      const match = resolved.find((r) => r.sceneId === scene.sceneId) ?? null;
      scene.existingAsset = match
        ? { source: match.source, inputVideoPath: match.inputVideoPath, status: match.status, rejectionReason: match.rejectionReason }
        : null;
    }

    // --- BUILDING_NARRATION: reusa o Narration Script Builder V1 tal qual ---
    await transitionTo("BUILDING_NARRATION", "Construindo NarrationPlan via Narration Script Builder V1 (nenhuma sintese).");
    const narrationPlan = buildNarrationPlan(
      input.executionPlan.campaignId,
      input.executionPlan.promptPlan,
      input.narrationOffer,
      input.narrationProduct,
      input.productIntelligenceCategory,
    );
    const narrationQualityResult = assessNarrationQuality(narrationPlan);

    // --- Execution Readiness V1: "esta campanha chega ate um MP4 final
    // com o que existe hoje?" - PURO, computado em AMBOS os modos (gratis),
    // mas so usado pra BLOQUEAR chamada real quando mode==="EXECUTE".
    // Precisa acontecer ANTES de qualquer chamada paga - inclusive antes
    // do TTS (nunca sintetizar narracao pra cenas cujo video jamais tera
    // asset real, ver item 6 do enunciado).
    const executionReadiness = evaluateCampaignExecutionReadiness(
      scenes,
      narrationPlan,
      input.creativeQualityGateStatus,
      input.commercialPersuasionGateStatus,
    );
    const canAttemptPaidCalls = input.mode !== "EXECUTE" || executionReadiness.canProduceFinalCommercial;

    // --- GENERATING_NARRATION ---
    const newTtsCredits = narrationPlan.scenes.reduce((sum, scene) => {
      if (scene.status !== "READY" || !scene.text) return sum;
      const fingerprint = computeNarrationFingerprint(scene.text, GAROTA_RADAR_VOICE_PROFILE.voiceId, GAROTA_RADAR_VOICE_PROFILE.model);
      const reusable = (input.existingNarrationExecutionRecords ?? []).some(
        (record) =>
          record.sceneId === scene.sceneId &&
          record.fingerprint === fingerprint &&
          (record.status === "COMPLETED" || record.status === "REUSED") &&
          record.audioPath !== null,
      );
      return reusable ? sum : sum + scene.text.length;
    }, 0);
    const ttsCostGuard = checkCreditsGuard(newTtsCredits, input.maxTtsCredits, false);

    let narrationExecutionRecords: NarrationExecutionRecord[] = [];
    let narrationSegments: import("@/lib/commercial-video/audio/types").NarrationSegment[] = [];

    if (input.mode === "EXECUTE") {
      await transitionTo(
        "GENERATING_NARRATION",
        !canAttemptPaidCalls
          ? `EXECUTE: sintese de narracao bloqueada antes de qualquer chamada - readiness=${executionReadiness.status} (${executionReadiness.reasons.join(" | ") || "ver executionReadiness.scenes"}).`
          : ttsCostGuard.status === "OK"
            ? "EXECUTE: sintetizando narracao real via ElevenLabs (Garota Radar / Ana Dias), no maximo 1 tentativa por fala."
            : `EXECUTE: sintese de narracao bloqueada antes de qualquer chamada - ${ttsCostGuard.reason}`,
      );

      if (ttsCostGuard.status === "OK" && canAttemptPaidCalls) {
        const narrationOutputDir = input.narrationOutputDir ?? `${input.assetCacheDir}/narration`;
        const narrationProvider =
          input.executeOverrides?.narrationProviderFactory?.(narrationOutputDir) ?? createGarotaRadarNarrationProvider(narrationOutputDir);

        const narrationOutcome = await executeNarrationPlan(
          narrationPlan,
          input.executionPlan.promptPlan,
          input.existingNarrationExecutionRecords ?? [],
          {
            narrationProvider,
            voiceId: GAROTA_RADAR_VOICE_PROFILE.voiceId,
            model: GAROTA_RADAR_VOICE_PROFILE.model,
          },
        );
        narrationExecutionRecords = narrationOutcome.records;
        narrationSegments = narrationOutcome.segments;

        // Item 15: narracao que nao coube na janela bloqueia IMEDIATAMENTE
        // - nunca acelera, nunca corta, nunca regenera automaticamente, e
        // nunca gasta credito de VIDEO depois disso.
        const tooLong = narrationExecutionRecords.filter((r) => r.status === "TOO_LONG");
        if (tooLong.length > 0) {
          const message = `NARRATION_TOO_LONG em ${tooLong.length} cena(s) - revisao humana necessaria antes de tentar de novo: ${tooLong.map((r) => r.sceneId).join(", ")}.`;
          const quality = aggregateRunnerQuality(scenes, narrationQualityResult, false, ttsCostGuard.status === "OK");
          errors.push(message);
          await transitionTo("BLOCKED", message);
          const completedAt = new Date().toISOString();
          return {
            ...emptyResultShell(),
            status,
            completedAt,
            durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
            scenes,
            narrationPlan,
            narrationQualityResult,
            ttsCostGuard,
            quality,
            traceability: buildRunnerTraceability(scenes, narrationPlan, GAROTA_RADAR_VOICE_PROFILE.voiceId, GAROTA_RADAR_VOICE_PROFILE.voiceName),
            executionReadiness,
            narrationExecutionRecords,
          };
        }
      }
    } else {
      await transitionTo("GENERATING_NARRATION", "DRY_RUN: nenhuma chamada ElevenLabs - so estimativa de credito (1 char = 1 credito).");
    }

    const pendingGenerationScenes = scenes.filter((s) => s.eligibility === "ELIGIBLE" && s.selectedProvider !== "mock" && s.existingAsset?.status !== "READY");

    const videoCreditsKnown = pendingGenerationScenes.reduce((sum, s) => sum + (s.estimatedCost.estimatedCredits ?? 0), 0);
    const videoCurrencyCostCentsKnown = pendingGenerationScenes.every((s) => s.estimatedCost.estimatedCurrencyCostCents !== null)
      ? pendingGenerationScenes.reduce((sum, s) => sum + (s.estimatedCost.estimatedCurrencyCostCents ?? 0), 0)
      : null;
    const usdCostScenes = pendingGenerationScenes.filter((s) => s.estimatedCost.estimatedUsdCostCents !== null);
    const videoUsdCostCentsKnown = usdCostScenes.length
      ? usdCostScenes.reduce((sum, s) => sum + (s.estimatedCost.estimatedUsdCostCents ?? 0), 0)
      : null;

    const unknownCurrencyComponents: string[] = [];
    for (const scene of scenes) {
      if (scene.requiresHybridPipeline && scene.eligibility === "BLOCKED_PROVIDER_STATUS") {
        unknownCurrencyComponents.push(
          `${scene.sceneId}: exige pipeline HYBRID com um provider de background ainda UNVERIFIED - o custo real ` +
            `(ex: WAN 2.5 T2V, 300 creditos/segundo) NAO esta incluso no total de video acima porque o plano persistido ` +
            `caiu pra "mock" (0 custo) por guardrail de provider lifecycle, nao por um custo real calculado.`,
        );
      }
    }

    const costPreview: CostPreview = {
      videoCreditsKnown,
      videoCurrencyCostCentsKnown,
      videoUsdCostCentsKnown,
      ttsCredits: newTtsCredits,
      ttsCurrencyCostCents: null,
      unknownCurrencyComponents,
    };

    // Item 17: EXECUTE nunca aceita acknowledgeUnknownCost - nao importa o
    // que o chamador mandou, o custo desconhecido bloqueia por padrao.
    const effectiveAcknowledgeUnknownVideoCost = input.mode === "EXECUTE" ? false : (input.acknowledgeUnknownVideoCost ?? false);

    let videoCostGuard = checkCreditsGuard(videoCreditsKnown, input.maxVideoCredits, effectiveAcknowledgeUnknownVideoCost);
    const usdCostGuard = checkUsdCentsGuard(videoUsdCostCentsKnown ?? 0, input.maxUsdCostCents ?? null, false);
    if (videoCostGuard.status === "OK" && unknownCurrencyComponents.length > 0 && !effectiveAcknowledgeUnknownVideoCost) {
      videoCostGuard = {
        status: "BLOCKED_UNKNOWN_COST",
        reason: "Existe(m) componente(s) de custo de video desconhecido(s) (ver costPreview.unknownCurrencyComponents) - exige acknowledgeUnknownVideoCost=true.",
      };
    }

    const sceneExecutionRecords: SceneExecutionRecord[] = [];
    const characterAudioUrlsBySceneId: Record<string, string> = {};

    if (input.mode === "EXECUTE") {
      await transitionTo(
        "COMPOSING_VIDEO",
        !canAttemptPaidCalls
          ? `EXECUTE: geracao de video bloqueada antes de qualquer chamada paga - campanha inteira bloqueada por readiness=${executionReadiness.status} (regra atomica: uma cena obrigatoria sem caminho real bloqueia TODAS as chamadas pagas, mesmo cenas elegiveis).`
          : videoCostGuard.status === "OK" && usdCostGuard.status === "OK"
            ? "EXECUTE: executando geracao real por cena elegivel sem asset reutilizavel (no maximo 1 tentativa paga por cena)."
            : `EXECUTE: geracao de video bloqueada antes de qualquer chamada paga - ${videoCostGuard.reason ?? usdCostGuard.reason}`,
      );

      if (videoCostGuard.status === "OK" && usdCostGuard.status === "OK" && canAttemptPaidCalls) {
        for (const scene of scenes) {
          if (scene.selectedProvider !== "heygen-image-avatar") continue;

          const segment = narrationSegments.find((entry) => entry.sceneId === scene.sceneId);
          if (segment?.status !== "READY" || !segment.audioPath) {
            errors.push(`Cena ${scene.sceneId} exige HeyGen, mas nao tem narracao READY para audio_url.`);
            continue;
          }

          const uploadedAudio = await publishVideoToSupabase({
            localFilePath: segment.audioPath,
            fileName: `narration-${scene.sceneId}.mp3`,
            bucket: process.env.AI_ASSET_STORAGE_BUCKET || "ugc-assets",
            contentType: "audio/mpeg",
            metadata: { sceneId: scene.sceneId, provider: "elevenlabs", purpose: "heygen-audio-url" },
          });

          if (uploadedAudio.status !== "success" || !uploadedAudio.publicUrl) {
            errors.push(`Falha ao publicar audio da cena ${scene.sceneId} para HeyGen: ${uploadedAudio.error ?? "erro desconhecido"}.`);
            continue;
          }

          characterAudioUrlsBySceneId[scene.sceneId] = uploadedAudio.publicUrl;
          const record = narrationExecutionRecords.find((entry) => entry.sceneId === scene.sceneId && entry.status === "COMPLETED");
          if (record) record.audioUrl = uploadedAudio.publicUrl;
        }

        const sceneDeps: SceneExecutorDeps = { cacheDir: input.assetCacheDir, characterAudioUrlsBySceneId, ...input.executeOverrides?.sceneExecutorDeps };
        const hybridDeps: HybridSceneExecutorDeps = { cacheDir: input.assetCacheDir, ...input.executeOverrides?.hybridSceneExecutorDeps };

        for (const scene of scenes) {
          if (scene.eligibility !== "ELIGIBLE") continue;
          if (scene.selectedProvider === "mock") continue; // item 4: MOCK nunca gera nada sozinho em EXECUTE
          if (scene.existingAsset?.status === "READY") continue; // ja reutilizavel (fingerprint bateu)

          const scenePlan = input.executionPlan.scenes.find((s) => s.sceneId === scene.sceneId);
          if (!scenePlan) continue;
          const fingerprint = fingerprintBySceneId[scene.sceneId];

          const outcome = scene.requiresHybridPipeline
            ? await executeHybridScene(scenePlan, fingerprint, hybridDeps)
            : await executeStandardScene(scenePlan, fingerprint, sceneDeps);

          sceneExecutionRecords.push(outcome.record);

          if (outcome.record.status === "COMPLETED" && outcome.localVideoPath) {
            scene.existingAsset = {
              source: scene.requiresHybridPipeline ? "HYBRID_COMPOSITE" : "GENERATION_RESULT",
              inputVideoPath: outcome.localVideoPath,
              status: "READY",
              rejectionReason: null,
            };
          }
        }
      }
    } else {
      await transitionTo("COMPOSING_VIDEO", "DRY_RUN: composicao visual planejada, nao executada (reutilizaria Commercial Video Composer existente quando EXECUTE existir).");
    }

    if (input.mode === "EXECUTE") {
      await transitionTo("MIXING_AUDIO", "EXECUTE: preparando composicao final (video + audio + mux) - ver FINALIZING.");
    } else {
      await transitionTo("MIXING_AUDIO", "DRY_RUN: mixagem de audio planejada, nao executada (reutilizaria Audio Pipeline V1 existente quando EXECUTE existir).");
    }

    // --- FINALIZING ---
    await transitionTo("FINALIZING", "Agregando quality gates e traceability.");
    const quality = aggregateRunnerQuality(scenes, narrationQualityResult, videoCostGuard.status === "OK" && usdCostGuard.status === "OK", ttsCostGuard.status === "OK");
    const traceability = buildRunnerTraceability(
      scenes,
      narrationPlan,
      GAROTA_RADAR_VOICE_PROFILE.voiceId,
      GAROTA_RADAR_VOICE_PROFILE.voiceName,
    );

    let finalVideoPath: string | null = null;
    let finalVideoUrl: string | null = null;
    let finalStatus: RunnerJobStatus = quality.finalStatus === "FAIL" ? "BLOCKED" : "COMPLETED";
    let finalNote = finalStatus === "BLOCKED"
      ? "Um ou mais componentes obrigatorios bloquearam o plano - ver quality.finalStatus e os campos individuais."
      : "DRY_RUN concluido - plano pronto para revisao (nenhuma chamada paga foi feita).";

    if (input.mode === "EXECUTE" && !executionReadiness.canProduceFinalCommercial) {
      // Garantia extra (belt-and-suspenders): mesmo que algum guard
      // individual desse OK, readiness bloqueada NUNCA pode terminar
      // COMPLETED - a campanha inteira ja foi barrada antes de qualquer
      // chamada paga (ver canAttemptPaidCalls).
      finalStatus = "BLOCKED";
      finalNote = `EXECUTE bloqueado por Execution Readiness (${executionReadiness.status}) - nenhuma chamada paga foi feita: ${executionReadiness.reasons.join(" | ")}`;
      errors.push(...executionReadiness.reasons);
    }

    // So tenta compor o MP4 final se EXECUTE chegou ate aqui com tudo
    // elegivel/pronto (sceneEligibility/assetResolution/narrationQuality
    // ja PASS e os dois cost guards ja OK - ver aggregateRunnerQuality).
    if (input.mode === "EXECUTE" && finalStatus === "COMPLETED") {
      const finalOutputDir = input.finalOutputDir ?? `${input.assetCacheDir}/final`;
      // CampaignPromptPlan nao tem aspectRatio no nivel raiz - todas as
      // cenas de um comercial compartilham a mesma proporcao na pratica
      // (ver SceneGenerationPrompt.aspectRatio), entao a primeira cena e
      // uma fonte segura; "9:16" e o fallback conservador do proprio
      // resolveCanvasSize quando nada e informado.
      const aspectRatio = input.executionPlan.promptPlan.scenes[0]?.aspectRatio ?? "9:16";

      const composition = await composeAndFinalizeCommercial(
        input.executionPlan.campaignId,
        input.executionPlan.promptPlan,
        aspectRatio,
        scenes,
        narrationSegments,
        narrationExecutionRecords,
        { outputDir: finalOutputDir, ...input.executeOverrides?.finalCompositionDeps },
      );

      finalVideoPath = composition.finalVideoPath;
      finalVideoUrl = composition.finalVideoUrl;

      if (composition.status === "COMPLETED") {
        finalStatus = "COMPLETED";
        finalNote = "EXECUTE concluido - MP4 comercial real produzido e quality gate final aprovado.";
      } else if (composition.status === "BLOCKED_REVIEW_REQUIRED") {
        finalStatus = "BLOCKED";
        finalNote = `EXECUTE bloqueado na composicao final: ${composition.reasons.join(" | ")}`;
        errors.push(...composition.reasons);
      } else {
        finalStatus = "FAILED";
        errors.push(...composition.reasons);
      }
    } else if (input.mode === "EXECUTE" && executionReadiness.canProduceFinalCommercial) {
      // So aplica esta mensagem generica quando o bloqueio NAO veio de
      // Execution Readiness (que ja escreveu um finalNote especifico
      // acima) - nunca sobrescreve o motivo mais preciso por um generico.
      finalNote =
        finalStatus === "BLOCKED"
          ? "EXECUTE bloqueado antes da composicao final - ver quality/videoCostGuard/usdCostGuard/ttsCostGuard/scenes."
          : finalNote;
    }

    await transitionTo(finalStatus, finalNote);

    const completedAt = new Date().toISOString();

    return {
      campaignId: input.executionPlan.campaignId,
      mode: input.mode,
      status,
      startedAt,
      completedAt,
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      transitions,
      scenes,
      narrationPlan,
      narrationQualityResult,
      costPreview,
      videoCostGuard,
      usdCostGuard,
      ttsCostGuard,
      quality,
      traceability,
      finalVideoPath,
      finalVideoUrl,
      executionGuard,
      executionReadiness,
      sceneExecutionRecords,
      narrationExecutionRecords,
      errors,
    };
  } catch (error) {
    return await buildFailureResult(error instanceof Error ? error.message : "Erro desconhecido no Commercial Generation Runner.");
  }
}
