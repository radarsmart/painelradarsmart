import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { runTikTokPipeline } from "@/lib/tiktok-engine/pipeline";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteParams = {
  params: {
    briefingId: string;
  };
};

function extractBearer(req: NextRequest): string {
  const auth = req.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

export async function POST(req: NextRequest, { params }: RouteParams) {
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

  const briefingId = String(params.briefingId ?? "").trim();
  if (!briefingId) {
    return NextResponse.json({ success: false, error: "briefingId obrigatorio." }, { status: 400 });
  }

  const briefingQuery = await supabaseAdmin
    .from("tiktok_engine_briefings")
    .select("id,status")
    .eq("id", briefingId)
    .maybeSingle();

  if (briefingQuery.error) {
    return NextResponse.json({ success: false, error: briefingQuery.error.message }, { status: 500 });
  }

  if (!briefingQuery.data) {
    return NextResponse.json({ success: false, error: "Briefing nao encontrado." }, { status: 404 });
  }

  try {
    await runTikTokPipeline(briefingId);

    const jobsQuery = await supabaseAdmin
      .from("tiktok_engine_jobs")
      .select("status")
      .eq("briefing_id", briefingId);

    const jobs = jobsQuery.data ?? [];
    const completed = jobs.filter((job) => job.status === "completed").length;
    const failed = jobs.filter((job) => job.status === "failed").length;

    return NextResponse.json({
      success: true,
      briefing_id: briefingId,
      summary: {
        total: jobs.length,
        completed,
        failed,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no pipeline.";

    await supabaseAdmin
      .from("tiktok_engine_briefings")
      .update({
        status: "failed",
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", briefingId);

    return NextResponse.json(
      {
        success: false,
        briefing_id: briefingId,
        error: message,
      },
      { status: 500 },
    );
  }
}
