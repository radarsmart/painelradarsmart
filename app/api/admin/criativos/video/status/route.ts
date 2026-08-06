import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Usada pelo admin (CriativosUgcManager.tsx) pra dar polling no progresso do
// job de video, no lugar do spinner bloqueante que existia antes esperando
// a rota sincrona antiga terminar.
export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId é obrigatório." }, { status: 400 });
  }

  try {
    const { data: job, error: jobError } = await supabaseAdmin
      .from("ugc_video_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (jobError) throw new Error(jobError.message);
    if (!job) return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });

    const { data: scenes, error: scenesError } = await supabaseAdmin
      .from("ugc_video_job_scenes")
      .select("id,scene_index,scene_type,status,attempts,fallback_reason,result_url")
      .eq("job_id", jobId)
      .order("scene_index", { ascending: true });
    if (scenesError) throw new Error(scenesError.message);

    return NextResponse.json({ job, scenes: scenes ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao consultar status do vídeo." },
      { status: 500 },
    );
  }
}
