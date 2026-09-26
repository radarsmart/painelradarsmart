// Radar Creative AI - Commercial Generation Runner V1 / Job Repository
//
// UNICA responsabilidade: persistencia da tabela commercial_generation_jobs.
// Nenhuma logica de geracao/orquestracao aqui - isso continua em
// commercial-generation-runner.ts. Idempotencia/concorrencia sao
// garantidas pelo INDICE UNICO PARCIAL da migration (nao por
// SELECT-depois-INSERT aqui) - ver createJob.

import { supabaseAdmin } from "@/lib/supabase";
import type { CommercialGenerationResult, RunnerJobStatus, RunnerMode, RunnerStateTransition } from "@/lib/commercial-video/runner/types";
import {
  ACTIVE_JOB_STATUSES,
  type CommercialGenerationJobRow,
  type CreateJobInput,
  type CreateJobResult,
  type JobErrorCode,
  type ListJobsFilter,
  type UpdateJobReviewInput,
} from "@/lib/commercial-video/jobs/types";

const JOB_COLUMNS =
  "id,campaign_id,offer_id,mode,status,current_stage,progress_percent,started_at,completed_at,failed_at," +
  "estimated_video_credits,estimated_tts_credits,known_cost_brl,cost_has_unknown_components,quality_status," +
  "error_code,error_message,runner_result,traceability,review_status,reviewed_at,reviewed_by_user_id,reviewed_by_email," +
  "review_notes,human_acknowledged_observations,created_by_user_id,created_by_email,created_at,updated_at";

const UNIQUE_VIOLATION_CODE = "23505";

async function findActiveJob(campaignId: string, mode: RunnerMode): Promise<CommercialGenerationJobRow | null> {
  const { data, error } = await supabaseAdmin
    .from("commercial_generation_jobs")
    .select(JOB_COLUMNS)
    .eq("campaign_id", campaignId)
    .eq("mode", mode)
    .in("status", ACTIVE_JOB_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar job ativo: ${error.message}`);
  return (data as unknown as CommercialGenerationJobRow | null) ?? null;
}

/**
 * Tenta criar um job novo. Se ja existir um job ATIVO (nao-terminal) para
 * a mesma campanha+modo, o INSERT falha com unique_violation (23505) por
 * causa do indice parcial da migration - nesse caso devolvemos o job
 * ativo existente em vez de propagar o erro (ver item 5/18 do enunciado:
 * "se ja existir um job ativo compativel, retornar o job existente").
 * Essa protecao e atomica no proprio Postgres, nunca depende de um
 * SELECT feito antes pela aplicacao (que teria uma janela de corrida
 * entre duas requisicoes POST simultaneas).
 */
export async function createJob(input: CreateJobInput): Promise<CreateJobResult> {
  const inserted = await supabaseAdmin
    .from("commercial_generation_jobs")
    .insert({
      campaign_id: input.campaignId,
      offer_id: input.offerId,
      mode: input.mode,
      status: "CREATED",
      current_stage: "CREATED",
      progress_percent: 0,
      created_by_user_id: input.createdByUserId,
      created_by_email: input.createdByEmail,
    })
    .select(JOB_COLUMNS)
    .single();

  if (!inserted.error) {
    return { job: inserted.data as unknown as CommercialGenerationJobRow, reused: false };
  }

  if (inserted.error.code === UNIQUE_VIOLATION_CODE) {
    const existing = await findActiveJob(input.campaignId, input.mode);
    if (existing) return { job: existing, reused: true };
  }

  throw new Error(`Falha ao criar job: ${inserted.error.message}`);
}

export async function getJob(id: string): Promise<CommercialGenerationJobRow | null> {
  const { data, error } = await supabaseAdmin.from("commercial_generation_jobs").select(JOB_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao buscar job: ${error.message}`);
  return (data as unknown as CommercialGenerationJobRow | null) ?? null;
}

export async function listJobs(filter: ListJobsFilter): Promise<CommercialGenerationJobRow[]> {
  let query = supabaseAdmin.from("commercial_generation_jobs").select(JOB_COLUMNS).order("created_at", { ascending: false });

  if (filter.campaignId) query = query.eq("campaign_id", filter.campaignId);
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.mode) query = query.eq("mode", filter.mode);

  query = query.limit(filter.limit ?? 50);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao listar jobs: ${error.message}`);
  return (data as unknown as CommercialGenerationJobRow[] | null) ?? [];
}

/**
 * Chamado a cada transicao de estado do Runner (ver onStateChange) -
 * so atualiza status/estagio/progresso, nunca o resultado final (isso e
 * finalizeJob).
 */
export async function updateJobStage(jobId: string, transition: RunnerStateTransition, progressPercent: number): Promise<void> {
  const patch: Record<string, unknown> = {
    status: transition.to,
    current_stage: transition.to,
    progress_percent: progressPercent,
    updated_at: new Date().toISOString(),
  };

  if (transition.to === "PREPARING") {
    patch.started_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin.from("commercial_generation_jobs").update(patch).eq("id", jobId);
  if (error) throw new Error(`Falha ao atualizar estagio do job: ${error.message}`);
}

// Allowlist explicito dos campos persistidos - CommercialGenerationResult
// nunca carrega API keys/headers/secrets por design (ver Commercial
// Generation Runner V1), mas o allowlist protege contra um campo novo
// sensivel ser adicionado ao tipo no futuro e persistido aqui sem revisao.
function toPersistableRunnerResult(result: CommercialGenerationResult): CommercialGenerationResult {
  return {
    campaignId: result.campaignId,
    mode: result.mode,
    status: result.status,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    transitions: result.transitions,
    scenes: result.scenes,
    narrationPlan: result.narrationPlan,
    narrationQualityResult: result.narrationQualityResult,
    costPreview: result.costPreview,
    videoCostGuard: result.videoCostGuard,
    usdCostGuard: result.usdCostGuard,
    ttsCostGuard: result.ttsCostGuard,
    quality: result.quality,
    traceability: result.traceability,
    finalVideoPath: result.finalVideoPath,
    finalVideoUrl: result.finalVideoUrl,
    executionGuard: result.executionGuard,
    executionReadiness: result.executionReadiness,
    sceneExecutionRecords: result.sceneExecutionRecords,
    narrationExecutionRecords: result.narrationExecutionRecords,
    errors: result.errors,
  };
}

export type FinalizeJobInput = {
  jobId: string;
  status: Extract<RunnerJobStatus, "COMPLETED" | "BLOCKED" | "FAILED">;
  progressPercent: number;
  result: CommercialGenerationResult | null;
  errorCode: JobErrorCode | null;
  errorMessage: string | null;
};

/**
 * Unico ponto que grava o resultado estruturado. BLOCKED e COMPLETED
 * ambos recebem completed_at (a execucao do DRY_RUN terminou, so o
 * VEREDITO difere) - FAILED recebe failed_at (erro inesperado, ver
 * distincao no item 8 do enunciado).
 */
export async function finalizeJob(input: FinalizeJobInput): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: input.status,
    current_stage: input.status,
    progress_percent: input.progressPercent,
    updated_at: now,
    error_code: input.errorCode,
    error_message: input.errorMessage,
  };

  if (input.status === "FAILED") {
    patch.failed_at = now;
  } else {
    patch.completed_at = now;
  }

  if (input.result) {
    patch.runner_result = toPersistableRunnerResult(input.result);
    patch.traceability = input.result.traceability;
    patch.estimated_video_credits = input.result.costPreview.videoCreditsKnown;
    patch.estimated_tts_credits = input.result.costPreview.ttsCredits;
    patch.known_cost_brl =
      input.result.costPreview.videoCurrencyCostCentsKnown !== null
        ? input.result.costPreview.videoCurrencyCostCentsKnown / 100
        : null;
    patch.cost_has_unknown_components = input.result.costPreview.unknownCurrencyComponents.length > 0;
    patch.quality_status = input.result.quality.finalStatus;
  }

  const { error } = await supabaseAdmin.from("commercial_generation_jobs").update(patch).eq("id", input.jobId);
  if (error) throw new Error(`Falha ao finalizar job: ${error.message}`);
}

export async function updateJobReview(input: UpdateJobReviewInput): Promise<CommercialGenerationJobRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("commercial_generation_jobs")
    .update({
      review_status: input.reviewStatus,
      reviewed_at: now,
      reviewed_by_user_id: input.reviewedByUserId,
      reviewed_by_email: input.reviewedByEmail,
      review_notes: input.reviewNotes,
      human_acknowledged_observations: input.humanAcknowledgedObservations,
      updated_at: now,
    })
    .eq("id", input.jobId)
    .select(JOB_COLUMNS)
    .single();

  if (error) throw new Error(`Falha ao registrar revisao humana: ${error.message}`);
  return data as unknown as CommercialGenerationJobRow;
}
