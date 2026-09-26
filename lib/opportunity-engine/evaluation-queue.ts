import type { SupabaseClient } from "@supabase/supabase-js";

import { evaluateOffer, type OpportunityEvaluationResult } from "@/lib/opportunity-engine/evaluation-service";

export type EnqueueOpportunityEvaluationInput = {
  offerId: string;
  reason?: string;
  dedupeKey?: string;
  forceMarketRefresh?: boolean;
  forceDemandRefresh?: boolean;
  forceLearningRefresh?: boolean;
};

export type ProcessOpportunityJobsResult = {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: Array<{
    job_id: string;
    offer_id: string;
    status: "succeeded" | "failed" | "skipped";
    duration_ms?: number;
    error?: string;
    evaluation?: OpportunityEvaluationResult;
  }>;
};

export async function enqueueOpportunityEvaluation(
  client: SupabaseClient,
  input: EnqueueOpportunityEvaluationInput,
): Promise<string | null> {
  const offerId = String(input.offerId ?? "").trim();
  if (!offerId) return null;

  const { data, error } = await client
    .from("opportunity_evaluation_jobs")
    .upsert(
      {
        offer_id: offerId,
        dedupe_key: input.dedupeKey ?? "latest",
        reason: input.reason ?? "offer_saved",
        status: "queued",
        force_market_refresh: input.forceMarketRefresh === true,
        force_demand_refresh: input.forceDemandRefresh === true,
        force_learning_refresh: input.forceLearningRefresh === true,
        last_error: null,
        locked_until: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "offer_id,dedupe_key" },
    )
    .select("id")
    .single();

  if (error || !data) {
    console.warn("[OpportunityEvaluation] enqueue failed", {
      offer_id: offerId,
      error: error?.message ?? "sem retorno",
    });
    return null;
  }

  return String((data as { id: string }).id);
}

async function claimJobs(client: SupabaseClient, limit: number) {
  const now = new Date().toISOString();
  const lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { data } = await client
    .from("opportunity_evaluation_jobs")
    .select("id,offer_id,attempt_count,max_attempts,status,force_market_refresh,force_demand_refresh,force_learning_refresh")
    // "processing" entra aqui tambem porque o lock pode ter vencido sem o
    // job nunca ter sido marcado succeeded/failed (worker morreu no meio da
    // avaliacao) — sem isso, esses jobs ficam orfaos pra sempre, ja que
    // nenhum outro lugar devolve "processing" pra "queued".
    .in("status", ["queued", "failed", "processing"])
    .lt("attempt_count", 3)
    .or(`locked_until.is.null,locked_until.lt.${now}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  const rows = (data ?? []) as Array<{
    id: string;
    offer_id: string;
    attempt_count: number | null;
    max_attempts: number | null;
    force_market_refresh?: boolean | null;
    force_demand_refresh?: boolean | null;
    force_learning_refresh?: boolean | null;
  }>;

  const claimed: typeof rows = [];
  for (const row of rows) {
    const { data: updated } = await client
      .from("opportunity_evaluation_jobs")
      .update({
        status: "processing",
        started_at: now,
        locked_until: lockedUntil,
        attempt_count: Number(row.attempt_count ?? 0) + 1,
        updated_at: now,
      })
      .eq("id", row.id)
      .in("status", ["queued", "failed", "processing"])
      .select("id,offer_id,attempt_count,max_attempts,status,force_market_refresh,force_demand_refresh,force_learning_refresh")
      .maybeSingle();

    if (updated) claimed.push(updated as (typeof rows)[number]);
  }

  return claimed;
}

export async function processOpportunityEvaluationJobs(
  client: SupabaseClient,
  params: { limit?: number } = {},
): Promise<ProcessOpportunityJobsResult> {
  const jobs = await claimJobs(client, Math.max(1, Math.min(25, params.limit ?? 10)));
  const result: ProcessOpportunityJobsResult = {
    processed: jobs.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    results: [],
  };

  for (const job of jobs) {
    const started = Date.now();
    try {
      console.info("[OpportunityEvaluationJob] started", {
        job_id: job.id,
        offer_id: job.offer_id,
      });

      const evaluation = await evaluateOffer(client, job.offer_id, {
        jobId: job.id,
        reason: "job",
        forceMarketRefresh: job.force_market_refresh === true,
        forceDemandRefresh: job.force_demand_refresh === true,
        forceLearningRefresh: job.force_learning_refresh === true,
      });
      const durationMs = Date.now() - started;

      await client
        .from("opportunity_evaluation_jobs")
        .update({
          status: "succeeded",
          finished_at: new Date().toISOString(),
          duration_ms: durationMs,
          locked_until: null,
          last_error: null,
          result: evaluation,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      result.succeeded += 1;
      result.results.push({
        job_id: job.id,
        offer_id: job.offer_id,
        status: "succeeded",
        duration_ms: durationMs,
        evaluation,
      });
    } catch (error) {
      const durationMs = Date.now() - started;
      const message = error instanceof Error ? error.message : "Falha desconhecida";
      const attempts = Number(job.attempt_count ?? 1);
      const maxAttempts = Number(job.max_attempts ?? 3);
      const finalStatus = attempts >= maxAttempts ? "dead" : "failed";

      await client
        .from("opportunity_evaluation_jobs")
        .update({
          status: finalStatus,
          finished_at: new Date().toISOString(),
          duration_ms: durationMs,
          locked_until: null,
          last_error: message.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      console.warn("[OpportunityEvaluationJob] failed", {
        job_id: job.id,
        offer_id: job.offer_id,
        status: finalStatus,
        error: message,
        duration_ms: durationMs,
      });

      result.failed += 1;
      result.results.push({
        job_id: job.id,
        offer_id: job.offer_id,
        status: "failed",
        duration_ms: durationMs,
        error: message,
      });
    }
  }

  return result;
}
