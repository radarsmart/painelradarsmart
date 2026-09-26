// Radar Creative AI - Commercial Generation Runner V1 / Job API View
//
// PURO - traduz a linha crua da tabela (snake_case) para o formato JSON
// exposto pelas rotas admin (camelCase). Unico lugar que faz essa
// traducao - evita duplicar o mapeamento entre POST/GET/GET-by-id.

import type { CommercialGenerationJobRow } from "@/lib/commercial-video/jobs/types";

// Tipo explicito do shape retornado pelas rotas (camelCase) - importado
// SOMENTE como type pelo frontend (components/admin/commercial-video/*),
// nunca duplicado a mao la. `ReturnType` garante que o tipo nunca
// diverge da funcao real.
export type CommercialJobApiView = ReturnType<typeof toApiJob>;

export function toApiJob(job: CommercialGenerationJobRow) {
  return {
    id: job.id,
    campaignId: job.campaign_id,
    offerId: job.offer_id,
    mode: job.mode,
    status: job.status,
    currentStage: job.current_stage,
    progressPercent: job.progress_percent,
    costSummary: {
      estimatedVideoCredits: job.estimated_video_credits,
      estimatedTtsCredits: job.estimated_tts_credits,
      knownCostBRL: job.known_cost_brl,
      costHasUnknownComponents: job.cost_has_unknown_components,
    },
    qualityStatus: job.quality_status,
    runnerResult: job.runner_result,
    traceability: job.traceability,
    review: {
      status: job.review_status,
      reviewedAt: job.reviewed_at,
      reviewedByUserId: job.reviewed_by_user_id,
      reviewedByEmail: job.reviewed_by_email,
      notes: job.review_notes,
      humanAcknowledgedObservations: job.human_acknowledged_observations,
    },
    error: job.error_code ? { code: job.error_code, message: job.error_message } : null,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    failedAt: job.failed_at,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}
