// Radar Creative AI - Commercial Generation Runner V1 / Job Persistence - Types
//
// Camada fina sobre a tabela commercial_generation_jobs (ver migration
// 20260809100000_create_commercial_generation_jobs.sql). Nao redefine a
// state machine do Runner - so persiste os estados que ela ja produz.

import type {
  CommercialGenerationResult,
  RunnerJobStatus,
  RunnerMode,
  RunnerQualityStatus,
  RunnerTraceabilityEntry,
} from "@/lib/commercial-video/runner/types";

export type CommercialReviewStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";

// Mesma lista de estados "nao terminais" da state machine do Runner
// (CREATED..FINALIZING) - um job so pode estar ATIVO nesses estados.
// COMPLETED/BLOCKED/FAILED sao sempre terminais, nunca contam como job
// ativo pra fins de idempotencia (ver commercial-job-repository.ts#createJob).
export const ACTIVE_JOB_STATUSES: RunnerJobStatus[] = [
  "CREATED",
  "PREPARING",
  "GENERATING_SCENES",
  "RESOLVING_ASSETS",
  "BUILDING_NARRATION",
  "GENERATING_NARRATION",
  "COMPOSING_VIDEO",
  "MIXING_AUDIO",
  "FINALIZING",
];

export function isActiveJobStatus(status: RunnerJobStatus): boolean {
  return ACTIVE_JOB_STATUSES.includes(status);
}

export type CommercialGenerationJobRow = {
  id: string;
  campaign_id: string;
  offer_id: string | null;
  mode: RunnerMode;
  status: RunnerJobStatus;
  current_stage: string | null;
  progress_percent: number;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  estimated_video_credits: number | null;
  estimated_tts_credits: number | null;
  known_cost_brl: number | null;
  cost_has_unknown_components: boolean;
  quality_status: RunnerQualityStatus | null;
  error_code: string | null;
  error_message: string | null;
  runner_result: CommercialGenerationResult | null;
  traceability: RunnerTraceabilityEntry[] | null;
  review_status: CommercialReviewStatus;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  reviewed_by_email: string | null;
  review_notes: string | null;
  human_acknowledged_observations: boolean;
  created_by_user_id: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateJobInput = {
  campaignId: string;
  offerId: string | null;
  mode: RunnerMode;
  createdByUserId: string | null;
  createdByEmail: string | null;
};

export type CreateJobResult = {
  job: CommercialGenerationJobRow;
  // true quando um job ATIVO ja existente foi devolvido em vez de criar
  // um novo (ver item 5/18 do enunciado - idempotencia).
  reused: boolean;
};

export type ListJobsFilter = {
  campaignId?: string;
  status?: RunnerJobStatus;
  mode?: RunnerMode;
  limit?: number;
};

export type UpdateJobReviewInput = {
  jobId: string;
  reviewStatus: Extract<CommercialReviewStatus, "APPROVED" | "REJECTED">;
  reviewedByUserId: string | null;
  reviewedByEmail: string | null;
  reviewNotes: string | null;
  humanAcknowledgedObservations: boolean;
};

// Codigos de erro conhecidos - "FAILED" so acontece por excecao
// inesperada/persistencia quebrada, nunca por um guardrail normal
// (isso vira BLOCKED, ver item 8 do enunciado).
export type JobErrorCode =
  | "EXECUTE_NOT_ENABLED"
  | "CAMPAIGN_NOT_FOUND"
  | "CAMPAIGN_NOT_PREPARED"
  | "RUNNER_EXCEPTION"
  | "PERSISTENCE_ERROR";
