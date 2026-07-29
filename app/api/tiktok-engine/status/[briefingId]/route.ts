import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteParams = { params: { briefingId: string } };

function computeProgress(total: number, completed: number) {
  if (total <= 0) return "0%";
  return `${Math.round((completed / total) * 100)}%`;
}

function computeOverallStatus(
  total: number,
  completed: number,
  failed: number,
  inProgress: number,
) {
  if (total === 0) return "pending";
  if (completed === total) return "completed";
  if (failed === total) return "failed";
  if (completed > 0 && failed > 0 && completed + failed === total) {
    return "partial_failed";
  }
  if (inProgress > 0) return "processing";
  return "pending";
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const briefingId = params.briefingId;
  if (!briefingId) {
    return NextResponse.json({ error: "briefingId inválido." }, { status: 400 });
  }

  try {
    const briefingQuery = await supabaseAdmin
      .from("tiktok_engine_briefings")
      .select("id,product_name,status,created_at,updated_at,last_error")
      .eq("id", briefingId)
      .maybeSingle();
    if (briefingQuery.error) throw new Error(briefingQuery.error.message);
    if (!briefingQuery.data) {
      return NextResponse.json({ error: "Briefing não encontrado." }, { status: 404 });
    }

    const jobsQuery = await supabaseAdmin
      .from("tiktok_engine_jobs")
      .select(
        "id,model_id,model_name,status,script_title,video_url,audio_url,error_message,log_steps,hook_variation_index,hook_variation_text,render_metadata,created_at,updated_at",
      )
      .eq("briefing_id", briefingId)
      .order("created_at", { ascending: true });
    if (jobsQuery.error) throw new Error(jobsQuery.error.message);

    const jobs = jobsQuery.data ?? [];
    const total = jobs.length;
    const completed = jobs.filter((job) => job.status === "completed").length;
    const failed = jobs.filter((job) => job.status === "failed").length;
    const inProgress = jobs.filter((job) =>
      [
        "script_generating",
        "script_done",
        "script_failed",
        "script",
        "audio",
        "avatar",
        "processing",
        "rendering_video",
        "video_uploading",
        "video_submitted",
        "video_rendering",
      ].includes(job.status),
    ).length;

    return NextResponse.json({
      briefing_id: briefingId,
      product_name: briefingQuery.data.product_name,
      overall_status: computeOverallStatus(total, completed, failed, inProgress),
      progress: computeProgress(total, completed),
      summary: {
        total,
        completed,
        failed,
        in_progress: inProgress,
      },
      jobs: jobs.map((job) => ({
        job_id: job.id,
        model_id: job.model_id,
        model_name: job.model_name,
        status: job.status,
        script_title: job.script_title,
        video_url: job.video_url,
        audio_url: job.audio_url,
        error: job.error_message,
        log_steps: job.log_steps ?? [],
        hook_variation_index: job.hook_variation_index ?? null,
        hook_variation_text: job.hook_variation_text ?? null,
        render_metadata: job.render_metadata ?? null,
      })),
      briefing_status: briefingQuery.data.status,
      last_error: briefingQuery.data.last_error,
      created_at: briefingQuery.data.created_at,
      updated_at: briefingQuery.data.updated_at,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao consultar status.",
      },
      { status: 500 },
    );
  }
}
