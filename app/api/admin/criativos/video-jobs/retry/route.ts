import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type AiVideoJobRow = {
  id: string;
  product_name: string | null;
  status: string | null;
  input: Record<string, unknown> | null;
  original_job_id?: string | null;
  attempt_number?: number | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getNextAttemptNumber(rootJobId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("ai_video_jobs")
    .select("id,attempt_number,original_job_id")
    .or(`id.eq.${rootJobId},original_job_id.eq.${rootJobId}`);

  if (error) {
    throw new Error(`Falha ao calcular tentativas: ${error.message}`);
  }

  const attempts = (data ?? [])
    .map((row) => Number((row as { attempt_number?: unknown }).attempt_number ?? 1))
    .filter((value) => Number.isFinite(value));

  return Math.max(1, ...attempts) + 1;
}

export async function POST(request: NextRequest) {
  const adminGuard = await requireAdmin(request);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { jobId?: string };
    const jobId = String(body.jobId ?? "").trim();

    if (!isUuid(jobId)) {
      return NextResponse.json({ error: "jobId obrigatorio." }, { status: 400 });
    }

    const { data: job, error } = await supabaseAdmin
      .from("ai_video_jobs")
      .select("id,product_name,status,input,original_job_id,attempt_number")
      .eq("id", jobId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: `Falha ao carregar job: ${error.message}` },
        { status: 500 },
      );
    }

    if (!job) {
      return NextResponse.json({ error: "Job nao encontrado." }, { status: 404 });
    }

    const failedJob = job as AiVideoJobRow;
    if (failedJob.status !== "failed") {
      return NextResponse.json(
        { error: "Apenas jobs com falha podem ser reprocessados." },
        { status: 409 },
      );
    }

    const rootJobId = failedJob.original_job_id || failedJob.id;
    const attemptNumber = await getNextAttemptNumber(rootJobId);
    const retryInput = {
      ...asRecord(failedJob.input),
      jobId: undefined,
      retryOfJobId: rootJobId,
      attemptNumber,
    };

    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    const authorization = request.headers.get("authorization");
    if (authorization) headers.set("Authorization", authorization);

    const response = await fetch(new URL("/api/ai/video/full-pipeline", request.url), {
      method: "POST",
      headers,
      body: JSON.stringify(retryInput),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return NextResponse.json(
        {
          error: String(payload.error ?? "Falha ao reprocessar job."),
          originalJobId: rootJobId,
          attemptNumber,
        },
        { status: response.status },
      );
    }

    return NextResponse.json({
      success: true,
      originalJobId: rootJobId,
      retryJobId: payload.jobId,
      attemptNumber,
      videoUrl: payload.videoUrl,
    });
  } catch (error) {
    console.error("[/api/admin/criativos/video-jobs/retry] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno." },
      { status: 500 },
    );
  }
}
