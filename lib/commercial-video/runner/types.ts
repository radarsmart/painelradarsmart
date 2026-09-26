// Radar Creative AI - Commercial Generation Runner V1 / Types
//
// O Runner NAO decide estrategia comercial, copy, provider ou hybrid -
// ele so ORQUESTRA modulos ja existentes e validados (Generation
// Orchestrator, Real Scene Asset Integration, Narration Script Builder,
// Audio Pipeline, Commercial Video Pipeline). Nesta V1, so o modo
// DRY_RUN esta implementado - EXECUTE fica pro contrato, nao pra logica
// real (ver commercial-generation-runner.ts).

import type { GenerationCostEstimate, SceneExecutionStatus } from "@/lib/generation-orchestrator/types";
import type { ProductGenerationStrategy } from "@/lib/generation-orchestrator/product-generation-strategy";
import type { ScenePurpose } from "@/lib/commercial-director/types";
import type { ResolvedCommercialSceneAssetStatus, SceneAssetSource } from "@/lib/commercial-video/scene-asset-types";
import type { NarrationPlan, NarrationQualityResult } from "@/lib/commercial-video/narration/types";
import type { CampaignExecutionReadiness } from "@/lib/commercial-video/runner/execute/execution-readiness";

export type RunnerMode = "DRY_RUN" | "EXECUTE";

export type RunnerJobStatus =
  | "CREATED"
  | "PREPARING"
  | "GENERATING_SCENES"
  | "RESOLVING_ASSETS"
  | "BUILDING_NARRATION"
  | "GENERATING_NARRATION"
  | "COMPOSING_VIDEO"
  | "MIXING_AUDIO"
  | "FINALIZING"
  | "COMPLETED"
  | "FAILED"
  | "BLOCKED";

export type RunnerStateTransition = {
  from: RunnerJobStatus;
  to: RunnerJobStatus;
  at: string;
  note: string | null;
};

// Elegibilidade de UMA cena pra geracao real - sempre derivada de dados
// JA calculados por outro modulo (SceneExecutionPlan.status/statusReason,
// ProviderCapabilityProfile.status), nunca uma nova decisao de selecao.
export type SceneEligibility =
  | "ELIGIBLE"
  | "BLOCKED_PROVIDER_STATUS"
  | "BLOCKED_REFERENCE_QUALITY"
  | "BLOCKED_VALIDATION"
  | "BLOCKED_CAPABILITY_FIDELITY"
  | "SKIPPED";

export type SceneRunnerPlan = {
  sceneId: string;
  sceneOrder: number;
  purpose: ScenePurpose;
  providerCapability: string;
  selectedProvider: string;
  // Status ATUAL do provider no registro (ver provider-capabilities.ts) -
  // recalculado no momento do Runner rodar, pode divergir do que o
  // GenerationPlan persistido tinha quando foi criado (plano fica stale
  // se o registro mudar depois).
  providerStatus: string | null;
  productGenerationStrategy: ProductGenerationStrategy | null;
  requiresHybridPipeline: boolean;
  eligibility: SceneEligibility;
  eligibilityReason: string | null;
  // Custo JA calculado pelo cost-estimator.ts - nunca recalculado aqui.
  estimatedCost: GenerationCostEstimate;
  // Status original do SceneExecutionPlan persistido, pra auditoria (o
  // Runner nao sobrescreve isso, so le).
  persistedStatus: SceneExecutionStatus;
  persistedStatusReason: string | null;
  // Preenchido quando um candidato de asset JA EXISTENTE e reutilizavel
  // foi fornecido pelo chamador (ver idempotencia, item 16/17) - nunca
  // gerado pelo Runner.
  existingAsset: {
    source: SceneAssetSource | null;
    inputVideoPath: string | null;
    status: ResolvedCommercialSceneAssetStatus;
    rejectionReason: string | null;
  } | null;
};

export type CostPreview = {
  videoCreditsKnown: number;
  videoCurrencyCostCentsKnown: number | null;
  videoUsdCostCentsKnown: number | null;
  ttsCredits: number;
  // Sempre null nesta fase - taxa credito ElevenLabs -> BRL desta conta
  // nao e conhecida (ver GAROTA_RADAR_VOICE_PROFILE/CANARYs anteriores).
  ttsCurrencyCostCents: null;
  // Qualquer componente de custo que existe mas nao pode ser somado com
  // seguranca (ex: cena HYBRID que cairia pra um provider UNVERIFIED cujo
  // custo real nao esta refletido no total acima) - nunca resolvido
  // silenciosamente como zero.
  unknownCurrencyComponents: string[];
};

export type CostGuardStatus = "OK" | "BLOCKED_LIMIT_EXCEEDED" | "BLOCKED_UNKNOWN_COST" | "BLOCKED_NO_LIMIT_CONFIGURED";

export type CostGuardResult = {
  status: CostGuardStatus;
  reason: string | null;
};

export type RunnerQualityStatus = "PASS" | "PASS_WITH_OBSERVATIONS" | "FAIL" | "NOT_EVALUATED";

export type RunnerQualityAggregate = {
  sceneEligibility: RunnerQualityStatus;
  assetResolution: RunnerQualityStatus;
  narrationQuality: RunnerQualityStatus;
  // So populados apos um EXECUTE real (nao implementado nesta V1).
  audioQuality: RunnerQualityStatus;
  finalVideoQuality: RunnerQualityStatus;
  finalStatus: RunnerQualityStatus;
};

// --- EXECUTE V1 -----------------------------------------------------
//
// Guard de autorizacao/limites do proprio EXECUTE - INDEPENDENTE de
// custo (isso continua sendo videoCostGuard/ttsCostGuard). "OK" em
// DRY_RUN sempre (a checagem so se aplica a mode==="EXECUTE").
export type ExecutionGuardStatus = "OK" | "BLOCKED_EXECUTION_NOT_CONFIRMED" | "BLOCKED_NO_LIMIT_CONFIGURED";

export type ExecutionGuardResult = {
  status: ExecutionGuardStatus;
  reason: string | null;
};

export type SceneExecutionRecordStatus = "COMPLETED" | "FAILED" | "REUSED";

// Resultado PERSISTIDO de UMA tentativa real de geracao de cena - existe
// tanto pra traceability/debug (item 19 do enunciado) quanto pra decidir
// reuso entre jobs (ver fingerprint, item 27). outputUrl e SEMPRE uma URL
// do nosso proprio Storage quando status===COMPLETED (nunca uma URL
// efemera do provider - ver item 20).
export type SceneExecutionRecord = {
  sceneId: string;
  fingerprint: string;
  provider: string;
  generationId: string | null;
  status: SceneExecutionRecordStatus;
  outputUrl: string | null;
  durationSeconds: number | null;
  completedAt: string | null;
  error: string | null;
};

export type NarrationExecutionRecordStatus = "COMPLETED" | "FAILED" | "TOO_LONG" | "REUSED";

export type NarrationExecutionRecord = {
  sceneId: string;
  fingerprint: string;
  status: NarrationExecutionRecordStatus;
  audioPath: string | null;
  // URL publica do audio quando ele precisa ser consumido por outro
  // provider (ex: HeyGen Image Avatar). Null/undefined quando ainda nao
  // foi publicado ou quando a fala foi reutilizada localmente.
  audioUrl?: string | null;
  actualDurationSeconds: number | null;
  completedAt: string | null;
  error: string | null;
};

export type RunnerTraceabilityEntry = {
  sceneId: string;
  purpose: ScenePurpose;
  productGenerationStrategy: ProductGenerationStrategy | null;
  selectedProvider: string;
  providerStatus: string | null;
  existingAssetSource: SceneAssetSource | null;
  narrationText: string | null;
  narrationStatus: string;
  voiceProfileVoiceId: string | null;
  // Nome de exibicao (ex: "Ana Dias - Engaging, Smooth and Forceful") -
  // existe SO pra UI nunca precisar hardcodar o nome da voz oficial
  // (ver GAROTA_RADAR_VOICE_PROFILE.voiceName, unica fonte real).
  voiceProfileVoiceName: string | null;
  estimatedVideoCredits: number | null;
  estimatedTtsCredits: number;
};

export type CommercialGenerationResult = {
  campaignId: string;
  mode: RunnerMode;
  status: RunnerJobStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  transitions: RunnerStateTransition[];
  scenes: SceneRunnerPlan[];
  narrationPlan: NarrationPlan | null;
  narrationQualityResult: NarrationQualityResult | null;
  costPreview: CostPreview;
  videoCostGuard: CostGuardResult;
  usdCostGuard: CostGuardResult;
  ttsCostGuard: CostGuardResult;
  quality: RunnerQualityAggregate;
  traceability: RunnerTraceabilityEntry[];
  // Preenchido so em EXECUTE (arquivo local do MP4 final, antes do
  // upload) - sempre null em DRY_RUN.
  finalVideoPath: string | null;
  // URL publica no nosso Storage do MP4 final (ver item 20/21) - sempre
  // null em DRY_RUN ou quando EXECUTE nao chegou a COMPLETED.
  finalVideoUrl: string | null;
  // "OK" em DRY_RUN sempre. Em EXECUTE, reflete confirmed/limites (itens
  // 2/3) - checado ANTES de qualquer avaliacao de cena.
  executionGuard: ExecutionGuardResult;
  // Execution Readiness V1 - computado em AMBOS os modos (e puro/gratis),
  // mas so usado para BLOQUEAR chamada real quando mode==="EXECUTE" (ver
  // commercial-generation-runner.ts). Em DRY_RUN funciona como preview
  // honesto de "isto teria caminho ate um MP4 final?" sem custo nenhum.
  executionReadiness: CampaignExecutionReadiness;
  // Outputs intermediarios reais de EXECUTE (item 19) - vazio em DRY_RUN
  // e vazio em EXECUTE quando nenhuma geracao real chegou a ser tentada.
  sceneExecutionRecords: SceneExecutionRecord[];
  narrationExecutionRecords: NarrationExecutionRecord[];
  errors: string[];
};
