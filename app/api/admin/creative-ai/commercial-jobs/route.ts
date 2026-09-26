import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { runCommercialGeneration } from "@/lib/commercial-video/runner/commercial-generation-runner";
import { computeProgressForStatus } from "@/lib/commercial-video/jobs/commercial-job-progress";
import { createJob, finalizeJob, getJob, listJobs, updateJobStage } from "@/lib/commercial-video/jobs/commercial-job-repository";
import { toApiJob } from "@/lib/commercial-video/jobs/commercial-job-view";
import { buildReusableNarrationRecords, buildReusableSceneCandidates } from "@/lib/commercial-video/runner/execute/reusable-candidates";
import type { ListJobsFilter } from "@/lib/commercial-video/jobs/types";
import type { CampaignExecutionPlan } from "@/lib/generation-orchestrator/types";
import type { RunnerJobStatus, RunnerMode } from "@/lib/commercial-video/runner/types";

const VALID_MODES: RunnerMode[] = ["DRY_RUN", "EXECUTE"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type CreateJobBody = {
  campaignId?: string;
  mode?: string;
  maxVideoCredits?: number;
  maxTtsCredits?: number;
  maxCostUSD?: number;
  // EXECUTE Controlado V1 - confirmacao explicita obrigatoria (ver
  // checkExecutionGuards). Ignorado em DRY_RUN.
  confirmed?: boolean;
};

type CampaignRow = {
  id: string;
  offer_id: string | null;
  name: string;
  creative_brief:
    | (Record<string, unknown> & {
        generationPlan?: CampaignExecutionPlan;
        creativeDirectorVersion?: string;
        commercialDirectionV2?: { storyboardQualityGate?: { status?: string } };
        persuasionEngineVersion?: string;
        commercialPersuasion?: { persuasionStrategy?: { qualityGate?: { status?: string } } };
      })
    | null;
};

/**
 * POST /api/admin/creative-ai/commercial-jobs
 *
 * IMPORTANTE: nesta V1, "job COMPLETED" significa "o DRY_RUN terminou com
 * sucesso" - NUNCA "o video comercial foi produzido". EXECUTE e
 * explicitamente rejeitado (ver EXECUTE_NOT_ENABLED) - nao existe worker,
 * fila ou geracao real nesta fase.
 */
export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const body = (await req.json().catch(() => null)) as CreateJobBody | null;
  const campaignId = String(body?.campaignId ?? "").trim();
  const mode = String(body?.mode ?? "").trim() as RunnerMode;

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId é obrigatório." }, { status: 400 });
  }

  if (!VALID_MODES.includes(mode)) {
    return NextResponse.json(
      { error: 'mode precisa ser "DRY_RUN" ou "EXECUTE".', errorCode: "EXECUTE_NOT_ENABLED" },
      { status: 400 },
    );
  }

  const maxVideoCredits = typeof body?.maxVideoCredits === "number" ? body.maxVideoCredits : null;
  const maxTtsCredits = typeof body?.maxTtsCredits === "number" ? body.maxTtsCredits : null;
  const maxUsdCostCents = typeof body?.maxCostUSD === "number" ? Math.round(body.maxCostUSD * 100) : null;
  const confirmed = body?.confirmed === true;

  try {
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("creative_campaigns")
      .select("id,offer_id,name,creative_brief")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaignError) throw new Error(campaignError.message);
    if (!campaign) {
      return NextResponse.json({ error: "Campanha não encontrada.", errorCode: "CAMPAIGN_NOT_FOUND" }, { status: 404 });
    }

    const campaignRow = campaign as unknown as CampaignRow;

    const { job, reused } = await createJob({
      campaignId,
      offerId: campaignRow.offer_id,
      mode,
      createdByUserId: adminGuard.userId,
      createdByEmail: adminGuard.email,
    });

    // Ja existia um job ATIVO equivalente - nunca criamos um segundo nem
    // rodamos o Runner de novo por cima dele (ver item 5/18 do enunciado).
    if (reused) {
      return NextResponse.json({ success: true, reused: true, job: toApiJob(job) });
    }

    const generationPlan = campaignRow.creative_brief?.generationPlan;
    if (!generationPlan) {
      await finalizeJob({
        jobId: job.id,
        status: "FAILED",
        progressPercent: computeProgressForStatus("FAILED", 0),
        result: null,
        errorCode: "CAMPAIGN_NOT_PREPARED",
        errorMessage: "Campanha ainda não tem Generation Plan - rode /prepare-generation antes de criar um job.",
      });
      const failedJob = await getJob(job.id);
      return NextResponse.json({ success: false, job: toApiJob(failedJob ?? job) }, { status: 200 });
    }

    const executionPlan: CampaignExecutionPlan = {
      campaignId,
      mode: generationPlan.mode,
      promptPlan: generationPlan.promptPlan,
      scenes: generationPlan.scenes,
      estimatedCost: generationPlan.estimatedCost,
    };

    const narrationInputs = await loadNarrationInputs(campaignRow.offer_id, campaignRow.name);

    // EXECUTE Controlado V1 - resume (item 24/28): reaproveita outputs
    // JA validos de um job ANTERIOR (terminal) da MESMA campanha+modo, sem
    // pagar de novo. createJob() ja garante que so chegamos aqui quando
    // NENHUM job ATIVO existia - qualquer job encontrado abaixo e sempre
    // terminal (COMPLETED/BLOCKED/FAILED). Nunca se aplica a DRY_RUN.
    let existingSceneAssetCandidates: ReturnType<typeof buildReusableSceneCandidates> = [];
    let existingNarrationExecutionRecords: ReturnType<typeof buildReusableNarrationRecords> = [];
    if (mode === "EXECUTE") {
      const previousJobs = await listJobs({ campaignId, mode: "EXECUTE", limit: 5 });
      const previousJob = previousJobs.find((j) => j.id !== job.id && j.runner_result) ?? null;
      existingSceneAssetCandidates = buildReusableSceneCandidates(previousJob?.runner_result ?? null, executionPlan.scenes);
      existingNarrationExecutionRecords = buildReusableNarrationRecords(previousJob?.runner_result ?? null);
    }

    let lastKnownProgress = 0;

    // Creative Director V2 (opcional) - so quando a campanha esta marcada
    // como V2 E ja tem commercialDirectionV2 persistido
    // (/build-commercial-direction-v2). Campanhas V1 (versao ausente ou
    // "V1") nunca preenchem isso - Execution Readiness se comporta
    // exatamente como antes (ver execution-readiness.ts#BLOCKED_CREATIVE_QUALITY).
    // creative_brief ja foi buscado inteiro acima - nenhuma query nova.
    const creativeQualityGateStatus =
      campaignRow.creative_brief?.creativeDirectorVersion === "V2"
        ? ((campaignRow.creative_brief?.commercialDirectionV2?.storyboardQualityGate?.status as
            | "PASS"
            | "PASS_WITH_OBSERVATIONS"
            | "FAIL"
            | undefined) ?? null)
        : null;
    const commercialPersuasionGateStatus =
      campaignRow.creative_brief?.persuasionEngineVersion === "V1"
        ? ((campaignRow.creative_brief?.commercialPersuasion?.persuasionStrategy?.qualityGate?.status as
            | "PASS"
            | "PASS_WITH_OBSERVATIONS"
            | "FAIL"
            | undefined) ?? null)
        : null;

    const result = await runCommercialGeneration({
      executionPlan,
      mode,
      confirmed,
      maxVideoCredits,
      maxTtsCredits,
      maxUsdCostCents,
      acknowledgeUnknownVideoCost: true,
      existingSceneAssetCandidates,
      existingNarrationExecutionRecords,
      narrationOffer: narrationInputs.offer,
      narrationProduct: narrationInputs.product,
      productIntelligenceCategory: narrationInputs.category,
      creativeQualityGateStatus,
      commercialPersuasionGateStatus,
      assetCacheDir: "/tmp/commercial-jobs-cache",
      onStateChange: async (transition) => {
        lastKnownProgress = computeProgressForStatus(transition.to, lastKnownProgress);
        await updateJobStage(job.id, transition, lastKnownProgress);
      },
    });

    const finalStatus = result.status as Extract<RunnerJobStatus, "COMPLETED" | "BLOCKED" | "FAILED">;
    await finalizeJob({
      jobId: job.id,
      status: finalStatus,
      progressPercent: computeProgressForStatus(finalStatus, lastKnownProgress),
      result,
      errorCode: finalStatus === "FAILED" ? "RUNNER_EXCEPTION" : null,
      errorMessage: result.errors[0] ?? null,
    });

    const finalJob = await getJob(job.id);
    return NextResponse.json({ success: finalStatus !== "FAILED", job: toApiJob(finalJob ?? job) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar job de geração de comercial." },
      { status: 500 },
    );
  }
}

/**
 * GET /api/admin/creative-ai/commercial-jobs
 * Filtros simples: campaignId, status, mode, limit.
 */
export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const url = new URL(req.url);
  const filter: ListJobsFilter = {
    campaignId: url.searchParams.get("campaignId") ?? undefined,
    status: (url.searchParams.get("status") as RunnerJobStatus | null) ?? undefined,
    mode: (url.searchParams.get("mode") as RunnerMode | null) ?? undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
  };

  try {
    const jobs = await listJobs(filter);
    return NextResponse.json({ jobs: jobs.map(toApiJob), total: jobs.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao listar jobs." }, { status: 500 });
  }
}

async function loadNarrationInputs(
  offerId: string | null,
  fallbackTitle: string,
): Promise<{ offer: { title: string; rating: number | null; reviewsCount: number | null }; product: { keyBenefits: string[] } | null; category: string }> {
  if (!offerId) {
    return { offer: { title: fallbackTitle, rating: null, reviewsCount: null }, product: null, category: "geral" };
  }

  const { data: offerRow } = await supabaseAdmin
    .from("offers")
    .select("title,rating,reviews_count")
    .eq("id", offerId)
    .maybeSingle();

  const { data: piRow } = await supabaseAdmin
    .from("product_intelligence")
    .select("category,key_benefits")
    .eq("offer_id", offerId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    offer: {
      title: offerRow?.title ?? fallbackTitle,
      rating: offerRow?.rating ?? null,
      reviewsCount: offerRow?.reviews_count ?? null,
    },
    product: piRow ? { keyBenefits: (piRow.key_benefits as string[] | null) ?? [] } : null,
    category: piRow?.category ?? "geral",
  };
}
