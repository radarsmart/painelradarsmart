import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { getModelById } from "@/lib/tiktok-engine/models";
import { validateGeneratePayload } from "@/lib/tiktok-engine/pipeline";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type JobResponse = {
  job_id: string;
  model_id: number;
  model_name: string;
  status: string;
};

function extractBearer(req: NextRequest): string {
  const auth = req.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

export async function POST(req: NextRequest) {
  const bearerToken = extractBearer(req);
  if (!bearerToken) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Authorization Bearer token obrigatorio." },
      { status: 401 },
    );
  }

  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = await req.json();
    const validation = validateGeneratePayload(body);
    if (!validation.valid || !validation.data) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const payload = validation.data;

    const briefingInsert = await supabaseAdmin
      .from("tiktok_engine_briefings")
      .insert({
        ...payload,
        status: "pending",
        created_by_user_id: isUuid(adminGuard.userId) ? adminGuard.userId : null,
        created_by_email: adminGuard.email,
      })
      .select("id")
      .single();

    if (briefingInsert.error || !briefingInsert.data) {
      throw new Error(briefingInsert.error?.message ?? "Falha ao criar briefing.");
    }

    const briefingId = String(briefingInsert.data.id);
    const selectedModels = payload.model_ids
      .map((modelId) => getModelById(modelId))
      .filter((model): model is NonNullable<typeof model> => Boolean(model));

    const jobsPayload = selectedModels.map((model) => ({
      briefing_id: briefingId,
      model_id: model.id,
      model_name: model.name,
      status: "pending",
    }));

    const jobsInsert = await supabaseAdmin
      .from("tiktok_engine_jobs")
      .insert(jobsPayload)
      .select("id,model_id,model_name,status");

    if (jobsInsert.error) {
      throw new Error(jobsInsert.error.message);
    }

    const jobsResponse: JobResponse[] = (jobsInsert.data ?? []).map((job) => ({
      job_id: String(job.id),
      model_id: Number(job.model_id),
      model_name: String(job.model_name),
      status: String(job.status),
    }));

    return NextResponse.json({
      success: true,
      briefing_id: briefingId,
      jobs: jobsResponse,
      status_url: `/api/tiktok-engine/status/${briefingId}`,
      run_url: `/api/tiktok-engine/run/${briefingId}`,
      message: `Briefing criado: ${jobsPayload.length} video(s) prontos para execucao.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno ao criar briefing.",
      },
      { status: 500 },
    );
  }
}
